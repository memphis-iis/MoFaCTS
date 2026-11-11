import { AUTHORIZATION_OUTCOME_CATEGORIES, evaluateAuthorizationOutcome, type AuthorizationOutcomeCategory } from './authorizationOutcomes.ts';
import { AUTHORIZATION_VERIFICATIONS, auditVerification } from './verificationCatalog.ts';
import { proofRecord } from './proofFields.ts';

export type AuthorizationCaseOutcome = Readonly<{ verificationId: string; outcome: AuthorizationOutcomeCategory }>;

export function evaluateAuthorizationVerifications(value: unknown) {
  if (!Array.isArray(value) || value.length > AUTHORIZATION_VERIFICATIONS.length) throw new Error('Invalid authorization execution evidence');
  const observed = new Map<string, AuthorizationOutcomeCategory>();
  for (const item of value) {
    const row = proofRecord(item, ['verificationId', 'outcome']);
    if (typeof row.verificationId !== 'string' || observed.has(row.verificationId)
      || !AUTHORIZATION_OUTCOME_CATEGORIES.includes(row.outcome as AuthorizationOutcomeCategory)) {
      throw new Error('Invalid authorization execution evidence');
    }
    auditVerification(row.verificationId);
    observed.set(row.verificationId, row.outcome as AuthorizationOutcomeCategory);
  }
  const results = AUTHORIZATION_VERIFICATIONS.map(entry => {
    let outcome = observed.get(entry.verificationId) ?? 'INCONCLUSIVE';
    if (outcome === 'DENIED_BY_POLICY' && entry.allowedBaselineIds.some(id => observed.get(id) !== 'ALLOWED')) outcome = 'INCONCLUSIVE';
    return { verificationId: entry.verificationId, outcome, status: evaluateAuthorizationOutcome(entry.expectedPolicy, outcome) };
  });
  const metrics = {
    expectedCaseCount: AUTHORIZATION_VERIFICATIONS.length, completedCaseCount: observed.size,
    matchedCaseCount: results.filter(row => row.status === 'PASS').length,
    domainRejectionCount: results.filter(row => row.outcome === 'DOMAIN_REJECTION').length,
    transportErrorCount: results.filter(row => row.outcome === 'TRANSPORT_OR_RUNNER_ERROR').length,
    inconclusiveCaseCount: results.filter(row => row.outcome === 'INCONCLUSIVE').length,
  };
  return { status: results.some(row => row.status === 'ERROR') ? 'ERROR' as const
    : results.some(row => row.status === 'FAIL') ? 'FAIL' as const : 'PASS' as const, metrics, results };
}
