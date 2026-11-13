import { expect } from 'chai';
import { PASSWORDLESS_PROTOCOL_VERIFICATIONS, AUTHENTICATION_CONTROL_CASES, AUDIT_VERIFICATIONS } from './verificationCatalog.ts';
import { evaluatePasswordlessProtocol } from './passwordlessProtocol.ts';

function observation() {
  return { bindingsVerified: true, environmentLeaseHeld: true,
    results: PASSWORDLESS_PROTOCOL_VERIFICATIONS.map(row => ({ verificationId: row.verificationId,
      observation: row.family === 'method' ? row.expectedPolicy === 'allow'
        ? { state: 'returned', allowedObservationMatched: true }
        : { state: 'rejected', code: row.policyDenialCodes[0] }
        : { state: 'observed', value: true } })) };
}
describe('passwordless protocol evidence in Meteor', function() {
  it('retains exact source references for all 22 Phase 2 controls without activating a report', function() {
    expect(AUTHENTICATION_CONTROL_CASES).to.have.length(22);
    expect(AUDIT_VERIFICATIONS).to.have.length(68);
    const ids = new Set(AUDIT_VERIFICATIONS.map(row => row.verificationId));
    expect(ids.size).to.equal(68);
    expect(AUTHENTICATION_CONTROL_CASES.every(row => row.verificationIds.every(id => ids.has(id)))).to.equal(true);
  });
  it('shares exact twelve-control policies and positive baselines with Node', function() {
    const value = observation(), result = evaluatePasswordlessProtocol(value);
    expect(result).to.have.length(12);
    expect(result.every(row => row.status === 'PASS')).to.equal(true);
    value.results = value.results.filter(row => row.verificationId !== 'authn.passwordless.baseline.ordinary');
    expect(evaluatePasswordlessProtocol(value).find(row => row.controlId === 'authentication.passwordless.ordinary-account-denied')?.status).to.equal('ERROR');
  });
  it('preserves a verified identity violation and rejects unrelated denial errors', function() {
    const value = observation();
    value.results.find(row => row.verificationId === 'authn.passwordless.participant-identity')!.observation = { state: 'observed', value: false };
    value.results.find(row => row.verificationId === 'authn.passwordless.ordinary-account-denied')!.observation = { state: 'rejected', code: '500' };
    const result = evaluatePasswordlessProtocol(value);
    expect(result.find(row => row.controlId === 'authentication.passwordless.participant-identity')?.status).to.equal('FAIL');
    expect(result.find(row => row.controlId === 'authentication.passwordless.ordinary-account-denied')?.status).to.equal('ERROR');
  });
});
