import {
  createAiFlowRequestId,
  recordAiFlowEvent,
  type AiFlowTelemetry,
} from './aiFlowLogger';
import { extractJsonObject } from './jsonExtraction';

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

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
  messages: OpenRouterMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey: string;
  requireUsageCost?: boolean;
  telemetry?: AiFlowTelemetry;
};

export type OpenRouterResult<T> = {
  value: T;
  rawContent: string;
  responseBody: unknown;
  costUsd?: number;
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

function openRouterErrorMessage(responseBody: unknown, status: number): string {
  if (isRecord(responseBody) && isRecord(responseBody.error) && typeof responseBody.error.message === 'string') {
    return responseBody.error.message;
  }
  return `OpenRouter request failed with HTTP ${status}`;
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
  });

  let httpStatus: number | undefined;
  try {
    const apiKey = String(options.apiKey || '').trim();
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    const responseFormat = buildResponseFormat(options.intent);
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-OpenRouter-Title': options.intent.title,
      },
      body: JSON.stringify({
        model: trimmedModel,
        messages: options.messages,
        temperature: options.temperature ?? 0,
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        stream: false,
      }),
    });

    httpStatus = response.status;
    const responseBody = await readOpenRouterResponseBody(response);
    if (!response.ok) {
      throw new Error(redactOpenRouterSecrets(openRouterErrorMessage(responseBody, response.status)));
    }

    const rawContent = readOpenRouterMessageContent(
      responseBody,
      options.intent.missingContentMessage || 'OpenRouter response did not include message content.',
    );
    const parsedContent = extractJsonObject(rawContent);
    const result: OpenRouterResult<T> = {
      value: options.intent.parse(parsedContent),
      rawContent,
      responseBody,
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
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function testOpenRouterConnection(apiKey: string, model: string): Promise<OpenRouterConnectionTestResult> {
  const trimmedKey = String(apiKey || '').trim();
  const trimmedModel = String(model || '').trim();
  if (!trimmedKey) {
    return { success: false, message: 'OpenRouter API key is required' };
  }
  if (!trimmedModel) {
    return { success: false, message: 'Default OpenRouter model is required' };
  }

  try {
    await callOpenRouterJson({
      apiKey: trimmedKey,
      model: trimmedModel,
      maxTokens: 16,
      temperature: 0,
      telemetry: {
        surface: 'profile',
        operation: 'connection-test',
      },
      intent: {
        title: 'MoFaCTS Profile OpenRouter Test',
        parse(value) {
          if (!isRecord(value) || value.ok !== true) {
            throw new Error('OpenRouter test response was not valid');
          }
          return value;
        },
        schemaName: 'mofacts_profile_openrouter_test',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
          },
          required: ['ok'],
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
