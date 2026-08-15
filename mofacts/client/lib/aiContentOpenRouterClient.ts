import { Meteor } from 'meteor/meteor';
import { AI_CONTENT_CONTRACT_VERSION } from '../../common/aiContentContract';
import type { OpenRouterJsonSchema, OpenRouterRequestMessage } from '../../common/lib/openRouterClient';
import type { OpenRouterReasoningLevel } from '../../common/lib/openRouterModelCatalog';
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

export const callProductionAiContentStage: AiContentStageCaller = async (call) => {
  const result = await MeteorAny.callAsync('callResolvedOpenRouterJson', {
    model: call.model,
    messages: messages(call),
    maxTokens: call.visibleOutputTokens,
    provider: { require_parameters: true, allow_fallbacks: false },
    telemetry: {
      surface: 'ai-content-creator',
      operation: call.stage,
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      ...(call.itemId ? { itemId: call.itemId } : {}),
    },
    intent: {
      title: `MoFaCTS AI Content ${call.stage}`,
      schemaName: call.schemaName,
      schema: call.schema,
      strictSchema: true,
      missingContentMessage: `OpenRouter did not return AI Content ${call.stage} output.`,
    },
  });
  return {
    parsedContent: result?.parsedContent,
    request: result?.request,
    rawContent: String(result?.rawContent || ''),
    responseBody: result?.responseBody,
    usage: result?.usage,
    costUsd: typeof result?.costUsd === 'number' ? result.costUsd : null,
    model: String(result?.model || call.model),
    reasoningLevel: result?.reasoningLevel as OpenRouterReasoningLevel,
    source: String(result?.source || ''),
    validation: result?.validation,
    execution: result?.execution,
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
