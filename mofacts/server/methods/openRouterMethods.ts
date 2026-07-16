import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { extractJsonObject } from '../../common/lib/jsonExtraction';
import {
  callOpenRouterEmbeddings,
  callOpenRouterJson,
  redactOpenRouterSecretText,
  type OpenRouterMessage,
} from '../../common/lib/openRouterClient';
import {
  type ApiKeySource,
  getAdminOpenRouterModel,
  getTdfOpenRouterModel,
  getUserOpenRouterModel,
  resolvePreferredApiKey,
  type ApiKeyResolutionDeps,
} from '../lib/apiKeyResolution';
import {
  requireAuthenticatedUser,
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
};

type OpenRouterMethodsDeps = {
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  serverConsole: (...args: unknown[]) => void;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMessages(value: unknown): OpenRouterMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Meteor.Error(400, 'OpenRouter messages are required');
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Meteor.Error(400, 'OpenRouter message must be an object');
    }
    const role = normalizeString(entry.role);
    if (!['system', 'user', 'assistant'].includes(role)) {
      throw new Meteor.Error(400, 'OpenRouter message role is invalid');
    }
    const content = normalizeString(entry.content);
    if (!content) {
      throw new Meteor.Error(400, 'OpenRouter message content is required');
    }
    return { role: role as OpenRouterMessage['role'], content };
  });
}

async function resolveOpenRouterModel(deps: ApiKeyResolutionDeps, params: {
  userId: string;
  tdfId?: string | null;
  requestedModel?: unknown;
  keySource?: ApiKeySource;
}) {
  if (params.keySource === 'tdf') {
    if (params.tdfId) {
      const tdf = await deps.getTdfById(params.tdfId);
      return getTdfOpenRouterModel(tdf);
    }
    return '';
  }

  if (params.keySource === 'user') {
    const user = await deps.getUserById(params.userId);
    return getUserOpenRouterModel(user);
  }

  if (params.keySource === 'admin' && deps.getAdminApiKeySettings) {
    const adminModel = getAdminOpenRouterModel(await deps.getAdminApiKeySettings());
    if (adminModel) {
      return adminModel;
    }
  }

  if (params.keySource === 'provided') {
    return normalizeString(params.requestedModel);
  }

  return '';
}

function sanitizeProviderText(value: unknown): string {
  return redactOpenRouterSecretText(String(value || '').trim());
}

function summarizeProviderError(error: unknown): UnknownRecord {
  const summary: UnknownRecord = {};
  if (error instanceof Error) {
    summary.name = sanitizeProviderText(error.name || 'Error');
    summary.message = sanitizeProviderText(error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      summary.causeName = sanitizeProviderText(cause.name || 'Error');
      summary.causeMessage = sanitizeProviderText(cause.message);
      if (isRecord(cause) && typeof cause.code === 'string') {
        summary.causeCode = sanitizeProviderText(cause.code);
      }
    } else if (cause !== undefined) {
      summary.cause = sanitizeProviderText(cause);
    }
  } else {
    summary.message = sanitizeProviderText(error);
  }
  return summary;
}

function providerReason(summary: UnknownRecord) {
  const message = normalizeString(summary.message);
  if (!message) {
    return 'OpenRouter request failed';
  }
  if (message === 'fetch failed') {
    const causeMessage = normalizeString(summary.causeMessage);
    const causeCode = normalizeString(summary.causeCode);
    if (causeMessage || causeCode) {
      return `OpenRouter network request failed${causeCode ? ` (${causeCode})` : ''}${causeMessage ? `: ${causeMessage}` : ''}`;
    }
    return 'OpenRouter network request failed before receiving a response';
  }
  return message;
}

function redactProviderError(deps: OpenRouterMethodsDeps, operation: string, error: unknown): Meteor.Error {
  const summary = summarizeProviderError(error);
  const reason = providerReason(summary);
  deps.serverConsole('[OpenRouter] request failed', {
    operation,
    ...summary,
  });
  return new Meteor.Error('openrouter-request-failed', reason);
}

async function resolveOpenRouterCapability(
  deps: OpenRouterMethodsDeps,
  userId: string,
  tdfIdValue?: string | null,
) {
  const resolverDeps = deps.getApiKeyResolutionDeps();
  const tdfId = normalizeString(tdfIdValue) || null;
  const keyResolution = await resolvePreferredApiKey(resolverDeps, {
    userId,
    tdfId,
    kind: 'openrouter',
  });
  const model = await resolveOpenRouterModel(resolverDeps, {
    userId,
    tdfId,
    keySource: keyResolution.source,
  });
  return {
    configured: Boolean(keyResolution.apiKey && model),
    source: keyResolution.source,
    model,
  };
}

