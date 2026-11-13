import { AUTHENTICATION_RESET_POLICY, RESET_PROTOCOL_VERIFICATIONS } from './verificationCatalog.ts';
import { AUTHORIZATION_OUTCOME_CATEGORIES, methodAuthorizationOutcome, type AuthorizationOutcomeCategory, type MethodAuthorizationObservation } from './authorizationOutcomes.ts';
import { evaluateSourceVerificationVector } from './authorizationVerification.ts';
import { proofBoolean, proofRecord } from './proofFields.ts';

const invalid = (): never => { throw new Error('Invalid reset protocol observation'); };

// A rejected used token proves replay denial, not expiry. Require the exact
// owned, unused record and a coherent expired age/lifespan before that scenario.
export function unusedExpiredResetPrecondition(value: unknown): boolean {
  const row = proofRecord(value, ['owned', 'unused', 'ageMs', 'lifetimeMs', 'remainingMs']);
  const owned = proofBoolean(row.owned), unused = proofBoolean(row.unused);
  if (['ageMs', 'lifetimeMs', 'remainingMs'].some(key => !Number.isSafeInteger(row[key]) || Math.abs(Number(row[key])) > 1e12)
      || Number(row.ageMs) < 0 || Number(row.lifetimeMs) <= 0
      || Number(row.remainingMs) !== Number(row.lifetimeMs) - Number(row.ageMs)) invalid();
  return owned && unused && row.lifetimeMs === AUTHENTICATION_RESET_POLICY.lifetimeMs && Number(row.remainingMs) <= 0;
}

export function resetAttemptOutcome(value: MethodAuthorizationObservation) {
  return methodAuthorizationOutcome(value, AUTHENTICATION_RESET_POLICY.denialCodes);
}

export function evaluateResetProtocol(value: unknown) {
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'currentTokenOwned', 'currentTokenUnused', 'expiredToken', 'results']);
  const ready = proofBoolean(row.bindingsVerified) && proofBoolean(row.environmentLeaseHeld);
  // Parse every field even when another prerequisite is false.
  proofBoolean(row.bindingsVerified); proofBoolean(row.environmentLeaseHeld);
  const currentOwned = proofBoolean(row.currentTokenOwned), currentUnused = proofBoolean(row.currentTokenUnused);
  const expiredReady = unusedExpiredResetPrecondition(row.expiredToken);
  const observations = row.results;
  if (!Array.isArray(observations)) return invalid();
  const observed = observations.map((item: unknown) => {
    const entry = proofRecord(item, ['verificationId', 'outcome']);
    const verificationId = entry.verificationId;
    if (typeof verificationId !== 'string'
        || !AUTHORIZATION_OUTCOME_CATEGORIES.includes(entry.outcome as AuthorizationOutcomeCategory)) return invalid();
    return { verificationId, outcome: entry.outcome as AuthorizationOutcomeCategory };
  });
  // Validate membership/duplicates before replacing unavailable preconditions.
  evaluateSourceVerificationVector(observed, RESET_PROTOCOL_VERIFICATIONS);
  const results = observed.map(entry => ({ ...entry,
    outcome: !ready || entry.verificationId.startsWith('authn.reset.current.') && (!currentOwned || !currentUnused)
      || entry.verificationId.startsWith('authn.reset.expired.') && !expiredReady ? 'INCONCLUSIVE' : entry.outcome }));
  const complete = evaluateSourceVerificationVector(results, RESET_PROTOCOL_VERIFICATIONS);
  const group = (ids: readonly string[]) => {
    const cases = complete.results.filter(entry => ids.includes(entry.verificationId));
    return { status: cases.some(entry => entry.status === 'ERROR') ? 'ERROR' as const
      : cases.some(entry => entry.status === 'FAIL') ? 'FAIL' as const : 'PASS' as const,
    metrics: { expectedCaseCount: cases.length, completedCaseCount: cases.filter(entry => observed.some(item => item.verificationId === entry.verificationId)).length,
      matchedCaseCount: cases.filter(entry => entry.status === 'PASS').length,
      domainRejectionCount: cases.filter(entry => entry.outcome === 'DOMAIN_REJECTION').length,
      transportErrorCount: cases.filter(entry => entry.outcome === 'TRANSPORT_OR_RUNNER_ERROR').length,
      inconclusiveCaseCount: cases.filter(entry => entry.outcome === 'INCONCLUSIVE').length }, results: cases };
  };
  const currentIds = RESET_PROTOCOL_VERIFICATIONS.filter(entry => entry.verificationId.startsWith('authn.reset.current.')).map(entry => entry.verificationId);
  return { current: group(currentIds), replay: group(currentIds),
    expired: group(RESET_PROTOCOL_VERIFICATIONS.filter(entry => !entry.verificationId.endsWith('.replay')).map(entry => entry.verificationId)) };
}
