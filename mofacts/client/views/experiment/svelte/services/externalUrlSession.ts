import { Session } from 'meteor/session';

/**
 * External-url session runtime helpers (issue #239).
 *
 * Pure helpers for the ExternalUrlSession.svelte component: the lesson-built
 * URL resolution, the completion-origin allowlist, and the completion
 * payload extraction. Kept pure + unit-testable (the Svelte component wires
 * them to the DOM).
 */

export interface ExternalUrlContext {
  sessionId?: string;
  target?: string;
  token?: string;
  mofactsUrl?: string;
  /** The psynaptix endpoint the external session page lives on. */
  psynaptixUrl?: string;
  /** Licensed MoFaCTS TDF id (portal handoff uses a separate psx-* sessionId). */
  tdfId?: string;
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Resolve a unit's urlTemplate placeholders:
 *   {{sessionId}}   the current psynaptix session id
 *   {{target}}      setspec.experimentTarget
 *   {{token}}       the handoff/psynaptix token if available
 *   {{mofactsUrl}}  the mofacts origin (so the external page can post back)
 *   {{psynaptixUrl}} the psynaptix endpoint (where the session page lives)
 *   {{tdfId}}       the MoFaCTS TDF id used for Psynaptix license checks
 * Unknown placeholders are preserved verbatim (never silently dropped).
 * A missing known value renders as an empty segment (the external page
 * treats it as optional).
 */
export function resolveExternalUrl(template: string, ctx: ExternalUrlContext): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = ctx[name as keyof ExternalUrlContext];
    return typeof value === 'string' ? value : '';
  });
}

/**
 * Origin allowlist for the completion postMessage — the SAME pattern as the
 * calibration controller: only accept messages from the opened tab's origin
 * (the external page's origin). Anything else is ignored.
 */
export function isAllowedCompletionOrigin(eventOrigin: string, expectedOrigin: string): boolean {
  try {
    return new URL(eventOrigin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * Origins that may post completion: deliverySettings endpoint and/or the
 * resolved session URL (covers missing endpoint or host alias drift).
 */
export function resolveCompletionAllowlistOrigins(
  ...candidates: Array<string | undefined | null>
): string[] {
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const origin = new URL(candidate).origin;
      if (seen.has(origin)) continue;
      seen.add(origin);
      origins.push(origin);
    } catch {
      /* ignore unparseable */
    }
  }
  return origins;
}

export function isCompletionOriginAllowed(
  eventOrigin: string,
  allowlistOrigins: string[],
): boolean {
  return allowlistOrigins.some((origin) => isAllowedCompletionOrigin(eventOrigin, origin));
}

/** Cross-origin backup when opener postMessage is dropped (#312 follow-up). */
export function buildCalibrationResumeUrl(
  psynaptixBaseOrSessionUrl: string,
  sessionId: string,
): string | null {
  const sid = sessionId.trim();
  if (!sid || !psynaptixBaseOrSessionUrl.trim()) return null;
  try {
    const base = new URL(psynaptixBaseOrSessionUrl);
    return `${base.origin}/calibrate/resume?sessionId=${encodeURIComponent(sid)}`;
  } catch {
    return null;
  }
}

export function isTerminalCalibrationResumeStatus(status: unknown): boolean {
  return status === 'completed' || status === 'aborted';
}

export function buildSyntheticExternalComplete(
  completionType: string,
  sessionId: string,
  status: 'completed' | 'aborted' | string = 'completed',
  at: number = Date.now(),
): ExternalCompleteSignal {
  return {
    type: completionType,
    sessionId,
    at,
    result: {
      sessionId,
      status: status === 'aborted' ? 'aborted' : 'calibrated',
      completedAt: new Date(at).toISOString(),
      source: 'calibrate-resume-poll',
    },
  };
}

/**
 * Resume-poll unlock only — enables Continue on the MoFaCTS card without
 * auto-advancing (#272). Assessment must not start while the learner is still
 * on the calibration tab.
 */
export function buildCalibrationReadySignal(
  sessionId: string,
  at: number = Date.now(),
): ExternalCompleteSignal {
  return {
    type: 'psynaptix:calibration-complete',
    sessionId,
    at,
  };
}

export interface ExternalCompletionPayload {
  type: string;
  result?: unknown;
}

/**
 * Extract the completion payload from a postMessage event. Returns null for
 * anything that is not the declared completionType.
 */
export function extractCompletionPayload(
  data: unknown,
  completionType: string,
): ExternalCompletionPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== completionType) return null;
  return { type: String(record.type), result: record.result };
}

