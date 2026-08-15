import { Meteor } from 'meteor/meteor';
import type { OpenRouterJsonSchema, OpenRouterRequestMessage } from '../../common/lib/openRouterClient';
import {
  normalizeOpenRouterReasoningLevel,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import type { OpenRouterCapability } from './openRouterClientProfile';
import type { AiContentAiStageId } from './aiContentPrompts';

const MeteorAny = Meteor as typeof Meteor & {
  callAsync: (name: string, ...args: any[]) => Promise<any>;
};

export type AiContentStageCall = {
  stage: AiContentAiStageId;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: OpenRouterJsonSchema;
  visibleOutputTokens: number;
  reasoningLevel: OpenRouterReasoningLevel;
  itemId?: string;
};

export type AiContentStageCallResult = {
  parsedContent: unknown;
  request: unknown;
  rawContent: string;
  responseBody: unknown;
  usage: unknown;
  costUsd: number | null;
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
  source?: string;
  validation?: unknown;
  execution?: unknown;
};

export type AiContentStageCaller = (call: AiContentStageCall) => Promise<AiContentStageCallResult>;

function messages(call: AiContentStageCall): OpenRouterRequestMessage[] {
  return [
    { role: 'system', content: call.systemPrompt },
    { role: 'user', content: call.userPrompt },
  ];
}

export function buildAdminAiContentStageRequest(call: AiContentStageCall): Record<string, unknown> {
  return {
    model: call.model,
    reasoningLevel: call.reasoningLevel,
    messages: messages(call),
    max_tokens: call.visibleOutputTokens,
    reasoning: call.reasoningLevel === 'default'
      ? { enabled: true }
      : { effort: call.reasoningLevel },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: call.schemaName,
        strict: true,
        schema: call.schema,
      },
    },
    provider: { require_parameters: true, allow_fallbacks: false },
    stream: false,
  };
}

export function buildAiContentStageRequest(call: AiContentStageCall): Record<string, unknown> {
  return buildAdminAiContentStageRequest(call);
}

export async function getAiContentOpenRouterCapability(): Promise<OpenRouterCapability> {
  const result = await MeteorAny.callAsync('getAiContentOpenRouterCapability');
  return {
    configured: Boolean(result?.configured),
    source: result?.source === 'admin' ? 'admin' : null,
    model: String(result?.model || '').trim(),
    reasoningLevel: normalizeOpenRouterReasoningLevel(
      result?.reasoningLevel,
      'AI Content OpenRouter reasoning level',
    ),
  };
}

export const callAiContentStage: AiContentStageCaller = async (call) => {
  const result = await MeteorAny.callAsync('callAiContentOpenRouterRequest', buildAiContentStageRequest(call));
  return {
    parsedContent: result?.parsedContent,
    request: result?.requestWithoutCredentials,
    rawContent: String(result?.rawContent || ''),
    responseBody: result?.responseBody,
    usage: result?.usage,
    costUsd: typeof result?.costUsd === 'number' ? result.costUsd : null,
    model: String(result?.model || call.model),
    reasoningLevel: result?.reasoningLevel as OpenRouterReasoningLevel,
    source: String(result?.source || ''),
  };
};

export const callAdminLabAiContentStage: AiContentStageCaller = async (call) => {
  const result = await MeteorAny.callAsync('callAdminTestOpenRouterRequest', buildAdminAiContentStageRequest(call));
  return {
    parsedContent: result?.parsedContent,
    request: result?.requestWithoutCredentials,
    rawContent: String(result?.rawContent || ''),
    responseBody: result?.responseBody,
    usage: result?.usage,
    costUsd: typeof result?.costUsd === 'number' ? result.costUsd : null,
    model: String(result?.model || call.model),
    reasoningLevel: result?.reasoningLevel as OpenRouterReasoningLevel,
    source: String(result?.source || ''),
  };
};
