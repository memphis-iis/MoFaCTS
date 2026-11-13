import { AUTHENTICATION_THROTTLE_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { classifyAuthenticationAttemptV2 } from './comparisonV2.mjs';

const invalid = () => { throw new Error('Authentication throttle observation is invalid'); };

// Transports prove fresh windows and scope isolation before exhausting budgets.
// An already exhausted IP bucket cannot establish the identifier throttle.
// Do not reset unowned state to make a probe eligible; wait its actual window.
export function evaluateAuthenticationThrottlesV2(value) {
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'baselineVerified', 'scopes']);
  const ready = [row.bindingsVerified, row.environmentLeaseHeld, row.baselineVerified].map(proofBoolean).every(Boolean);
  const scopes = proofRecord(row.scopes, AUTHENTICATION_THROTTLE_CASES.map(row => row.scope));
  const statuses = [], outcomes = [];
  for (const definition of AUTHENTICATION_THROTTLE_CASES) {
    const scope = proofRecord(scopes[definition.scope], ['freshWindowVerified', 'scopeIsolationVerified', 'attempts']);
    const fresh = proofBoolean(scope.freshWindowVerified), isolated = proofBoolean(scope.scopeIsolationVerified);
    if (!Array.isArray(scope.attempts) || scope.attempts.length > definition.maximumAttempts) invalid();
    const attempts = scope.attempts.map(attempt => ({ raw: attempt, ...classifyAuthenticationAttemptV2('login', attempt) }));
    const firstLimit = attempts.findIndex(attempt => attempt.category === 'rate-limited');
    let status = 'ERROR';
    if (ready && fresh && isolated && attempts.length >= 2
        && attempts.every(attempt => ['observed', 'rate-limited'].includes(attempt.category))) {
      if (firstLimit > 0 && firstLimit === attempts.length - 1
          && definition.policyDenialCodes.includes(String(attempts[firstLimit].raw.code))) status = 'PASS';
      else if (firstLimit < 0 && attempts.length === definition.maximumAttempts) status = 'FAIL';
    }
    statuses.push(status); outcomes.push({ verificationId: definition.verificationId, status });
  }
  const status = statuses.includes('ERROR') ? 'ERROR' : statuses.includes('FAIL') ? 'FAIL' : 'PASS';
  return { status, results: outcomes, evidence: status === 'ERROR'
    ? { category: 'evidence-incomplete', summary: 'Throttle attribution lacks a fresh isolated scope or conclusive bounded execution.' }
    : { summary: 'Connection, identifier and IP throttle budgets independently exercised.', metrics: {
      expectedCaseCount: 3, completedCaseCount: 3, matchedCaseCount: statuses.filter(status => status === 'PASS').length,
      domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } } };
}
