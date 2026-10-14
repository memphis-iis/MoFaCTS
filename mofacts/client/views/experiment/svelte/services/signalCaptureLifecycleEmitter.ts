import { Session } from 'meteor/session';
import { clientConsole } from '../../../../lib/clientLogger';
import { pickCaptureSettings } from '../../../../lib/deliverySettingsResolver';
import { isExternalUrlUnitActive } from './externalUrlSession';

/** Generic learning-lifecycle events (capture-service agnostic). */
export type SignalCaptureEventType =
  | 'session-start'
  | 'session-end'
  | 'trial-start'
  | 'stimulus-onset'
  | 'response'
  | 'feedback'
  | 'trial-end';

export interface SignalCaptureLifecycleEvent {
  type: SignalCaptureEventType;
  sessionId: string;
  trialIndex?: number;
  timestampMs: number;
  userId?: string;
  tdfId?: string;
  unitType?: string;
  stimulusId?: string;
  itemId?: string;
  userAnswer?: unknown;
  isCorrect?: unknown;
  isTimeout?: unknown;
  responseTime?: number;
}

export interface CaptureEmissionConfig {
  enabled: boolean;
  endpoint: string;
  authToken?: string;
}

type FetchFn = typeof fetch;

let fetchImpl: FetchFn | null = typeof fetch === 'function' ? fetch.bind(globalThis) : null;

export function setSignalCaptureFetchForTests(fn: FetchFn | null): void {
  fetchImpl = fn;
}

export function resetSignalCaptureEmitterForTests(): void {
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEndpoint(raw: unknown): string {
  const endpoint = trimString(raw);
  if (!endpoint) return '';
  return endpoint.replace(/\/+$/, '');
}

/** Resolve capture settings from deliverySettings with legacy aliases. */
export function resolveCaptureEmissionConfig(
  deliverySettings: Record<string, unknown> | null | undefined,
): CaptureEmissionConfig {
  const picked = pickCaptureSettings(deliverySettings);
  const enabled = picked.enableSignalCapture === true || picked.enablePsynaptix === true;
  const endpoint = normalizeEndpoint(picked.captureApiEndpoint || picked.psynaptixEndpoint);
  const authToken = trimString(picked.captureApiToken) ||
    trimString(Session.get('portalHandoffToken'));
  const config: CaptureEmissionConfig = { enabled, endpoint };
  if (authToken) config.authToken = authToken;
  return config;
}

export function isSignalCaptureEmissionActive(
  deliverySettings: Record<string, unknown> | null | undefined,
): boolean {
  if (isExternalUrlUnitActive()) return false;
  const config = resolveCaptureEmissionConfig(deliverySettings);
  return config.enabled && config.endpoint.length > 0;
}

/** Prefer portal-bound psynaptix session id; fall back to attempt id. */
export function resolveCaptureSessionId(params: {
  portalSessionId?: unknown;
  attemptId?: unknown;
  tdfId?: unknown;
  userId?: unknown;
}): string | undefined {
  const portal = trimString(params.portalSessionId ?? Session.get('psynaptixSessionId'));
  if (portal) return portal;
  const attemptId = trimString(params.attemptId);
  if (attemptId) return attemptId;
  const tdfId = trimString(params.tdfId);
  if (tdfId) return tdfId;
  const userId = trimString(params.userId);
  return userId || undefined;
}

function buildStimulusIdentity(engineIndices: Record<string, unknown> | null | undefined): {
  stimulusId?: string;
  itemId?: string;
} {
  if (!engineIndices || typeof engineIndices !== 'object') return {};
  const clusterIndex = engineIndices.clusterIndex;
  const whichStim = engineIndices.whichStim ?? engineIndices.stimIndex;
  if (typeof clusterIndex !== 'number' && typeof whichStim !== 'number') return {};
  const parts = [
    typeof clusterIndex === 'number' ? String(clusterIndex) : '',
    typeof whichStim === 'number' ? String(whichStim) : '',
  ].filter(Boolean);
  if (!parts.length) return {};
  const id = parts.join(':');
  return { stimulusId: id, itemId: id };
}

export function buildSignalCaptureLifecycleEvent(
  type: SignalCaptureEventType,
  context: Record<string, unknown>,
  timestampMs: number = Date.now(),
): SignalCaptureLifecycleEvent | null {
  if (!isSignalCaptureEmissionActive(context.deliverySettings as Record<string, unknown> | undefined)) {
    return null;
  }
  const sessionId = resolveCaptureSessionId({
    attemptId: context.attemptId,
    tdfId: context.tdfId,
    userId: context.userId,
  });
  if (!sessionId) return null;

  const questionIndex = typeof context.questionIndex === 'number' ? context.questionIndex : 1;
  const trialIndex = Math.max(0, questionIndex - 1);
  const identity = buildStimulusIdentity(
    context.engineIndices as Record<string, unknown> | null | undefined,
  );
  const timestamps = context.timestamps as {
    trialStart?: number;
    trialEnd?: number;
  } | undefined;

  const event: SignalCaptureLifecycleEvent = {
    type,
    sessionId,
    trialIndex,
    timestampMs,
    ...identity,
  };
  const userId = trimString(context.userId);
  const tdfId = trimString(context.tdfId);
  const unitType = trimString(context.testType);
  if (userId) event.userId = userId;
  if (tdfId) event.tdfId = tdfId;
  if (unitType) event.unitType = unitType;

  if (type === 'response' || type === 'feedback' || type === 'trial-end') {
    if (context.userAnswer !== undefined) event.userAnswer = context.userAnswer;
    if (context.isCorrect !== undefined) event.isCorrect = context.isCorrect;
    if (context.isTimeout !== undefined) event.isTimeout = context.isTimeout;
    if (typeof timestamps?.trialStart === 'number' && typeof timestamps?.trialEnd === 'number') {
      event.responseTime = Math.max(0, timestamps.trialEnd - timestamps.trialStart);
    }
  }

  return event;
}

/** Fire-and-forget POST to {endpoint}/events. Never throws. */
export function emitSignalCaptureLifecycleEvent(
  event: SignalCaptureLifecycleEvent,
  deliverySettings?: Record<string, unknown> | null,
): void {
  const config = resolveCaptureEmissionConfig(deliverySettings);
  if (!config.enabled || !config.endpoint || !fetchImpl) return;

  const url = `${config.endpoint}/events`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  void fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
    keepalive: true,
  }).catch((err: unknown) => {
    clientConsole(1, '[SignalCapture] lifecycle emission failed (soft-fail)', {
      type: event.type,
      sessionId: event.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function emitSignalCaptureFromContext(
  type: SignalCaptureEventType,
  context: Record<string, unknown>,
  timestampMs?: number,
): void {
  const event = buildSignalCaptureLifecycleEvent(type, context, timestampMs);
  if (!event) return;
  emitSignalCaptureLifecycleEvent(
    event,
    context.deliverySettings as Record<string, unknown> | undefined,
  );
}
