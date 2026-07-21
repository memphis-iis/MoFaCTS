import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import {
  callOpenRouterEmbeddings,
  callOpenRouterJson,
  redactOpenRouterSecretText,
  type OpenRouterContentPart,
  type OpenRouterMessage,
  type OpenRouterRequestMessage,
} from '../../common/lib/openRouterClient';
import {
  expandOpenRouterCompletionBudget,
  normalizeOpenRouterReasoningLevel,
  validateOpenRouterReasoningLevelForModel,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import type { OpenRouterModelCatalogService } from './openRouterCatalogMethods';
import {
  type ApiKeySource,
  getAdminApiKeyFromSettings,
  getAdminOpenRouterModel,
  getAdminOpenRouterReasoningLevel,
  getTdfOpenRouterModel,
  getTdfOpenRouterReasoningLevel,
  getUserOpenRouterModel,
  getUserOpenRouterReasoningLevel,
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
  openRouterModelCatalogService: OpenRouterModelCatalogService;
  serverConsole: (...args: unknown[]) => void;
};

type OpenRouterResolutionMode = 'preferred' | 'admin';

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMultimodalContent(value: unknown): OpenRouterContentPart[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Meteor.Error(400, 'OpenRouter multimodal message content is required');
  }
  return value.map((part) => {
    if (!isRecord(part)) {
      throw new Meteor.Error(400, 'OpenRouter message content part must be an object');
    }
    const type = normalizeString(part.type);
    if (type === 'text') {
      const text = normalizeString(part.text);
      if (!text) {
        throw new Meteor.Error(400, 'OpenRouter text content is required');
      }
      return { type: 'text' as const, text };
    }
    if (type === 'image_url' && isRecord(part.image_url)) {
      const url = normalizeString(part.image_url.url);
      if (!/^data:image\/(?:avif|bmp|gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
        throw new Meteor.Error(400, 'OpenRouter image content must be a base64 image data URL');
      }
      return { type: 'image_url' as const, image_url: { url } };
    }
    throw new Meteor.Error(400, 'OpenRouter message content part type is invalid');
  });
}

function normalizeMessages(value: unknown): OpenRouterRequestMessage[] {
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
    if (Array.isArray(entry.content)) {
      if (role !== 'user') {
        throw new Meteor.Error(400, 'Only OpenRouter user messages may contain images');
      }
      return { role: 'user' as const, content: normalizeMultimodalContent(entry.content) };
    }
    const content = normalizeString(entry.content);
    if (!content) {
      throw new Meteor.Error(400, 'OpenRouter message content is required');
    }
    return { role: role as OpenRouterMessage['role'], content };
  });
}

async function resolveOpenRouterConfiguration(deps: ApiKeyResolutionDeps, params: {
  userId: string;
  tdfId?: string | null;
  keySource?: ApiKeySource;
}): Promise<{ model: string; reasoningLevel: OpenRouterReasoningLevel }> {
  if (params.keySource === 'tdf') {
    if (params.tdfId) {
      const tdf = await deps.getTdfById(params.tdfId);
      return {
        model: getTdfOpenRouterModel(tdf),
        reasoningLevel: getTdfOpenRouterReasoningLevel(tdf),
      };
    }
    return { model: '', reasoningLevel: 'none' };
  }

  if (params.keySource === 'user') {
    const user = await deps.getUserById(params.userId);
    return {
      model: getUserOpenRouterModel(user),
      reasoningLevel: getUserOpenRouterReasoningLevel(user),
    };
  }

  if (params.keySource === 'admin' && deps.getAdminApiKeySettings) {
    const settings = await deps.getAdminApiKeySettings();
    return {
      model: getAdminOpenRouterModel(settings),
      reasoningLevel: getAdminOpenRouterReasoningLevel(settings),
    };
  }

  return { model: '', reasoningLevel: 'none' };
}

async function validateResolvedOpenRouterConfiguration(
  deps: OpenRouterMethodsDeps,
  configuration: { model: string; reasoningLevel: OpenRouterReasoningLevel },
): Promise<{ model: string; reasoningLevel: OpenRouterReasoningLevel }> {
  if (!configuration.model) return configuration;
  const catalog = await deps.openRouterModelCatalogService.getCatalog();
  const catalogModel = catalog.find((entry) => entry.id === configuration.model);
  if (!catalogModel) {
    throw new Meteor.Error(
      'openrouter-model-unavailable',
      `Configured OpenRouter model ${JSON.stringify(configuration.model)} is not available in the current model catalog`,
    );
  }
  try {
    return {
      model: configuration.model,
      reasoningLevel: validateOpenRouterReasoningLevelForModel(
        configuration.reasoningLevel,
        catalogModel,
        'Configured OpenRouter reasoning level',
      ),
    };
  } catch (error) {
    throw new Meteor.Error(
      'invalid-openrouter-reasoning-level',
      error instanceof Error ? error.message : 'Configured OpenRouter reasoning level is invalid',
    );
  }
}

