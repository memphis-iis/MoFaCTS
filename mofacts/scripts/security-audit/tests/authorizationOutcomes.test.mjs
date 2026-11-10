import assert from 'node:assert/strict';
import test from 'node:test';
import cases from '../../../common/securityAudit/fixtures/authorization-outcomes.fixture.json' with { type: 'json' };
import { evaluateAuthorizationOutcome, methodAuthorizationOutcome } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

test('V2 authorization decision table exhausts the two expected policies and all five distinct observations', () => {
  assert.equal(cases.length, 10);
  assert.equal(new Set(cases.map(row => row.expected + ':' + row.outcome)).size, 10);
  for (const row of cases) assert.equal(evaluateAuthorizationOutcome(row.expected, row.outcome), row.status);
});

test('V2 method denial needs exact reviewed source criteria; arbitrary errors cannot become successful denial', () => {
  assert.equal(methodAuthorizationOutcome({ state: 'rejected', code: 'not-authorized' }, ['not-authorized']), 'DENIED_BY_POLICY');
  for (const code of ['internal-error', 'timeout', '500', 'NOT-AUTHORIZED', 'unrelated']) {
    const outcome = methodAuthorizationOutcome({ state: 'rejected', code }, ['not-authorized']);
    assert.equal(outcome, 'DOMAIN_REJECTION'); assert.equal(evaluateAuthorizationOutcome('deny', outcome), 'ERROR');
  }
  assert.equal(methodAuthorizationOutcome({ state: 'rejected', code: 'not-authorized' }, []), 'DOMAIN_REJECTION');
});

test('V2 method allowance needs explicit positive scoped verification, not just a returned call', () => {
  assert.equal(methodAuthorizationOutcome({ state: 'returned', allowedObservationMatched: true }, []), 'ALLOWED');
  const missing = methodAuthorizationOutcome({ state: 'returned', allowedObservationMatched: false }, []);
  assert.equal(missing, 'INCONCLUSIVE'); assert.equal(evaluateAuthorizationOutcome('allow', missing), 'ERROR');
  for (const value of [{ state: 'returned' }, { ok: true, value: [] }, false, { ok: false }, { error: true }]) {
    assert.throws(() => methodAuthorizationOutcome(value, ['not-authorized']));
  }
});

test('V2 method transport and inconclusive observations remain errors for either declared policy', () => {
  for (const [state, category] of [['transport-error', 'TRANSPORT_OR_RUNNER_ERROR'], ['inconclusive', 'INCONCLUSIVE']]) {
    assert.equal(methodAuthorizationOutcome({ state }, []), category);
    for (const expected of ['allow', 'deny']) assert.equal(evaluateAuthorizationOutcome(expected, category), 'ERROR');
  }
});

test('V2 outcome parsing rejects loose/wildcard/duplicate criteria and secret-bearing extra observations', () => {
  for (const codes of [['*'], [/authorized/], ['not-authorized', 'not-authorized'], ['PRIVATE value'], Array(17).fill('one'), null]) {
    assert.throws(() => methodAuthorizationOutcome({ state: 'rejected', code: 'not-authorized' }, codes));
  }
  for (const value of [{ state: 'transport-error', message: 'PRIVATE-value' }, { state: 'rejected', code: 'PRIVATE value' },
    { state: 'returned', allowedObservationMatched: true, value: 'PRIVATE-value' }, { state: 'invented' }]) {
    assert.throws(() => methodAuthorizationOutcome(value, []), error => !error.message.includes('PRIVATE'));
  }
  assert.throws(() => evaluateAuthorizationOutcome('invented', 'ALLOWED'));
  assert.throws(() => evaluateAuthorizationOutcome('deny', 'invented'));
});

test('V2 expected policy denial is a completed match, distinct from the report domain-rejection error counter', () => {
  const outcome = methodAuthorizationOutcome({ state: 'rejected', code: '403' }, ['403']);
  const status = evaluateAuthorizationOutcome('deny', outcome);
  assert.equal(status, 'PASS');
  assert.doesNotThrow(() => parseAuditEvidence('verification-observations-v1', status, {
    summary: 'The fixture expected exact policy denial.', metrics: { expectedCaseCount: 1, completedCaseCount: 1,
      matchedCaseCount: 1, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0 },
  }));
});
