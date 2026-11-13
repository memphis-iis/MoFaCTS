import { expect } from 'chai';
import { RESET_PROTOCOL_VERIFICATIONS } from './verificationCatalog.ts';
import { evaluateResetProtocol, unusedExpiredResetPrecondition } from './resetProtocol.ts';
import { evaluateSessionLifetime } from './sessionLifetime.ts';

describe('reset and session protocol evidence in Meteor', function() {
  it('requires an unused expired owner record and successful current-reset baselines', function() {
    const expiredToken = { owned: true, unused: true, ageMs: 3900000, lifetimeMs: 3600000, remainingMs: -300000 };
    const value = { bindingsVerified: true, environmentLeaseHeld: true, currentTokenOwned: true, currentTokenUnused: true,
      expiredToken, results: RESET_PROTOCOL_VERIFICATIONS.map(row => ({ verificationId: row.verificationId,
        outcome: row.expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY' })) };
    expect(evaluateResetProtocol(value).expired.status).to.equal('PASS');
    expect(unusedExpiredResetPrecondition({ ...expiredToken, unused: false })).to.equal(false);
    value.expiredToken.unused = false;
    expect(evaluateResetProtocol(value).expired.status).to.equal('ERROR');
    expect(evaluateResetProtocol(value).current.status).to.equal('PASS');
  });
  it('rejects zero/negative and excessive durations without reinterpreting an unverified session as safety', function() {
    const observation = { baselineOutcome: 'ALLOWED', freshSessionVerified: true, issuedAtMs: 2000000000000, expiresAtMs: 2000000000000 };
    expect(evaluateSessionLifetime(observation).status).to.equal('FAIL');
    expect(evaluateSessionLifetime({ ...observation, expiresAtMs: observation.issuedAtMs + 30 * 86400000 }).status).to.equal('PASS');
    expect(evaluateSessionLifetime({ ...observation, expiresAtMs: observation.issuedAtMs + 31 * 86400000 }).status).to.equal('FAIL');
    expect(evaluateSessionLifetime({ ...observation, baselineOutcome: 'TRANSPORT_OR_RUNNER_ERROR' }).status).to.equal('ERROR');
  });
});
