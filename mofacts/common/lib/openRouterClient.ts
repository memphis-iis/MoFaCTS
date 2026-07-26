import {
  createAiFlowRequestId,
  recordAiFlowEvent,
  type AiFlowTelemetry,
} from './aiFlowLogger';
import { extractJsonValue } from './jsonExtraction';
import {
  normalizeOpenRouterReasoningLevel,
  type OpenRouterReasoningLevel,
} from './openRouterModelCatalog';

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type OpenRouterMultimodalMessage = {
  role: 'user';
  content: OpenRouterContentPart[];
};

export type OpenRouterRequestMessage = OpenRouterMessage | OpenRouterMultimodalMessage;

export type OpenRouterJsonSchema = Record<string, unknown>;

export type OpenRouterIntent<T> = {
  title: string;
  schemaName?: string;
  schema?: OpenRouterJsonSchema;
  strictSchema?: boolean;
  parse: (value: unknown) => T;
  missingContentMessage?: string;
};

export type OpenRouterCallOptions<T> = {
  intent: OpenRouterIntent<T>;
  messages: OpenRouterRequestMessage[];
  model: string;
  reasoningLevel?: OpenRouterReasoningLevel;
  temperature?: number;
  maxTokens?: number;
  supportedParameters?: readonly string[];
  apiKey: string;
  requireUsageCost?: boolean;
  telemetry?: AiFlowTelemetry;
  provider?: Record<string, unknown>;
};

export type OpenRouterResult<T> = {
  value: T;
  rawContent: string;
  responseBody: unknown;
  requestBody: Record<string, unknown>;
  costUsd?: number;
};

export type OpenRouterResponseDiagnostics = Readonly<{
  providerRequestId?: string;
  providerName?: string;
  providerErrorType?: string;
  providerErrorCode?: string | number;
  retryAfterSeconds?: number;
  rateLimitLimit?: string;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  rateLimitLimitRequests?: string;
  rateLimitLimitTokens?: string;
  rateLimitRemainingRequests?: string;
  rateLimitRemainingTokens?: string;
  rateLimitResetRequests?: string;
  rateLimitResetTokens?: string;
  retryAfterMs?: number;
  responseModel?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}>;

type OpenRouterRequestDiagnostics = Readonly<{
  requestBodyBytes: number;
  messageCharacters: number;
  maxTokensRequested?: number;
  strictSchema: boolean;
  requireParameters?: boolean;
  allowFallbacks?: boolean;
}>;

export class OpenRouterHttpError extends Error {
  readonly httpStatus: number;
  readonly diagnostics: OpenRouterResponseDiagnostics;

  constructor(message: string, httpStatus: number, diagnostics: OpenRouterResponseDiagnostics) {
    super(message);
    this.name = 'OpenRouterHttpError';
    this.httpStatus = httpStatus;
    this.diagnostics = diagnostics;
  }
}

export type OpenRouterEmbeddingResult = {
  embeddings: number[][];
  responseBody: unknown;
  costUsd?: number;
};

export type OpenRouterEmbeddingOptions = {
  apiKey: string;
  model: string;
  input: string[];
  telemetry?: AiFlowTelemetry;
};

