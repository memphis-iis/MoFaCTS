import { proofBoolean, proofRecord, proofString } from './proofFields.ts';
import type { AuditControlStatus } from './evidenceContracts.ts';

export const AUTHORIZATION_OUTCOME_CATEGORIES = Object.freeze([
  'ALLOWED', 'DENIED_BY_POLICY', 'DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE',
] as const);
export type AuthorizationOutcomeCategory = typeof AUTHORIZATION_OUTCOME_CATEGORIES[number];
export type ExpectedAuthorizationPolicy = 'allow' | 'deny';

const invalid = (): never => { throw new Error('Invalid authorization observation contract'); };
const code = (value: unknown): string => proofString(value, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}(?![\s\S])/, 80);

// The finite Section 5 table is shared by Node and Meteor. It does not establish
// that an observation was executed/classified correctly or that a denied case
// has its required allowed baseline; those remain catalog/acquisition duties.
export function evaluateAuthorizationOutcome(expected: ExpectedAuthorizationPolicy,
  outcome: AuthorizationOutcomeCategory): AuditControlStatus {
  if (!['allow', 'deny'].includes(expected) || !AUTHORIZATION_OUTCOME_CATEGORIES.includes(outcome)) invalid();
  if (outcome === 'DOMAIN_REJECTION' || outcome === 'TRANSPORT_OR_RUNNER_ERROR' || outcome === 'INCONCLUSIVE') return 'ERROR';
  return (expected === 'allow') === (outcome === 'ALLOWED') ? 'PASS' : 'FAIL';
}

export type MethodAuthorizationObservation =
  | { state: 'returned'; allowedObservationMatched: boolean }
  | { state: 'rejected'; code: string }
  | { state: 'transport-error' }
  | { state: 'inconclusive' };

// Only a later source-owned verifier may establish allowedObservationMatched
// from its exact scoped success condition. A fulfilled call alone is not proof.
// Denial codes must come from reviewed source intent, never fixture booleans or
// an arbitrary exception. No code text, response value or operator data escapes.
export function methodAuthorizationOutcome(value: unknown, sourcePolicyDenialCodes: readonly string[]): AuthorizationOutcomeCategory {
  if (!Array.isArray(sourcePolicyDenialCodes) || sourcePolicyDenialCodes.length > 16
    || new Set(sourcePolicyDenialCodes).size !== sourcePolicyDenialCodes.length) invalid();
  const policyCodes = sourcePolicyDenialCodes.map(code);
  if (!value || typeof value !== 'object') invalid();
  const state = (value as Record<string, unknown>).state;
  if (state === 'returned') {
    const observation = proofRecord(value, ['state', 'allowedObservationMatched']);
    return proofBoolean(observation.allowedObservationMatched) ? 'ALLOWED' : 'INCONCLUSIVE';
  }
  if (state === 'rejected') {
    const observation = proofRecord(value, ['state', 'code']);
    return policyCodes.includes(code(observation.code)) ? 'DENIED_BY_POLICY' : 'DOMAIN_REJECTION';
  }
  proofRecord(value, ['state']);
  if (state === 'transport-error') return 'TRANSPORT_OR_RUNNER_ERROR';
  if (state === 'inconclusive') return 'INCONCLUSIVE';
  return invalid();
}

// Scoped publication isolation is a successful ready snapshot, never a failed
// subscription. The caller verifies actor/resource/canary bindings; the runner
// must additionally require the catalog's executed allowed baselines.
export function publicationAuthorizationOutcome(value: unknown, expected: ExpectedAuthorizationPolicy): AuthorizationOutcomeCategory {
  if (!['allow', 'deny'].includes(expected)) invalid();
  const row = proofRecord(value, ['ready', 'readable', 'bindingMatched', 'ownObserved', 'foreignObserved', 'anonymous']);
  const flags = Object.fromEntries(Object.entries(row).map(([key, flag]) => [key, proofBoolean(flag)]));
  if (!flags.ready || !flags.readable || !flags.bindingMatched) return 'INCONCLUSIVE';
  if (expected === 'deny' && flags.foreignObserved) return 'ALLOWED';
  if (expected === 'allow') return flags.ownObserved ? 'ALLOWED' : 'INCONCLUSIVE';
  return flags.anonymous || flags.ownObserved ? 'DENIED_BY_POLICY' : 'INCONCLUSIVE';
}

// A bare 404 is not authorization evidence. Only replay of the exact capability
// consumed by a successful, content-verified baseline proves one-use denial.
export function downloadReplayAuthorizationOutcome(value: unknown): AuthorizationOutcomeCategory {
  const row = proofRecord(value, ['baselineVerified', 'sameCapability', 'status']);
  const verified = proofBoolean(row.baselineVerified), same = proofBoolean(row.sameCapability);
  if (!Number.isInteger(row.status) || Number(row.status) < 100 || Number(row.status) > 599) invalid();
  if (!verified || !same) return 'INCONCLUSIVE';
  if (row.status === 404) return 'DENIED_BY_POLICY';
  if (row.status === 200) return 'ALLOWED';
  return 'DOMAIN_REJECTION';
}
