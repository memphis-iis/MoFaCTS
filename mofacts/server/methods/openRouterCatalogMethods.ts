import { Meteor } from 'meteor/meteor';
import {
  isOpenRouterReasoningLevel,
  OPENROUTER_REASONING_LEVELS,
  parseOpenRouterModelCatalog,
  type OpenRouterModelCatalogEntry,
  type OpenRouterProviderReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import { requireAuthenticatedUser } from '../lib/methodAuthorization';

export const OPENROUTER_MODEL_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_MODEL_CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;
export const OPENROUTER_MODEL_CATALOG_TIMEOUT_MS = 15 * 1000;

const OPENROUTER_MODEL_NAME_COLLATOR = new Intl.Collator('en', {
  sensitivity: 'base',
});

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
};

type OpenRouterCatalogMethodsDeps = {
  serverConsole: (...args: unknown[]) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
};

export type OpenRouterModelCatalogService = {
  getCatalog: () => Promise<OpenRouterModelCatalogEntry[]>;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function readProviderEffort(value: unknown, label: string): OpenRouterProviderReasoningLevel {
  if (!isOpenRouterReasoningLevel(value)) {
    throw new TypeError(`${label} must be one of: ${OPENROUTER_REASONING_LEVELS.join(', ')}`);
  }
  if (value === 'default') {
    throw new TypeError(`${label} cannot use the MoFaCTS-only default value`);
  }
  return value;
}

function sanitizeProviderReasoning(
  value: unknown,
  label: string,
): OpenRouterModelCatalogEntry['reasoning'] {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object when present`);
  }
  if (typeof value.mandatory !== 'boolean') {
    throw new TypeError(`${label}.mandatory must be a boolean`);
  }

  let supportedLevels: OpenRouterProviderReasoningLevel[] | null | undefined;
  if (hasOwn(value, 'supported_efforts')) {
    if (value.supported_efforts === null) {
      supportedLevels = null;
    } else if (Array.isArray(value.supported_efforts)) {
      supportedLevels = value.supported_efforts.map((effort, index) =>
        readProviderEffort(effort, `${label}.supported_efforts[${index}]`));
      if (new Set(supportedLevels).size !== supportedLevels.length) {
        throw new TypeError(`${label}.supported_efforts must not contain duplicates`);
      }
    } else {
      throw new TypeError(`${label}.supported_efforts must be an array, null, or omitted`);
    }
  }

  let defaultLevel: OpenRouterProviderReasoningLevel | null = null;
  if (hasOwn(value, 'default_effort') && value.default_effort !== null) {
    defaultLevel = readProviderEffort(value.default_effort, `${label}.default_effort`);
  }

  return {
    mandatory: value.mandatory,
    ...(supportedLevels !== undefined ? { supportedLevels } : {}),
    defaultLevel,
  };
}

export function sanitizeOpenRouterModelCatalogResponse(
  value: unknown,
): OpenRouterModelCatalogEntry[] {
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length === 0) {
    throw new TypeError('OpenRouter model catalog response.data must be a non-empty array');
  }
  const sanitized = value.data.map((rawModel, index) => {
    const label = `OpenRouter model catalog response.data[${index}]`;
    if (!isRecord(rawModel)) {
      throw new TypeError(`${label} must be an object`);
    }
    return {
      id: readNonEmptyString(rawModel.id, `${label}.id`),
      name: readNonEmptyString(rawModel.name, `${label}.name`),
      reasoning: sanitizeProviderReasoning(rawModel.reasoning, `${label}.reasoning`),
    };
  });
  return parseOpenRouterModelCatalog(sanitized).sort((left, right) => {
    const nameComparison = OPENROUTER_MODEL_NAME_COLLATOR.compare(left.name, right.name);
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function cloneCatalog(models: OpenRouterModelCatalogEntry[]): OpenRouterModelCatalogEntry[] {
  return models.map((model) => ({
    ...model,
    reasoning: model.reasoning
      ? {
        ...model.reasoning,
        ...(Array.isArray(model.reasoning.supportedLevels)
          ? { supportedLevels: [...model.reasoning.supportedLevels] }
          : {}),
      }
      : null,
  }));
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createOpenRouterModelCatalogService(
  deps: OpenRouterCatalogMethodsDeps,
): OpenRouterModelCatalogService {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? OPENROUTER_MODEL_CATALOG_CACHE_TTL_MS;
  const requestTimeoutMs = deps.requestTimeoutMs ?? OPENROUTER_MODEL_CATALOG_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function') {
    throw new Error('OpenRouter model catalog requires a server fetch implementation');
  }
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) {
    throw new Error('OpenRouter model catalog cache TTL must be a positive finite number');
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('OpenRouter model catalog request timeout must be a positive finite number');
  }

  let cached: { expiresAt: number; models: OpenRouterModelCatalogEntry[] } | null = null;
  let pending: Promise<OpenRouterModelCatalogEntry[]> | null = null;

  async function fetchCatalog(): Promise<OpenRouterModelCatalogEntry[]> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(OPENROUTER_MODEL_CATALOG_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      });
    } catch (error) {
      deps.serverConsole('[OpenRouter] model catalog network request failed', {
        message: readErrorMessage(error),
        timedOut: abortController.signal.aborted,
      });
      throw new Meteor.Error(
        'openrouter-model-catalog-request-failed',
        abortController.signal.aborted
          ? 'OpenRouter model catalog request timed out'
          : 'OpenRouter model catalog could not be reached',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      deps.serverConsole('[OpenRouter] model catalog request failed', {
        httpStatus: response.status,
      });
      throw new Meteor.Error(
        'openrouter-model-catalog-request-failed',
        `OpenRouter model catalog returned HTTP ${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch (error) {
      deps.serverConsole('[OpenRouter] model catalog returned invalid JSON', {
        message: readErrorMessage(error),
      });
      throw new Meteor.Error(
        'openrouter-model-catalog-invalid',
        'OpenRouter model catalog returned invalid JSON',
      );
    }

    try {
      return sanitizeOpenRouterModelCatalogResponse(body);
    } catch (error) {
      deps.serverConsole('[OpenRouter] model catalog response failed validation', {
        message: readErrorMessage(error),
      });
      throw new Meteor.Error(
        'openrouter-model-catalog-invalid',
        readErrorMessage(error),
      );
    }
  }

  async function readCatalog(): Promise<OpenRouterModelCatalogEntry[]> {
    const currentTime = now();
    if (cached && currentTime < cached.expiresAt) {
      return cloneCatalog(cached.models);
    }
    if (!pending) {
      pending = fetchCatalog()
        .then((models) => {
          cached = {
            expiresAt: now() + cacheTtlMs,
            models: cloneCatalog(models),
          };
          return models;
        })
        .finally(() => {
          pending = null;
        });
    }
    return cloneCatalog(await pending);
  }

  return { getCatalog: readCatalog };
}

export function createOpenRouterCatalogMethods(
  catalogService: OpenRouterModelCatalogService,
) {
  return {
    getOpenRouterModelCatalog: async function(this: MethodContext) {
      requireAuthenticatedUser(
        this.userId,
        'Must be logged in to read the OpenRouter model catalog',
        401,
      );
      this.unblock?.();
      return catalogService.getCatalog();
    },
  };
}