export type OpenRouterConnectionTestResult = {
  success: boolean;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redactOpenRouterSecrets(message: string): string {
  return message.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
}

export function redactOpenRouterSecretText(message: string): string {
  return redactOpenRouterSecrets(message);
}

function getOpenRouterReferer(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
}

async function readOpenRouterResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      return {};
    }
    throw new Error('OpenRouter response was empty');
  }
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`OpenRouter returned non-JSON response for HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    throw new Error('OpenRouter returned non-JSON response');
  }
}

function readOpenRouterMessageContent(responseBody: unknown, missingContentMessage: string): string {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) {
    throw new Error(missingContentMessage);
  }
  const firstChoice = responseBody.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string') {
    throw new Error(missingContentMessage);
  }
  const content = firstChoice.message.content.trim();
  if (!content) {
    throw new Error(missingContentMessage);
  }
  return content;
}

function readOpenRouterCost(responseBody: unknown): number {
  if (!isRecord(responseBody) || !isRecord(responseBody.usage) || typeof responseBody.usage.cost !== 'number') {
    throw new Error('OpenRouter response did not include usage.cost; this request cannot enforce its cost policy');
  }
  return responseBody.usage.cost;
}

function optionalOpenRouterCost(responseBody: unknown): number | undefined {
  return isRecord(responseBody) && isRecord(responseBody.usage) && typeof responseBody.usage.cost === 'number'
    ? responseBody.usage.cost
    : undefined;
}

function openRouterErrorMessage(responseBody: unknown, status: number): string {
  if (isRecord(responseBody) && isRecord(responseBody.error) && typeof responseBody.error.message === 'string') {
    const details = [`OpenRouter request failed with HTTP ${status}: ${responseBody.error.message}`];
    if (typeof responseBody.error.code === 'number' || typeof responseBody.error.code === 'string') {
      details.push(`code ${String(responseBody.error.code)}`);
    }
    const metadata = isRecord(responseBody.error.metadata) ? responseBody.error.metadata : null;
    if (metadata) {
      if (typeof metadata.provider_name === 'string' && metadata.provider_name.trim()) {
        details.push(`provider ${metadata.provider_name.trim()}`);
      }
      const raw = typeof metadata.raw === 'string' ? metadata.raw.trim() : '';
      if (raw) {
        details.push(raw.slice(0, 500));
      }
    }
    return details.join('; ');
  }
  return `OpenRouter request failed with HTTP ${status}`;
}

function openRouterMalformedSuccessMessage(responseBody: unknown): string {
  if (isRecord(responseBody) && isRecord(responseBody.error) && typeof responseBody.error.message === 'string') {
    return responseBody.error.message;
  }
  const keys = isRecord(responseBody) ? Object.keys(responseBody).join(', ') : typeof responseBody;
  return `OpenRouter embedding response did not include data; top-level response keys: ${keys}`;
}

function buildResponseFormat(intent: OpenRouterIntent<unknown>): Record<string, unknown> | undefined {
  if (!intent.schema) {
    return undefined;
  }
  return {
    type: 'json_schema',
    json_schema: {
      name: intent.schemaName || 'mofacts_response',
      strict: intent.strictSchema === true,
      schema: intent.schema,
    },
  };
}

function readHeader(response: Response, name: string): string | undefined {
  const value = response.headers.get(name)?.trim();
  return value || undefined;
}

function readFiniteHeaderNumber(response: Response, name: string): number | undefined {
  const value = readHeader(response, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function responseDiagnostics(response: Response, responseBody: unknown): OpenRouterResponseDiagnostics {
  const error = isRecord(responseBody) && isRecord(responseBody.error) ? responseBody.error : undefined;
  const metadata = error && isRecord(error.metadata) ? error.metadata : undefined;
  const usage = isRecord(responseBody) && isRecord(responseBody.usage) ? responseBody.usage : undefined;
  const responseModel = isRecord(responseBody) && typeof responseBody.model === 'string'
    ? responseBody.model.trim()
    : undefined;
  const providerRequestId = readHeader(response, 'x-openrouter-request-id')
    ?? readHeader(response, 'x-request-id');
  const retryAfterSeconds = readFiniteHeaderNumber(response, 'retry-after');
  const retryAfterMs = readFiniteHeaderNumber(response, 'retry-after-ms');
  const rateLimitLimit = readHeader(response, 'x-ratelimit-limit');
  const rateLimitRemaining = readHeader(response, 'x-ratelimit-remaining');
  const rateLimitReset = readHeader(response, 'x-ratelimit-reset');
  const rateLimitLimitRequests = readHeader(response, 'x-ratelimit-limit-requests');
  const rateLimitLimitTokens = readHeader(response, 'x-ratelimit-limit-tokens');
  const rateLimitRemainingRequests = readHeader(response, 'x-ratelimit-remaining-requests');
  const rateLimitRemainingTokens = readHeader(response, 'x-ratelimit-remaining-tokens');
  const rateLimitResetRequests = readHeader(response, 'x-ratelimit-reset-requests');
  const rateLimitResetTokens = readHeader(response, 'x-ratelimit-reset-tokens');
  const diagnostics: OpenRouterResponseDiagnostics = {
    ...(providerRequestId ? { providerRequestId } : {}),
    ...(metadata && typeof metadata.provider_name === 'string' && metadata.provider_name.trim()
      ? { providerName: metadata.provider_name.trim() }
      : {}),
    ...(error && typeof error.type === 'string'
      ? { providerErrorType: error.type }
      : metadata && typeof metadata.error_type === 'string'
        ? { providerErrorType: metadata.error_type }
        : {}),
    ...(error && (typeof error.code === 'number' || typeof error.code === 'string')
      ? { providerErrorCode: error.code }
      : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(rateLimitLimit ? { rateLimitLimit } : {}),
    ...(rateLimitRemaining ? { rateLimitRemaining } : {}),
    ...(rateLimitReset ? { rateLimitReset } : {}),
    ...(rateLimitLimitRequests ? { rateLimitLimitRequests } : {}),
    ...(rateLimitLimitTokens ? { rateLimitLimitTokens } : {}),
    ...(rateLimitRemainingRequests ? { rateLimitRemainingRequests } : {}),
    ...(rateLimitRemainingTokens ? { rateLimitRemainingTokens } : {}),
    ...(rateLimitResetRequests ? { rateLimitResetRequests } : {}),
    ...(rateLimitResetTokens ? { rateLimitResetTokens } : {}),
    ...(responseModel ? { responseModel } : {}),
    ...(usage && typeof usage.prompt_tokens === 'number' ? { promptTokens: usage.prompt_tokens } : {}),
    ...(usage && typeof usage.completion_tokens === 'number' ? { completionTokens: usage.completion_tokens } : {}),
    ...(usage && typeof usage.total_tokens === 'number' ? { totalTokens: usage.total_tokens } : {}),
  };
  return diagnostics;
}

function providerRequiresParameters(provider: Record<string, unknown> | undefined): boolean {
  return provider?.require_parameters === true;
}

function supportedParameterSet(parameters: readonly string[] | undefined): Set<string> | null {
  return parameters ? new Set(parameters) : null;
}

function parameterIsSupported(parameters: Set<string> | null, parameter: string): boolean {
  return !parameters || parameters.has(parameter);
}

export async function callOpenRouterJson<T>(options: OpenRouterCallOptions<T>): Promise<OpenRouterResult<T>> {
  const requestId = options.telemetry?.requestId || createAiFlowRequestId('openrouter');
  const startedAt = Date.now();
  const trimmedModel = String(options.model || '').trim();
  if (!trimmedModel) {
    recordAiFlowEvent({
      ...options.telemetry,
      id: requestId,
      provider: 'openrouter',
      status: 'failed',
      title: options.intent.title,
      model: trimmedModel,
      ...(options.intent.schemaName ? { schemaName: options.intent.schemaName } : {}),
      messageCount: options.messages.length,
      durationMs: Date.now() - startedAt,
      error: 'OpenRouter model is required',
    });
    throw new Error('OpenRouter model is required');
  }

  recordAiFlowEvent({
    ...options.telemetry,
    id: requestId,
    provider: 'openrouter',
    status: 'started',
    title: options.intent.title,
    model: trimmedModel,
    ...(options.intent.schemaName ? { schemaName: options.intent.schemaName } : {}),
    messageCount: options.messages.length,
    messageCharacters: options.messages.reduce((total, message) => total + message.content.length, 0),
    strictSchema: options.intent.strictSchema === true,
  });

  let httpStatus: number | undefined;
  let responseDiagnosticsValue: OpenRouterResponseDiagnostics | undefined;
  let requestDiagnostics: OpenRouterRequestDiagnostics | undefined;
  try {
    const apiKey = String(options.apiKey || '').trim();
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    const reasoningLevel = normalizeOpenRouterReasoningLevel(
      options.reasoningLevel,
      'OpenRouter request reasoning level',
    );
    const responseFormat = buildResponseFormat(options.intent);
    const provider = options.provider
      ?? (responseFormat && options.intent.strictSchema === true
        ? { require_parameters: true, allow_fallbacks: false }
        : undefined);
    const knownSupportedParameters = supportedParameterSet(options.supportedParameters);
    if (
      responseFormat
      && providerRequiresParameters(provider)
      && !parameterIsSupported(knownSupportedParameters, 'response_format')
    ) {
      throw new Error(`Configured OpenRouter model ${JSON.stringify(trimmedModel)} does not support response_format required by strict structured output`);
    }
    const requestBody = {
      model: trimmedModel,
      messages: options.messages,
      ...(reasoningLevel === 'none'
        ? {}
        : {
          reasoning: reasoningLevel === 'default'
            ? { enabled: true }
            : { effort: reasoningLevel },
        }),
      ...(options.temperature !== undefined && parameterIsSupported(knownSupportedParameters, 'temperature')
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxTokens !== undefined && parameterIsSupported(knownSupportedParameters, 'max_tokens')
        ? { max_tokens: options.maxTokens }
        : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(provider ? { provider } : {}),
      stream: false,
    };
    const requestBodyBytes = JSON.stringify(requestBody).length;
    const providerRecord = isRecord(requestBody.provider) ? requestBody.provider : undefined;
    requestDiagnostics = {
      requestBodyBytes,
      messageCharacters: options.messages.reduce((total, message) => total + message.content.length, 0),
      ...(typeof requestBody.max_tokens === 'number' ? { maxTokensRequested: requestBody.max_tokens } : {}),
      strictSchema: options.intent.strictSchema === true,
      ...(providerRecord && providerRecord.require_parameters === true ? { requireParameters: true } : {}),
      ...(providerRecord && providerRecord.allow_fallbacks === false ? { allowFallbacks: false } : {}),
    };
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': getOpenRouterReferer(),
        'X-OpenRouter-Title': options.intent.title,
      },
      body: JSON.stringify(requestBody),
    });

    httpStatus = response.status;
    const responseBody = await readOpenRouterResponseBody(response);
    responseDiagnosticsValue = responseDiagnostics(response, responseBody);
    if (!response.ok) {
      throw new OpenRouterHttpError(
        redactOpenRouterSecrets(openRouterErrorMessage(responseBody, response.status)),
        response.status,
        responseDiagnosticsValue,
      );
    }

    const rawContent = readOpenRouterMessageContent(
      responseBody,
      options.intent.missingContentMessage || 'OpenRouter response did not include message content.',
    );
    const parsedContent = extractJsonValue(rawContent);
    const result: OpenRouterResult<T> = {
      value: options.intent.parse(parsedContent),
      rawContent,
      responseBody,
      requestBody,
    };
    if (options.requireUsageCost) {
      result.costUsd = readOpenRouterCost(responseBody);
    } else if (isRecord(responseBody) && isRecord(responseBody.usage) && typeof responseBody.usage.cost === 'number') {
      result.costUsd = responseBody.usage.cost;
    }
    recordAiFlowEvent({
      ...options.telemetry,
      id: requestId,
      provider: 'openrouter',
      status: 'succeeded',
      title: options.intent.title,
      model: trimmedModel,
      ...(options.intent.schemaName ? { schemaName: options.intent.schemaName } : {}),
      messageCount: options.messages.length,
      durationMs: Date.now() - startedAt,
      httpStatus: response.status,
      ...requestDiagnostics,
      ...responseDiagnosticsValue,
      ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
    });
    return result;
  } catch (error) {
    recordAiFlowEvent({
      ...options.telemetry,
      id: requestId,
      provider: 'openrouter',
      status: 'failed',
      title: options.intent.title,
      model: trimmedModel,
      ...(options.intent.schemaName ? { schemaName: options.intent.schemaName } : {}),
      messageCount: options.messages.length,
      durationMs: Date.now() - startedAt,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...requestDiagnostics,
      ...(responseDiagnosticsValue ? responseDiagnosticsValue : {}),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function callOpenRouterEmbeddings(options: OpenRouterEmbeddingOptions): Promise<OpenRouterEmbeddingResult> {
  const requestId = options.telemetry?.requestId || createAiFlowRequestId('openrouter-embedding');
  const startedAt = Date.now();
  const trimmedModel = String(options.model || '').trim();
  if (!trimmedModel) {
    throw new Error('OpenRouter embedding model is required');
  }
  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('OpenRouter API key is required');
  }
  const input = options.input.map((entry) => String(entry || '').trim());
  if (input.length === 0 || input.some((entry) => !entry)) {
    throw new Error('OpenRouter embeddings require non-empty input strings');
  }

  recordAiFlowEvent({
    ...options.telemetry,
    id: requestId,
    provider: 'openrouter',
    status: 'started',
    title: 'MoFaCTS AutoTutor Relationship Embeddings',
    model: trimmedModel,
    messageCount: input.length,
  });

  let httpStatus: number | undefined;
  try {
    let responseBody: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getOpenRouterReferer(),
          'X-OpenRouter-Title': 'MoFaCTS AutoTutor Relationship Embeddings',
        },
        body: JSON.stringify({
          model: trimmedModel,
          input,
          encoding_format: 'float',
        }),
      });

      httpStatus = response.status;
      responseBody = await readOpenRouterResponseBody(response);
      if (!response.ok) {
        throw new Error(redactOpenRouterSecrets(openRouterErrorMessage(responseBody, response.status)));
      }
      if (isRecord(responseBody) && Array.isArray(responseBody.data)) {
        break;
      }
      if (attempt === 1) {
        throw new Error(openRouterMalformedSuccessMessage(responseBody));
      }
    }
    if (!isRecord(responseBody) || !Array.isArray(responseBody.data)) {
      throw new Error(openRouterMalformedSuccessMessage(responseBody));
    }
    const embeddings = responseBody.data.map((entry, index) => {
      if (!isRecord(entry) || !Array.isArray(entry.embedding)) {
        throw new Error(`OpenRouter embedding response omitted embedding ${index}`);
      }
      const embedding = entry.embedding.map((value) => Number(value));
      if (embedding.length === 0 || embedding.some((value) => !Number.isFinite(value))) {
        throw new Error(`OpenRouter embedding ${index} must be a finite number vector`);
      }
      return embedding;
    });
    if (embeddings.length !== input.length) {
      throw new Error('OpenRouter embedding response count did not match input count');
    }
    const costUsd = optionalOpenRouterCost(responseBody);
    recordAiFlowEvent({
      ...options.telemetry,
      id: requestId,
      provider: 'openrouter',
      status: 'succeeded',
      title: 'MoFaCTS AutoTutor Relationship Embeddings',
      model: trimmedModel,
      messageCount: input.length,
      durationMs: Date.now() - startedAt,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    });
    return {
      embeddings,
      responseBody,
      ...(costUsd !== undefined ? { costUsd } : {}),
    };
  } catch (error) {
    recordAiFlowEvent({
      ...options.telemetry,
      id: requestId,
      provider: 'openrouter',
      status: 'failed',
      title: 'MoFaCTS AutoTutor Relationship Embeddings',
      model: trimmedModel,
      messageCount: input.length,
      durationMs: Date.now() - startedAt,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function testOpenRouterConnection(
  apiKey: string,
  model: string,
  reasoningLevel: OpenRouterReasoningLevel = 'none',
): Promise<OpenRouterConnectionTestResult> {
  const trimmedKey = String(apiKey || '').trim();
  const trimmedModel = String(model || '').trim();
  if (!trimmedKey) {
    return { success: false, message: 'OpenRouter API key is required' };
  }
  if (!trimmedModel) {
    return { success: false, message: 'OpenRouter model is required' };
  }

  try {
    await callOpenRouterJson({
      apiKey: trimmedKey,
      model: trimmedModel,
      reasoningLevel,
      maxTokens: 16,
      temperature: 0,
      telemetry: {
        surface: 'profile',
        operation: 'connection-test',
      },
      intent: {
        title: 'MoFaCTS Profile OpenRouter Test',
        missingContentMessage: 'OpenRouter profile test response did not include message content.',
        parse(value) {
          if (!isRecord(value) || value.ok !== true) {
            throw new Error('OpenRouter test response was not valid');
          }
          return value;
        },
      },
      messages: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: 'Reply with exactly this JSON object: {"ok":true}' },
      ],
    });
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('401') || lowerMessage.includes('403') || lowerMessage.includes('invalid')) {
      return { success: false, message: 'Invalid OpenRouter key' };
    }
    if (lowerMessage.includes('404') || (lowerMessage.includes('model') && lowerMessage.includes('not found'))) {
      return { success: false, message: 'Model not found' };
    }
    if (lowerMessage.includes('402') || lowerMessage.includes('billing') || lowerMessage.includes('quota') || lowerMessage.includes('credits')) {
      return { success: false, message: 'Billing or quota problem' };
    }
    if (lowerMessage.includes('429') || lowerMessage.includes('rate limited')) {
      return { success: false, message: 'Rate limited' };
    }
    if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('504')) {
      return { success: false, message: 'OpenRouter unavailable' };
    }
    return { success: false, message };
  }
}