async function executeResolvedOpenRouterJson(
  deps: OpenRouterMethodsDeps,
  userId: string,
  params: unknown,
  operation: string,
) {
  check(params, Match.ObjectIncluding({
    messages: Array,
    intent: Object,
  }));
  const data = params as UnknownRecord;
  const resolverDeps = deps.getApiKeyResolutionDeps();
  const tdfId = normalizeString(data.tdfId) || null;
  const keyResolution = await resolvePreferredApiKey(resolverDeps, {
    userId,
    tdfId,
    kind: 'openrouter',
  });
  if (!keyResolution.apiKey) {
    throw new Meteor.Error('no-api-key', 'No configured OpenRouter API key alternative is available');
  }
  const model = await resolveOpenRouterModel(resolverDeps, {
    userId,
    tdfId,
    requestedModel: data.model,
    keySource: keyResolution.source,
  });
  if (!model) {
    throw new Meteor.Error('no-openrouter-model', 'No configured OpenRouter model is available');
  }
  const intent = isRecord(data.intent) ? data.intent : {};
  const title = normalizeString(intent.title) || 'MoFaCTS OpenRouter';
  const schemaName = normalizeString(intent.schemaName);
  const missingContentMessage = normalizeString(intent.missingContentMessage) || 'OpenRouter response did not include message content.';
  try {
    const openRouterIntent: Parameters<typeof callOpenRouterJson>[0]['intent'] = {
      title,
      ...(schemaName ? { schemaName } : {}),
      ...(isRecord(intent.schema) ? { schema: intent.schema } : {}),
      strictSchema: intent.strictSchema === true,
      missingContentMessage,
      parse(value) {
        return value;
      },
    };
    const callOptions: Parameters<typeof callOpenRouterJson>[0] = {
      apiKey: keyResolution.apiKey,
      model,
      messages: normalizeMessages(data.messages),
      requireUsageCost: data.requireUsageCost === true,
      intent: openRouterIntent,
    };
    if (typeof data.temperature === 'number') {
      callOptions.temperature = data.temperature;
    }
    if (typeof data.maxTokens === 'number') {
      callOptions.maxTokens = data.maxTokens;
    }
    if (isRecord(data.telemetry)) {
      callOptions.telemetry = data.telemetry;
    }
    const result = await callOpenRouterJson(callOptions);
    return {
      rawContent: result.rawContent,
      parsedContent: extractJsonObject(result.rawContent),
      responseBody: result.responseBody,
      costUsd: result.costUsd,
      source: keyResolution.source,
      model,
    };
  } catch (error) {
    throw redactProviderError(deps, operation, error);
  }
}

export function createOpenRouterMethods(deps: OpenRouterMethodsDeps) {
  return {
    getOpenRouterCapability: async function(this: MethodContext, tdfId?: string | null) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to read OpenRouter capability', 401);
      return resolveOpenRouterCapability(deps, userId, tdfId);
    },

    getAdminTestOpenRouterCapability: async function(this: MethodContext) {
      const userId = await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in to run Admin Tests OpenRouter evaluations',
        forbiddenMessage: 'Only admins can run Admin Tests OpenRouter evaluations',
      });
      return resolveOpenRouterCapability(deps, userId);
    },

    callResolvedOpenRouterJson: async function(this: MethodContext, params: unknown) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to call OpenRouter', 401);
      return executeResolvedOpenRouterJson(deps, userId, params, 'json');
    },

    callAdminTestResolvedOpenRouterJson: async function(this: MethodContext, params: unknown) {
      const userId = await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in to run Admin Tests OpenRouter evaluations',
        forbiddenMessage: 'Only admins can run Admin Tests OpenRouter evaluations',
      });
      return executeResolvedOpenRouterJson(deps, userId, params, 'admin-test-json');
    },

    callResolvedOpenRouterEmbeddings: async function(this: MethodContext, params: unknown) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to call OpenRouter embeddings', 401);
      check(params, Match.ObjectIncluding({
        input: Array,
      }));
      const data = params as UnknownRecord;
      const resolverDeps = deps.getApiKeyResolutionDeps();
      const tdfId = normalizeString(data.tdfId) || null;
      const keyResolution = await resolvePreferredApiKey(resolverDeps, {
        userId,
        tdfId,
        kind: 'openrouter',
      });
      if (!keyResolution.apiKey) {
        throw new Meteor.Error('no-api-key', 'No configured OpenRouter API key alternative is available');
      }
      const model = normalizeString(data.model);
      if (!model) {
        throw new Meteor.Error('no-openrouter-model', 'OpenRouter embedding model is required');
      }
      try {
        const embeddingOptions: Parameters<typeof callOpenRouterEmbeddings>[0] = {
          apiKey: keyResolution.apiKey,
          model,
          input: (data.input as unknown[]).map((entry) => normalizeString(entry)),
        };
        if (isRecord(data.telemetry)) {
          embeddingOptions.telemetry = data.telemetry;
        }
        const result = await callOpenRouterEmbeddings(embeddingOptions);
        return {
          ...result,
          source: keyResolution.source,
          model,
        };
      } catch (error) {
        throw redactProviderError(deps, 'embeddings', error);
      }
    },
  };
}
