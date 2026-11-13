import { AUTHORIZATION_OUTCOME_CATEGORIES, evaluateAuthorizationOutcome, type AuthorizationOutcomeCategory } from './authorizationOutcomes.ts';
import { AUTHORIZATION_VERIFICATIONS } from './verificationCatalog.ts';
import type { ExpectedAuthorizationPolicy } from './authorizationOutcomes.ts';
import { proofRecord } from './proofFields.ts';

export type AuthorizationCaseOutcome = Readonly<{ verificationId: string; outcome: AuthorizationOutcomeCategory }>;

export function evaluateAuthorizationVerifications(value: unknown) {
  return evaluateSourceVerificationVector(value, AUTHORIZATION_VERIFICATIONS);
}

// Definitions are imported source intent, never protected fixture input. Keep
// the accepted selected vector stable while sharing the exact decision logic.
export function evaluateSourceVerificationVector(value: unknown, definitions: readonly Readonly<{
  verificationId: string; expectedPolicy: ExpectedAuthorizationPolicy; allowedBaselineIds: readonly string[];
}>[]) {
  const byId = new Map(definitions.map(row => [row.verificationId, row]));
  if (!definitions.length || byId.size !== definitions.length
      || definitions.some(row => row.allowedBaselineIds.some(id => !byId.has(id)))
      || !Array.isArray(value) || value.length > definitions.length) throw new Error('Invalid authorization execution evidence');
  const observed = new Map<string, AuthorizationOutcomeCategory>();
  for (const item of value) {
    const row = proofRecord(item, ['verificationId', 'outcome']);
    if (typeof row.verificationId !== 'string' || observed.has(row.verificationId)
      || !AUTHORIZATION_OUTCOME_CATEGORIES.includes(row.outcome as AuthorizationOutcomeCategory)) {
      throw new Error('Invalid authorization execution evidence');
    }
    if (!byId.has(row.verificationId)) throw new Error('Unknown source verification ID');
    observed.set(row.verificationId, row.outcome as AuthorizationOutcomeCategory);
  }
  const results = definitions.map(entry => {
    let outcome = observed.get(entry.verificationId) ?? 'INCONCLUSIVE';
    if (outcome === 'DENIED_BY_POLICY' && entry.allowedBaselineIds.some(id => observed.get(id) !== 'ALLOWED')) outcome = 'INCONCLUSIVE';
    return { verificationId: entry.verificationId, outcome, status: evaluateAuthorizationOutcome(entry.expectedPolicy, outcome) };
  });
  const metrics = {
    expectedCaseCount: definitions.length, completedCaseCount: observed.size,
    matchedCaseCount: results.filter(row => row.status === 'PASS').length,
    domainRejectionCount: results.filter(row => row.outcome === 'DOMAIN_REJECTION').length,
    transportErrorCount: results.filter(row => row.outcome === 'TRANSPORT_OR_RUNNER_ERROR').length,
    inconclusiveCaseCount: results.filter(row => row.outcome === 'INCONCLUSIVE').length,
  };
  return { status: results.some(row => row.status === 'ERROR') ? 'ERROR' as const
    : results.some(row => row.status === 'FAIL') ? 'FAIL' as const : 'PASS' as const, metrics, results };
}
