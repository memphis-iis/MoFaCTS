import { expect } from 'chai';
import { authenticationTimingMetric } from './authenticationTiming.ts';
import { parseAuditEvidence } from './evidenceContracts.ts';
import { AUTHENTICATION_COMPARISON_POLICY, AUTHENTICATION_COMPARISON_SAMPLES } from './verificationCatalog.ts';

describe('versioned authentication comparison proofs in Meteor', function() {
  it('uses the source-owned sample policy and distinguishes stable timing differences', function() {
    expect(AUTHENTICATION_COMPARISON_SAMPLES.length).to.equal(7);
    expect(authenticationTimingMetric([900, 900, 900, 900, 900], [900, 900, 900, 900, 900], 'login').status).to.equal('PASS');
    expect(authenticationTimingMetric([1900, 1900, 1900, 1900, 1900], [900, 900, 900, 900, 900], 'login').status).to.equal('FAIL');
    expect(authenticationTimingMetric([1800, 1800, 1800, 100, 100], [900, 900, 900, 900, 900], 'login').status).to.equal('ERROR');
    expect(() => authenticationTimingMetric([300], [300], 'reset')).to.throw();
  });
  it('requires exact complete evidence and derives enumeration status from response equality', function() {
    const metrics = { loginPairCount: AUTHENTICATION_COMPARISON_POLICY.login.sampleCount,
      resetPairCount: AUTHENTICATION_COMPARISON_POLICY.reset.sampleCount,
      baselineVerified: true, bindingsVerified: true, environmentLeaseHeld: true,
      rateLimitedAttemptCount: 0, domainRejectionCount: 0, transportErrorCount: 0, inconclusiveCaseCount: 0,
      loginResponseMatch: true, resetResponseMatch: true };
    const evidence = { summary: 'Bounded public responses compared.', metrics };
    expect(parseAuditEvidence('enumeration-observations-v2', 'PASS', evidence).metrics).to.deep.equal(metrics);
    expect(() => parseAuditEvidence('enumeration-observations-v2', 'FAIL', evidence)).to.throw();
    expect(() => parseAuditEvidence('enumeration-observations-v2', 'PASS', {
      ...evidence, metrics: { ...metrics, transportErrorCount: 1 } })).to.throw();
    expect(() => parseAuditEvidence('enumeration-observations-v2', 'PASS', {
      ...evidence, metrics: { ...metrics, baselineVerified: false } })).to.throw();
    metrics.loginResponseMatch = false;
    expect(parseAuditEvidence('enumeration-observations-v2', 'FAIL', evidence).metrics).to.deep.equal(metrics);
  });
});