/**
 * Issue #272: messages that mean the external calibration/session finished
 * enough for MoFaCTS to offer Continue (allowlisted origin only).
 */
export function isExternalSessionReadyMessage(data: unknown, completionType: string): boolean {
  if (extractCompletionPayload(data, completionType)) return true;
  if (typeof data !== 'object' || data === null) return false;
  const type = (data as Record<string, unknown>).type;
  return type === 'psynaptix:calibration-complete' || type === 'external-url-complete';
}

/**
 * Issue #307: resilient completion channels shared with psynaptix `/session`
 * by convention only (no shared code imports). BroadcastChannel +
 * localStorage only help when MoFaCTS and psynaptix share an origin (e.g.
 * reverse-proxied under one host). Cross-origin handoff still relies on
 * `window.opener` postMessage; `/session` re-posts on "Return to MoFaCTS".
 *
 * When opener is null (strict COOP, user opened the URL manually, opener
 * closed): no postMessage reaches MoFaCTS — use Continue anyway, or fix COOP
 * to `same-origin-allow-popups` and open with `rel=opener`.
 */
export const EXTERNAL_COMPLETE_CHANNEL = 'psynaptix-mofacts-external';
export const EXTERNAL_COMPLETE_STORAGE_KEY = 'psynaptix:external-url-complete';
/** Ignore stale completion signals left in storage from a prior attempt. */
export const EXTERNAL_COMPLETE_MAX_AGE_MS = 30 * 60 * 1000;

export interface ExternalCompleteSignal {
  type: string;
  result?: unknown;
  sessionId?: string;
  at?: number;
}

/**
 * Parse a BroadcastChannel / localStorage completion envelope.
 * Returns null when the payload is not a usable ready/completion signal.
 */
export function parseExternalCompleteSignal(
  data: unknown,
  completionType: string,
): ExternalCompleteSignal | null {
  if (!isExternalSessionReadyMessage(data, completionType)) return null;
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const signal: ExternalCompleteSignal = { type: String(record.type) };
  if ('result' in record) signal.result = record.result;
  if (typeof record.sessionId === 'string' && record.sessionId.trim()) {
    signal.sessionId = record.sessionId.trim();
  }
  if (typeof record.at === 'number' && Number.isFinite(record.at)) {
    signal.at = record.at;
  }
  return signal;
}

/**
 * True when the signal is recent enough and (when both sides supply an id)
 * targets this lesson's external session.
 */
export function isFreshMatchingExternalComplete(
  signal: ExternalCompleteSignal | null,
  opts: { sessionId?: string | null; now?: number; maxAgeMs?: number } = {},
): boolean {
  if (!signal) return false;
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? EXTERNAL_COMPLETE_MAX_AGE_MS;
  if (typeof signal.at === 'number' && now - signal.at > maxAgeMs) return false;
  const expected = typeof opts.sessionId === 'string' ? opts.sessionId.trim() : '';
  const got = typeof signal.sessionId === 'string' ? signal.sessionId.trim() : '';
  if (expected && got && expected !== got) return false;
  return true;
}

/**
 * Read a pending same-origin completion from localStorage (issue #307).
 */
