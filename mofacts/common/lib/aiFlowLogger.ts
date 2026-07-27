export type AiFlowStatus = 'started' | 'succeeded' | 'failed';

export type AiFlowTelemetry = {
  surface?: string;
  operation?: string;
  contractVersion?: number;
  componentId?: string;
  unitType?: string;
  requestId?: string;
  sessionCorrelationId?: string;
  sessionIdApplied?: boolean;
};

export type AiFlowEvent = AiFlowTelemetry & {
  id: string;
  provider: 'openrouter';
  status: AiFlowStatus;
  title: string;
  model?: string;
  schemaName?: string;
  messageCount?: number;
  durationMs?: number;
  httpStatus?: number;
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
  requestBodyBytes?: number;
  messageCharacters?: number;
  maxTokensRequested?: number;
  strictSchema?: boolean;
  requireParameters?: boolean;
  allowFallbacks?: boolean;
  promptTokens?: number;
  cachedPromptTokens?: number;
  cacheWritePromptTokens?: number;
  cacheReadRatio?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheDiscountUsd?: number;
  finishReason?: string;
  nativeFinishReason?: string;
  messageContentCharacters?: number;
  reasoningCharacters?: number;
  costUsd?: number;
  error?: string;
  createdAt: string;
};

export type AiFlowLogSink = (level: number, ...args: unknown[]) => void;

const MAX_AI_FLOW_EVENTS = 200;
const globalAiFlowKey = '__mofactsAiFlowLog';

type AiFlowGlobal = typeof globalThis & {
  [globalAiFlowKey]?: AiFlowEvent[];
};

let aiFlowLogSink: AiFlowLogSink | null = null;

export function setAiFlowLogSink(sink: AiFlowLogSink | null): void {
  aiFlowLogSink = sink;
}

function getEventBuffer(): AiFlowEvent[] {
  const globalScope = globalThis as AiFlowGlobal;
  if (!Array.isArray(globalScope[globalAiFlowKey])) {
    globalScope[globalAiFlowKey] = [];
  }
  return globalScope[globalAiFlowKey]!;
}

function redactAiFlowText(value: string): string {
  return value.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]').slice(0, 500);
}

function summarizeEvent(event: AiFlowEvent): Record<string, unknown> {
  return {
    id: event.id,
    provider: event.provider,
    status: event.status,
    surface: event.surface,
    operation: event.operation,
    componentId: event.componentId,
    unitType: event.unitType,
    sessionCorrelationId: event.sessionCorrelationId,
    title: event.title,
    model: event.model,
    schemaName: event.schemaName,
    messageCount: event.messageCount,
    durationMs: event.durationMs,
    httpStatus: event.httpStatus,
    providerRequestId: event.providerRequestId,
    providerName: event.providerName,
    providerErrorType: event.providerErrorType,
    providerErrorCode: event.providerErrorCode,
    retryAfterSeconds: event.retryAfterSeconds,
    rateLimitLimit: event.rateLimitLimit,
    rateLimitRemaining: event.rateLimitRemaining,
    rateLimitReset: event.rateLimitReset,
    rateLimitLimitRequests: event.rateLimitLimitRequests,
    rateLimitLimitTokens: event.rateLimitLimitTokens,
    rateLimitRemainingRequests: event.rateLimitRemainingRequests,
    rateLimitRemainingTokens: event.rateLimitRemainingTokens,
    rateLimitResetRequests: event.rateLimitResetRequests,
    rateLimitResetTokens: event.rateLimitResetTokens,
    retryAfterMs: event.retryAfterMs,
    responseModel: event.responseModel,
    requestBodyBytes: event.requestBodyBytes,
    messageCharacters: event.messageCharacters,
    maxTokensRequested: event.maxTokensRequested,
    strictSchema: event.strictSchema,
    requireParameters: event.requireParameters,
    allowFallbacks: event.allowFallbacks,
    sessionIdApplied: event.sessionIdApplied,
    promptTokens: event.promptTokens,
    cachedPromptTokens: event.cachedPromptTokens,
    cacheWritePromptTokens: event.cacheWritePromptTokens,
    cacheReadRatio: event.cacheReadRatio,
    completionTokens: event.completionTokens,
    totalTokens: event.totalTokens,
    cacheDiscountUsd: event.cacheDiscountUsd,
    finishReason: event.finishReason,
    nativeFinishReason: event.nativeFinishReason,
    messageContentCharacters: event.messageContentCharacters,
    reasoningCharacters: event.reasoningCharacters,
    costUsd: event.costUsd,
    error: event.error,
    createdAt: event.createdAt,
  };
}

function logAiFlowEvent(level: number, ...args: unknown[]): void {
  if (aiFlowLogSink) {
    aiFlowLogSink(level, ...args);
  }
}

export function createAiFlowRequestId(prefix = 'ai'): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function recordAiFlowEvent(event: Omit<AiFlowEvent, 'createdAt' | 'error'> & { error?: string }): AiFlowEvent {
  const sanitizedEvent: AiFlowEvent = {
    ...event,
    ...(event.error ? { error: redactAiFlowText(event.error) } : {}),
    createdAt: new Date().toISOString(),
  };
  const buffer = getEventBuffer();
  buffer.unshift(sanitizedEvent);
  if (buffer.length > MAX_AI_FLOW_EVENTS) {
    buffer.length = MAX_AI_FLOW_EVENTS;
  }

  const level = sanitizedEvent.status === 'failed' ? 1 : 2;
  logAiFlowEvent(level, '[AI FLOW]', summarizeEvent(sanitizedEvent));
  return sanitizedEvent;
}

export function getRecentAiFlowEvents(): AiFlowEvent[] {
  return getEventBuffer().map((event) => ({ ...event }));
}

export function clearAiFlowEvents(): void {
  getEventBuffer().length = 0;
}
