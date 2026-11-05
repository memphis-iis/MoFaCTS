import { proofRecord, proofString, sourceCommit } from './proofFields.ts';

// Scalars on the signed report are observations, not an alternate build/release
// record. Acquisition joins the existing BuildIdentity/ReleaseIdentity contracts.
export type AuditIdentityObservation =
  | { state: 'observed'; value: string }
  | { state: 'unavailable'; reason: 'not-provided' | 'malformed' | 'unresolved' }
  | { state: 'conflicting'; reason: 'independent-observations-disagree' };

export function parseAuditIdentity(value: unknown, kind: 'revision' | 'platform-image'): AuditIdentityObservation {
  if (!value || typeof value !== 'object') throw new Error('Invalid audit identity observation');
  const state = (value as Record<string, unknown>).state;
  if (state === 'observed') {
    const record = proofRecord(value, ['state', 'value']);
    const observed = kind === 'revision' ? sourceCommit(record.value) : proofString(record.value,
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]{1,5})?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+@sha256:[a-f0-9]{64}(?![\s\S])/, 320);
    return { state, value: observed };
  }
  const record = proofRecord(value, ['state', 'reason']);
  if (state === 'unavailable' && ['not-provided', 'malformed', 'unresolved'].includes(String(record.reason))) {
    return { state, reason: record.reason as 'not-provided' | 'malformed' | 'unresolved' };
  }
  if (state === 'conflicting' && record.reason === 'independent-observations-disagree') {
    return { state, reason: record.reason };
  }
  throw new Error('Invalid audit identity observation');
}