async function resolveOpenRouterCredentials(
  deps: OpenRouterMethodsDeps,
  userId: string,
  tdfId: string | null,
  mode: OpenRouterResolutionMode,
) {
  const resolverDeps = deps.getApiKeyResolutionDeps();
  if (mode === 'admin') {
    if (!resolverDeps.getAdminApiKeySettings) {
      throw new Meteor.Error(
        'admin-api-key-settings-unavailable',
        'Admin OpenRouter settings are unavailable',
      );
    }
    const settings = await resolverDeps.getAdminApiKeySettings();
    const configuration = await validateResolvedOpenRouterConfiguration(deps, {
      model: getAdminOpenRouterModel(settings),
      reasoningLevel: getAdminOpenRouterReasoningLevel(settings),
    });
    return {
      apiKey: getAdminApiKeyFromSettings(resolverDeps, settings, 'openrouter'),
      source: 'admin' as const,
      ...configuration,
    };
  }

  const keyResolution = await resolvePreferredApiKey(resolverDeps, {
    userId,
    tdfId,
    kind: 'openrouter',
  });
  const configuration = await validateResolvedOpenRouterConfiguration(
    deps,
    await resolveOpenRouterConfiguration(resolverDeps, {
      userId,
      tdfId,
      keySource: keyResolution.source,
    }),
  );
  return {
    apiKey: keyResolution.apiKey,
    source: keyResolution.source,
    ...configuration,
  };
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
  mode: OpenRouterResolutionMode = 'preferred',
) {
  const tdfId = normalizeString(tdfIdValue) || null;
  const credentials = await resolveOpenRouterCredentials(deps, userId, tdfId, mode);
  return {
    configured: Boolean(credentials.apiKey && credentials.model),
    source: credentials.source,
    model: credentials.model,
    reasoningLevel: credentials.reasoningLevel,
  };
}

async function executeResolvedOpenRouterJson(
  deps: OpenRouterMethodsDeps,
  userId: string,
  params: unknown,
  operation: string,
  mode: OpenRouterResolutionMode = 'preferred',
) {
  check(params, Match.ObjectIncluding({
    messages: Array,
    intent: Object,
  }));
  const data = params as UnknownRecord;
  const tdfId = normalizeString(data.tdfId) || null;
  const credentials = await resolveOpenRouterCredentials(deps, userId, tdfId, mode);
  if (!credentials.apiKey) {
    throw new Meteor.Error('no-api-key', 'No configured OpenRouter API key alternative is available');
  }
  const { model, reasoningLevel } = credentials;
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
      apiKey: credentials.apiKey,
      model,
      reasoningLevel,
      messages: normalizeMessages(data.messages),
      requireUsageCost: data.requireUsageCost === true,
      intent: openRouterIntent,
    };
    if (typeof data.temperature === 'number') {
      callOptions.temperature = data.temperature;
    }
    if (typeof data.maxTokens === 'number') {
      callOptions.maxTokens = expandOpenRouterCompletionBudget(data.maxTokens, reasoningLevel);
    }
    if (isRecord(data.telemetry)) {
      callOptions.telemetry = data.telemetry;
    }
    const result = await callOpenRouterJson(callOptions);
    return {
      request: result.requestBody,
      rawContent: result.rawContent,
      parsedContent: result.value,
      responseBody: result.responseBody,
      costUsd: result.costUsd,
      source: credentials.source,
      model,
      reasoningLevel,
    };
  } catch (error) {
    throw redactProviderError(deps, operation, error);
  }
}

