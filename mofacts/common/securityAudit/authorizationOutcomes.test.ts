import { expect } from 'chai';
import cases from './fixtures/authorization-outcomes.fixture.json' with { type: 'json' };
import { evaluateAuthorizationOutcome, methodAuthorizationOutcome,
  type AuthorizationOutcomeCategory, type ExpectedAuthorizationPolicy } from './authorizationOutcomes.ts';

describe('shared V2 authorization outcome contract', function() {
  it('matches every row of the approved ten-row decision table', function() {
    expect(cases).to.have.length(10);
    for (const row of cases) expect(evaluateAuthorizationOutcome(row.expected as ExpectedAuthorizationPolicy,
      row.outcome as AuthorizationOutcomeCategory)).to.equal(row.status);
  });
  it('distinguishes exact policy denial, unrelated domain error and missing success evidence', function() {
    expect(methodAuthorizationOutcome({ state: 'rejected', code: 'not-authorized' }, ['not-authorized'])).to.equal('DENIED_BY_POLICY');
    expect(methodAuthorizationOutcome({ state: 'rejected', code: 'internal-error' }, ['not-authorized'])).to.equal('DOMAIN_REJECTION');
    expect(methodAuthorizationOutcome({ state: 'transport-error' }, ['not-authorized'])).to.equal('TRANSPORT_OR_RUNNER_ERROR');
    expect(methodAuthorizationOutcome({ state: 'returned', allowedObservationMatched: false }, ['not-authorized'])).to.equal('INCONCLUSIVE');
    expect(() => methodAuthorizationOutcome({ ok: false }, ['not-authorized'])).to.throw();
  });
});