export function readPendingExternalComplete(
  raw: string | null,
  completionType: string,
  opts: { sessionId?: string | null; now?: number; maxAgeMs?: number } = {},
): ExternalCompleteSignal | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const signal = parseExternalCompleteSignal(parsed, completionType);
  return isFreshMatchingExternalComplete(signal, opts) ? signal : null;
}

export interface PortalHandoffParams {
  psynaptixSessionId?: string;
  handoffToken?: string;
}

/**
 * Issue #273 / #619: read portal handoff query params from the experiment URL.
 */
export function readPortalHandoffParams(search: string): PortalHandoffParams {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const out: PortalHandoffParams = {};
  const psynaptixSessionId = q.get('psynaptixSessionId')?.trim();
  const handoffToken = q.get('handoffToken')?.trim();
  if (psynaptixSessionId) out.psynaptixSessionId = psynaptixSessionId;
  if (handoffToken) out.handoffToken = handoffToken;
  return out;
}

/**
 * Persist portal handoff into Session before sign-in navigates away from
 * `/experiment/…?psynaptixSessionId=&handoffToken=` (#619). Safe to call
 * repeatedly; empty params are a no-op.
 *
 * Prefer `window.location.search`; optionally merge FlowRouter queryParams
 * when the router has already parsed them.
 */
export function capturePortalHandoffFromLocation(
  search: string,
  setSession: (key: string, value: string) => void = (key, value) => {
    Session.set(key, value);
  },
  queryParams?: Record<string, unknown> | null,
): PortalHandoffParams {
  const fromSearch = readPortalHandoffParams(search);
  const qpSid =
    typeof queryParams?.psynaptixSessionId === 'string'
      ? queryParams.psynaptixSessionId.trim()
      : '';
  const qpTok =
    typeof queryParams?.handoffToken === 'string'
      ? queryParams.handoffToken.trim()
      : '';
  const handoff: PortalHandoffParams = {
    ...(fromSearch.psynaptixSessionId || qpSid
      ? { psynaptixSessionId: fromSearch.psynaptixSessionId || qpSid }
      : {}),
    ...(fromSearch.handoffToken || qpTok
      ? { handoffToken: fromSearch.handoffToken || qpTok }
      : {}),
  };
  if (handoff.psynaptixSessionId) {
    setSession('psynaptixSessionId', handoff.psynaptixSessionId);
  }
  if (handoff.handoffToken) {
    setSession('portalHandoffToken', handoff.handoffToken);
  }
  return handoff;
}

/**
 * Prefer the portal-bound psynaptix session id over MoFaCTS ids.
 */
export function resolveExternalSessionId(opts: {
  portalSessionId?: string | null;
  tdfId?: string | null;
  attemptId?: string | null;
  userId?: string | null;
}): string | undefined {
  const portal = typeof opts.portalSessionId === 'string' ? opts.portalSessionId.trim() : '';
  if (portal) return portal;
  return opts.tdfId || opts.attemptId || opts.userId || undefined;
}

/**
 * The tab-closed-without-completion fallback: browsers leave
 * window.open handles with a closed property after the popup closes. A tab
 * that closed without posting completion counts as a failed attempt
 * (recalibrate = re-open / retry).
 */
export function isTabClosed(tabHandle: Window | null): boolean {
  return tabHandle === null || tabHandle.closed === true;
}

/**
 * Issue #242 gate-off: true when the CURRENT unit is an externalurl unit.
 * The in-lesson instrumented machinery (the calibration overlay + the
 * bridge emission) must be INERT for external-url units - the external
 * page owns calibration, trials, and markers. Instrumented lessons (the
 * deliverySettings psynaptix config on a NON-external-url unit) keep the
 * legacy path until the migration is done.
 */
export function isExternalUrlUnitActive(): boolean {
  const unit = Session.get('currentTdfUnit') as Record<string, unknown> | undefined;
  return Boolean(unit && typeof unit === 'object' && unit.externalurl);
}
