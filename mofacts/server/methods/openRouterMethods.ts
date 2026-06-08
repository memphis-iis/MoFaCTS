import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { extractJsonObject } from '../../client/lib/jsonExtraction';
import {
  callOpenRouterEmbeddings,
  callOpenRouterJson,
  redactOpenRouterSecretText,
  type OpenRouterMessage,
} from '../../client/lib/openRouterClient';
import {
  getAdminOpenRouterModel,
  getTdfOpenRouterModel,
  getUserOpenRouterModel,
  resolvePreferredApiKey,
  type ApiKeyResolutionDeps,
} from '../lib/apiKeyResolution';
import { requireAuthenticatedUser } from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
};

type OpenRouterMethodsDeps = {
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
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
}) {
  const requestedModel = normalizeString(params.requestedModel);
  if (requestedModel) {
    return requestedModel;
  }

  let tdfModel = '';
  if (params.tdfId) {
    const tdf = await deps.getTdfById(params.tdfId);
    tdfModel = getTdfOpenRouterModel(tdf);
  }
  if (tdfModel) {
    return tdfModel;
  }

  const user = await deps.getUserById(params.userId);
  const userModel = getUserOpenRouterModel(user);
  if (userModel) {
    return userModel;
  }

  if (deps.getAdminApiKeySettings) {
    const adminModel = getAdminOpenRouterModel(await deps.getAdminApiKeySettings());
    if (adminModel) {
      return adminModel;
    }
  }

  return '';
}

function redactProviderError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactOpenRouterSecretText(message));
}

export function createOpenRouterMethods(deps: OpenRouterMethodsDeps) {
  return {
    getOpenRouterCapability: async function(this: MethodContext, tdfId?: string | null) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to read OpenRouter capability', 401);
      const resolverDeps = deps.getApiKeyResolutionDeps();
      const keyResolution = await resolvePreferredApiKey(resolverDeps, {
        userId,
        tdfId: normalizeString(tdfId) || null,
        kind: 'openrouter',
      });
      const model = await resolveOpenRouterModel(resolverDeps, {
        userId,
        tdfId: normalizeString(tdfId) || null,
      });
      return {
        configured: Boolean(keyResolution.apiKey && model),
        source: keyResolution.source,
        model,
      };
    },

    callResolvedOpenRouterJson: async function(this: MethodContext, params: unknown) {
      const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to call OpenRouter', 401);
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
        throw redactProviderError(error);
      }
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
        throw redactProviderError(error);
      }
    },
  };
}
