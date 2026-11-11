import { expect } from 'chai';
import { AUTHORIZATION_VERIFICATIONS } from './verificationCatalog.ts';
import { evaluateAuthorizationVerifications } from './authorizationVerification.ts';
import { downloadReplayAuthorizationOutcome, publicationAuthorizationOutcome } from './authorizationOutcomes.ts';

describe('source-owned selected authorization verification in Meteor', function() {
  it('requires complete executed cases and successful allowed baselines', function() {
    const values = AUTHORIZATION_VERIFICATIONS.map(row => ({ verificationId: row.verificationId,
      outcome: row.expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY' }));
    expect(evaluateAuthorizationVerifications(values).status).to.equal('PASS');
    expect(evaluateAuthorizationVerifications(values.slice(1)).status).to.equal('ERROR');
    const first = values[0];
    if (!first) throw new Error('Selected verification catalog is empty');
    first.outcome = 'TRANSPORT_OR_RUNNER_ERROR';
    expect(evaluateAuthorizationVerifications(values).status).to.equal('ERROR');
  });
  it('keeps empty/unreadable publications and unbound download 404s inconclusive', function() {
    expect(publicationAuthorizationOutcome({ ready: true, readable: false, bindingMatched: true,
      ownObserved: false, foreignObserved: false, anonymous: false }, 'deny')).to.equal('INCONCLUSIVE');
    expect(downloadReplayAuthorizationOutcome({ baselineVerified: false, sameCapability: true, status: 404 })).to.equal('INCONCLUSIVE');
  });
});
