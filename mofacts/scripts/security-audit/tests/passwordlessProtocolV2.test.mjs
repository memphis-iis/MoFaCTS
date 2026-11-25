import assert from 'node:assert/strict';
import test from 'node:test';
import { PASSWORDLESS_PROTOCOL_VERIFICATIONS as definitions } from '../../../common/securityAudit/verificationCatalog.ts';
import { evaluatePasswordlessProtocol as evaluate } from '../../../common/securityAudit/passwordlessProtocol.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
const fixture = () => ({ bindingsVerified: true, environmentLeaseHeld: true, results: definitions.map(row => ({ verificationId: row.verificationId,
  observation: row.family === 'method' ? row.expectedPolicy === 'allow' ? { state: 'returned', allowedObservationMatched: true }
    : { state: 'rejected', code: row.policyDenialCodes[0] } : { state: 'observed', value: true } })) });
test('source intent covers twelve passwordless controls with exact method policies and required positive baselines', () => {
  assert.equal(definitions.length, 17); assert.equal(new Set(definitions.map(row => row.verificationId)).size, 17);
  const result = evaluate(fixture()); assert.equal(result.length, 12);
  for (const control of result) { assert.equal(control.status, 'PASS'); parseAuditEvidence('verification-observations-v1', control.status, control.evidence); }
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('arbitrary exceptions, timeouts and unavailable predicates never become policy denial or green containment', () => {
  for (const definition of definitions.filter(row => row.controlId)) {
    for (const state of ['transport-error', 'inconclusive']) {
      const value = fixture(); value.results.find(row => row.verificationId === definition.verificationId).observation = { state };
      assert.equal(evaluate(value).find(row => row.controlId === definition.controlId).status, 'ERROR');
    }
    const value = fixture(); value.results.find(row => row.verificationId === definition.verificationId).observation = definition.family === 'method'
      ? { state: 'rejected', code: '500' } : { state: 'domain-error' };
    assert.equal(evaluate(value).find(row => row.controlId === definition.controlId).status, 'ERROR');
  }
});
test('observed false predicates and forbidden method success are security FAIL with ready baselines', () => {
  for (const definition of definitions.filter(row => row.controlId)) {
    const value = fixture(); value.results.find(row => row.verificationId === definition.verificationId).observation = definition.family === 'method'
      ? { state: 'returned', allowedObservationMatched: true } : { state: 'observed', value: false };
    assert.equal(evaluate(value).find(row => row.controlId === definition.controlId).status, 'FAIL');
  }
});
test('baseline failure, missing binding or lease prevents a passing dependent denial', () => {
  for (const definition of definitions.filter(row => !row.controlId)) {
    const value = fixture(); value.results = value.results.filter(row => row.verificationId !== definition.verificationId);
    const dependent = definitions.find(row => row.allowedBaselineIds.includes(definition.verificationId));
    assert.equal(evaluate(value).find(row => row.controlId === dependent.controlId).status, 'ERROR');
  }
  for (const key of ['bindingsVerified', 'environmentLeaseHeld']) assert.ok(evaluate({ ...fixture(), [key]: false }).every(row => row.status === 'ERROR'));
});
test('missing, duplicate, unknown and secret-bearing observations are explicit errors or rejected input', () => {
  assert.ok(evaluate({ ...fixture(), results: [] }).every(row => row.status === 'ERROR'));
  for (const change of [value => value.results.push(value.results[0]), value => { value.results[0].verificationId = 'unknown'; },
    value => { value.results[0].observation.rawToken = 'PRIVATE'; }, value => { value.expectedPolicy = 'allow'; }]) {
    const value = fixture(); change(value); assert.throws(() => evaluate(value));
  }
});
