import { expect } from 'chai';
import {
  evaluateDeploymentNetworkAttestation,
  evaluateMongoDeploymentAttestation,
  evaluateReproducibleAuthenticationEvidence,
} from './reproducibleQualification';
import { REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES } from './verificationCatalog';

describe('reproducible security-control qualification', function() {
  const smoke = { ordinaryLoginSmokePassed: true, resetSmokePassed: true, passwordlessSmokePassed: true };
  const executions = () => [...new Set(Object.values(REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES).flat())]
    .map(verificationId => ({ verificationId, outcome: 'PASS' as const }));

  it('closes all eleven authentication controls only with complete cases and smoke checks', function() {
    const controls = evaluateReproducibleAuthenticationEvidence(executions(), smoke);
    expect(controls).to.have.length(11);
    expect(controls.every(row => row.status === 'PASS')).to.equal(true);
    const missing = evaluateReproducibleAuthenticationEvidence(executions().slice(1), smoke);
    expect(missing.some(row => row.status === 'ERROR')).to.equal(true);
    const failedSmoke = evaluateReproducibleAuthenticationEvidence(executions(), {
      ...smoke, passwordlessSmokePassed: false,
    });
    expect(failedSmoke.every(row => row.status === 'FAIL')).to.equal(true);
  });

  it('requires the complete deployment network attestation', function() {
    const passing = { cloudUnexpectedAllowRuleCount: 0, hostUnexpectedAllowRuleCount: 0,
      unexpectedListenerCount: 0, unexpectedDockerPublicationCount: 0, httpReachable: true, httpsReachable: true };
    expect(evaluateDeploymentNetworkAttestation(passing)).to.equal('PASS');
    expect(evaluateDeploymentNetworkAttestation({ ...passing, unexpectedListenerCount: 1 })).to.equal('FAIL');
    expect(evaluateDeploymentNetworkAttestation({ ...passing, httpsReachable: false })).to.equal('FAIL');
  });

  it('requires disposable denial and deployed MongoDB boundary evidence together', function() {
    const passing = { disposableUnauthenticatedReadRejected: true, disposableAuthenticatedReadSucceeded: true,
      authEnabled: true, privateBinding: true, unexpectedDockerPublicationCount: 0, authenticatedHealthPassed: true };
    expect(evaluateMongoDeploymentAttestation(passing)).to.equal('PASS');
    expect(evaluateMongoDeploymentAttestation({ ...passing, authEnabled: false })).to.equal('FAIL');
    expect(evaluateMongoDeploymentAttestation({ ...passing, disposableUnauthenticatedReadRejected: false })).to.equal('FAIL');
  });
});
