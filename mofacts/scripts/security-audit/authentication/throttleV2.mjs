import { AUTHENTICATION_THROTTLE_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { classifyAuthenticationAttemptV2 } from './comparisonV2.mjs';

const invalid = () => { throw new Error('Authentication throttle observation is invalid'); };

function evaluateScope(definition, value, ready) {
  const scope = proofRecord(value, ['freshWindowVerified', 'scopeIsolationVerified', 'attempts']);
  const fresh = proofBoolean(scope.freshWindowVerified);
  const isolated = proofBoolean(scope.scopeIsolationVerified);
  if (!Array.isArray(scope.attempts) || scope.attempts.length > definition.maximumAttempts) invalid();
  const categories = scope.attempts.map(attempt => classifyAuthenticationAttemptV2('login', attempt).category);
  if (!ready || !fresh || !isolated || categories.length < 2
      || categories.some(category => !['observed', 'rate-limited'].includes(category))) return 'ERROR';
  const firstLimit = categories.indexOf('rate-limited');
  if (firstLimit > 0 && firstLimit === categories.length - 1
      && definition.policyDenialCodes.includes(String(scope.attempts[firstLimit].code))) return 'PASS';
  if (firstLimit < 0 && categories.length === definition.maximumAttempts) return 'FAIL';
  return 'ERROR';
}

export function evaluateAuthenticationThrottleScopeV2(scope, value) {
  const definition = AUTHENTICATION_THROTTLE_CASES.find(row => row.scope === scope);
  if (!definition) invalid();
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'baselineVerified', 'observation']);
  const ready = [row.bindingsVerified, row.environmentLeaseHeld, row.baselineVerified].map(proofBoolean).every(Boolean);
  return { verificationId: definition.verificationId, status: evaluateScope(definition, row.observation, ready) };
}

// Transports prove fresh windows and scope isolation before exhausting budgets.
// An already exhausted IP bucket cannot establish the identifier throttle.
// Do not reset unowned state to make a probe eligible; wait its actual window.
export function evaluateAuthenticationThrottlesV2(value) {
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'baselineVerified', 'scopes']);
  const ready = [row.bindingsVerified, row.environmentLeaseHeld, row.baselineVerified].map(proofBoolean).every(Boolean);
  const scopes = proofRecord(row.scopes, AUTHENTICATION_THROTTLE_CASES.map(row => row.scope));
  const statuses = [], outcomes = [];
  for (const definition of AUTHENTICATION_THROTTLE_CASES) {
    const status = evaluateScope(definition, scopes[definition.scope], ready);
    statuses.push(status); outcomes.push({ verificationId: definition.verificationId, status });
  }
  const status = statuses.includes('ERROR') ? 'ERROR' : statuses.includes('FAIL') ? 'FAIL' : 'PASS';
  return { status, results: outcomes, evidence: status === 'ERROR'
    ? { category: 'evidence-incomplete', summary: 'Throttle attribution lacks a fresh isolated scope or conclusive bounded execution.' }
    : { summary: 'Connection, identifier and IP throttle budgets independently exercised.', metrics: {
      expectedCaseCount: 3, completedCaseCount: 3, matchedCaseCount: statuses.filter(status => status === 'PASS').length,
      domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 } } };
}
