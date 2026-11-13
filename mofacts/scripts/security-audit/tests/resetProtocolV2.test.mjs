import assert from 'node:assert/strict';
import test from 'node:test';
import { RESET_PROTOCOL_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { unusedExpiredResetPrecondition as precondition, evaluateResetProtocol as evaluate,
  resetAttemptOutcome } from '../../../common/securityAudit/resetProtocol.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

function fixture() {
  return { bindingsVerified: true, environmentLeaseHeld: true, currentTokenOwned: true, currentTokenUnused: true,
    expiredToken: { owned: true, unused: true, ageMs: 3900000, lifetimeMs: 3600000, remainingMs: -300000 },
    results: RESET_PROTOCOL_VERIFICATIONS.map(row => ({ verificationId: row.verificationId,
      outcome: row.expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY' })) };
}
test('unused aged reset precondition rejects replay, foreign ownership, wrong lifetime and inconsistent clocks', () => {
  const { expiredToken } = fixture(); assert.equal(precondition(expiredToken), true);
  for (const patch of [{ owned: false }, { unused: false }, { ageMs: 3500000, remainingMs: 100000 },
    { lifetimeMs: 7200000, ageMs: 7500000, remainingMs: -300000 }]) assert.equal(precondition({ ...expiredToken, ...patch }), false);
  for (const patch of [{ ageMs: -1 }, { remainingMs: 0 }, { lifetimeMs: 0 }, { ageMs: NaN }, { rawToken: 'PRIVATE' }]) {
    assert.throws(() => precondition({ ...expiredToken, ...patch }));
  }
});
test('reset evaluation shares six cases, positive baselines and exact denial code without repeating acquisition', () => {
  const result = evaluate(fixture());
  for (const group of Object.values(result)) {
    assert.equal(group.status, 'PASS');
    parseAuditEvidence('verification-observations-v1', group.status, { summary: 'Complete typed reset protocol observations.', metrics: group.metrics });
  }
  assert.equal(resetAttemptOutcome({ state: 'rejected', code: 'invalid-token' }), 'DENIED_BY_POLICY');
  assert.equal(resetAttemptOutcome({ state: 'rejected', code: 'not-authorized' }), 'DOMAIN_REJECTION');
  assert.equal(resetAttemptOutcome({ state: 'returned', allowedObservationMatched: false }), 'INCONCLUSIVE');
  assert.equal(resetAttemptOutcome({ state: 'returned', allowedObservationMatched: true }), 'ALLOWED');
});
test('used/foreign/unready reset fixtures and unavailable outcomes cannot pass expiration or replay', () => {
  for (const patch of [{ environmentLeaseHeld: false }, { bindingsVerified: false },
    { currentTokenOwned: false }, { currentTokenUnused: false }]) {
    const result = evaluate({ ...fixture(), ...patch }); assert.equal(result.current.status, 'ERROR'); assert.equal(result.replay.status, 'ERROR');
  }
  for (const field of ['owned', 'unused']) {
    const value = fixture(); value.expiredToken[field] = false;
    assert.equal(evaluate(value).expired.status, 'ERROR'); assert.equal(evaluate(value).current.status, 'PASS');
  }
  for (const outcome of ['DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE']) {
    const value = fixture(); value.results.find(row => row.verificationId.endsWith('current.accepted')).outcome = outcome;
    const result = evaluate(value); for (const group of Object.values(result)) assert.equal(group.status, 'ERROR');
  }
});
test('proven acceptance of expired/replayed capabilities is FAIL with complete baselines; missing/duplicate cases are not green', () => {
  for (const id of ['authn.reset.expired.rejected', 'authn.reset.current.replay']) {
    const value = fixture(); value.results.find(row => row.verificationId === id).outcome = 'ALLOWED';
    const result = evaluate(value), group = id.includes('expired') ? result.expired : result.replay;
    assert.equal(group.status, 'FAIL');
    parseAuditEvidence('verification-observations-v1', 'FAIL', { summary: 'Complete typed reset policy violation.', metrics: group.metrics });
  }
  const value = fixture(); value.results.pop(); assert.equal(evaluate(value).expired.status, 'ERROR');
  value.results.push(value.results[0]); assert.throws(() => evaluate(value));
});