function validateSchemaValue(value: unknown, schema: unknown, path = '$'): string[] {
  if (!isRecord(schema)) return [`${path} schema must be an object.`];
  const errors: string[] = [];
  const allowedTypes = Array.isArray(schema.type) ? schema.type.map(String) : schema.type ? [String(schema.type)] : [];
  const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (allowedTypes.length > 0 && !allowedTypes.includes(actualType) && !(actualType === 'integer' && allowedTypes.includes('number'))) {
    return [`${path} must be ${allowedTypes.join(' or ')}.`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
    errors.push(`${path} is not an allowed enum value.`);
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path} is shorter than ${schema.minLength}.`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path} is longer than ${schema.maxLength}.`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} is below ${schema.minimum}.`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} is above ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path} has fewer than ${schema.minItems} items.`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path} has more than ${schema.maxItems} items.`);
    if (schema.items) value.forEach((entry, index) => errors.push(...validateSchemaValue(entry, schema.items, `${path}[${index}]`)));
  }
  if (isRecord(value)) {
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    required.forEach((key) => { if (!(key in value)) errors.push(`${path}.${key} is required.`); });
    const properties = isRecord(schema.properties) ? schema.properties : {};
    Object.entries(value).forEach(([key, entry]) => {
      if (properties[key]) errors.push(...validateSchemaValue(entry, properties[key], `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed.`);
    });
  }
  return errors;
}

function adminLabReasoningLevel(value: unknown): OpenRouterReasoningLevel {
  if (value === undefined || value === null || value === false) return 'none';
  if (!isRecord(value)) throw new Meteor.Error(400, 'OpenRouter reasoning must be an object when supplied');
  if (value.enabled === true && value.effort === undefined) return 'default';
  return normalizeOpenRouterReasoningLevel(value.effort, 'Admin Tests OpenRouter reasoning effort');
}

function assertSafeAdminRequest(value: UnknownRecord): void {
  const serialized = JSON.stringify(value);
  if (serialized.length > 2_000_000) throw new Meteor.Error(400, 'Admin Tests OpenRouter request is too large');
  if (/"(?:authorization|api_?key)"\s*:/i.test(serialized)) {
    throw new Meteor.Error(400, 'Admin Tests request must not include credentials');
  }
  if (value.stream !== false) throw new Meteor.Error(400, 'Admin Tests OpenRouter requests must set stream to false');
}

async function executeAdminOpenRouterRequest(
  deps: OpenRouterMethodsDeps,
  userId: string,
  request: unknown,
) {
  if (!isRecord(request)) throw new Meteor.Error(400, 'Admin Tests OpenRouter request must be an object');
  assertSafeAdminRequest(request);
  const credentials = await resolveOpenRouterCredentials(deps, userId, null, 'admin');
  if (!credentials.apiKey) throw new Meteor.Error('no-api-key', 'No configured admin OpenRouter API key is available');
  const model = normalizeString(request.model) || credentials.model;
  const reasoningLevel = adminLabReasoningLevel(request.reasoning);
  await validateResolvedOpenRouterConfiguration(deps, { model, reasoningLevel });
  const responseFormat = isRecord(request.response_format) ? request.response_format : null;
  const jsonSchema = responseFormat?.type === 'json_schema' && isRecord(responseFormat.json_schema)
    ? responseFormat.json_schema
    : null;
  const schema = jsonSchema && isRecord(jsonSchema.schema) ? jsonSchema.schema : undefined;
  const strictSchema = jsonSchema?.strict === true;
  const provider = isRecord(request.provider) ? request.provider : undefined;
  const startedAt = new Date();
  const startedMs = Date.now();
  try {
    const options: Parameters<typeof callOpenRouterJson>[0] = {
      apiKey: credentials.apiKey,
      model,
      reasoningLevel,
      messages: normalizeMessages(request.messages),
      ...(provider ? { provider } : {}),
      intent: {
        title: 'MoFaCTS Admin AI Content Prompt Lab',
        ...(jsonSchema && normalizeString(jsonSchema.name) ? { schemaName: normalizeString(jsonSchema.name) } : {}),
        ...(schema ? { schema } : {}),
        strictSchema,
        missingContentMessage: 'OpenRouter Prompt Lab response did not include message content.',
        parse(value) { return value; },
      },
      telemetry: { surface: 'admin-tests', operation: 'ai-content-prompt-lab' },
    };
    if (typeof request.temperature === 'number') options.temperature = request.temperature;
    if (typeof request.max_tokens === 'number') options.maxTokens = request.max_tokens;
    const result = await callOpenRouterJson(options);
    const parsedContent = result.value;
    const validationErrors = schema ? validateSchemaValue(parsedContent, schema) : [];
    const responseRecord = isRecord(result.responseBody) ? result.responseBody : {};
    const resolvedModel = normalizeString(responseRecord.model) || model;
    return {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      requestWithoutCredentials: request,
      rawContent: result.rawContent,
      parsedContent,
      responseBody: result.responseBody,
      usage: isRecord(responseRecord.usage) ? responseRecord.usage : null,
      validation: { ok: validationErrors.length === 0, errors: validationErrors },
      costUsd: result.costUsd,
      source: credentials.source,
      requestedModel: model,
      model: resolvedModel,
      reasoningLevel,
    };
  } catch (error) {
    const summary = summarizeProviderError(error);
    deps.serverConsole('[OpenRouter] request failed', { operation: 'admin-prompt-lab', ...summary });
    throw new Meteor.Error('openrouter-request-failed', providerReason(summary), JSON.stringify(summary));
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
      return resolveOpenRouterCapability(deps, userId, null, 'admin');
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
      return executeResolvedOpenRouterJson(deps, userId, params, 'admin-test-json', 'admin');
    },

    callAdminTestOpenRouterRequest: async function(this: MethodContext, request: unknown) {
      const userId = await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in to run the Admin Tests Prompt Lab',
        forbiddenMessage: 'Only admins can run the Admin Tests Prompt Lab',
      });
      return executeAdminOpenRouterRequest(deps, userId, request);
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
