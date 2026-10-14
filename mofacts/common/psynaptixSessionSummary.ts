/**
 * Allowlisted session-summary payload for Histories (mofacts-fork #286).
 *
 * Full Psynaptix `result` blobs must not land in `input` / `responseValue` /
 * `result`. Keep metrics and opaque ids only.
 */

const ALLOWED_SUMMARY_KEYS = [
  'trials',
  'correct',
  'incorrect',
  'skipped',
  'durationMs',
  'completedAt',
  'sessionId',
  'tdfId',
  'eventId',
  'providerIds',
  'signalCounts',
  'quality',
] as const;

export type PsynaptixSessionSummary = {
  [K in typeof ALLOWED_SUMMARY_KEYS[number]]?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pick allowlisted metric/id fields from a raw session result. */
export function sanitizePsynaptixSessionSummary(raw: unknown): PsynaptixSessionSummary {
  if (!isPlainObject(raw)) return {};
  const out: PsynaptixSessionSummary = {};
  for (const key of ALLOWED_SUMMARY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      const value = raw[key];
      if (key === 'providerIds' && Array.isArray(value)) {
        out.providerIds = value.filter((entry) => typeof entry === 'string').slice(0, 32);
        continue;
      }
      if (key === 'signalCounts' && isPlainObject(value)) {
        const counts: Record<string, number> = {};
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'number' && Number.isFinite(v)) counts[k] = v;
        }
        out.signalCounts = counts;
        continue;
      }
      if (key === 'quality' && (typeof value === 'number' || typeof value === 'string')) {
        out.quality = value;
        continue;
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        (out as Record<string, unknown>)[key] = value;
      }
    }
  }
  return out;
}

export function serializePsynaptixSessionSummary(raw: unknown): string {
  return JSON.stringify(sanitizePsynaptixSessionSummary(raw));
}

export const PSYNAPTIX_SESSION_SUMMARY_ALLOWED_KEYS = [...ALLOWED_SUMMARY_KEYS];
