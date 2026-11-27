import assert from 'node:assert/strict';
import test from 'node:test';
import { REPRODUCIBLE_QUALIFICATION_CATALOG } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
import { REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { assembleReproducibleCloseoutReportV3, composeReproducibleCloseoutArtifactsV3,
  reproducibleReplacementRowsV3 } from '../qualification/reproducibleCloseoutV3.mjs';

const authenticationExecutions = () => [...new Set(Object.values(REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES).flat())]
  .map(verificationId => ({ verificationId, outcome: 'PASS' }));
const authenticationSmoke = {
  ordinaryLoginSmokePassed: true,
  resetSmokePassed: true,
  passwordlessSmokePassed: true,
};
const network = {
  cloudUnexpectedAllowRuleCount: 0,
  hostUnexpectedAllowRuleCount: 0,
  unexpectedListenerCount: 0,
  unexpectedDockerPublicationCount: 0,
  httpReachable: true,
  httpsReachable: true,
};
const mongodb = {
  disposableUnauthenticatedReadRejected: true,
  disposableAuthenticatedReadSucceeded: true,
  authEnabled: true,
  privateBinding: true,
  unexpectedDockerPublicationCount: 0,
  authenticatedHealthPassed: true,
};

const passEvidence = definition => {
  switch (definition.evidenceContract) {
    case 'reproducible-authentication-v1': return {
      summary: 'Reproducible authentication evidence passed.',
      metrics: { caseCount: 1, failedCaseCount: 0, ordinaryLoginSmokePassed: true,
        resetSmokePassed: true, passwordlessSmokePassed: true },
    };
    case 'deployment-network-attestation-v1': return { summary: 'Network attestation passed.', metrics: network };
    case 'mongodb-deployment-attestation-v1': return { summary: 'MongoDB attestation passed.', metrics: mongodb };
    default: return null;
  }
};

const retainedArtifacts = () => [...new Set(REPRODUCIBLE_QUALIFICATION_CATALOG.controls.map(row => row.producerId))]
  .map(producerId => {
    const definitions = REPRODUCIBLE_QUALIFICATION_CATALOG.controls.filter(row => row.producerId === producerId);
    return { artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId,
      sectionId: definitions[0].sectionId, controls: definitions.map(definition => ({
        controlId: definition.controlId, status: 'PASS',
        evidence: passEvidence(definition) ?? { summary: 'Reviewed retained pass.', metrics: {} },
      })) };
  });

test('the reproducible closeout emits exactly fifteen passing replacement rows', () => {
  const rows = reproducibleReplacementRowsV3({ authenticationExecutions: authenticationExecutions(),
    authenticationSmoke, network, mongodb });
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map(row => row.controlId)).size, 15);
  assert.ok(rows.every(row => row.status === 'PASS'));
  for (const row of rows) {
    const contract = row.controlId.startsWith('authentication.') ? 'reproducible-authentication-v1'
      : row.controlId === 'internal.mongodb-auth.unauthenticated-access' ? 'mongodb-deployment-attestation-v1'
        : 'deployment-network-attestation-v1';
    parseAuditEvidence(contract, row.status, row.evidence);
  }
});

test('missing deterministic evidence remains ERROR and a deployment mismatch remains FAIL', () => {
  const missing = reproducibleReplacementRowsV3({ authenticationExecutions: authenticationExecutions().slice(1),
    authenticationSmoke, network, mongodb });
  assert.ok(missing.some(row => row.status === 'ERROR'));
  const mismatch = reproducibleReplacementRowsV3({ authenticationExecutions: authenticationExecutions(),
    authenticationSmoke, network: { ...network, unexpectedDockerPublicationCount: 1 }, mongodb });
  assert.equal(mismatch.find(row => row.controlId === 'external.public-udp-ports').status, 'FAIL');
});

test('the five reviewed producers compose one strict 70-control V3 report', async () => {
  const artifacts = retainedArtifacts();
  // Unchanged evidence must satisfy its own contract, so use the catalog parser
  // to derive complete fixtures through the released proof-shape helper below.
  const { completeEvidenceForContract } = await import('./helpers/completeEvidenceForContract.mjs');
  for (const artifact of artifacts) for (const control of artifact.controls) {
    const definition = REPRODUCIBLE_QUALIFICATION_CATALOG.controls.find(row => row.controlId === control.controlId);
    control.evidence = completeEvidenceForContract(definition.evidenceContract, 'PASS');
  }
  const composed = composeReproducibleCloseoutArtifactsV3({ retainedArtifacts: artifacts,
    authenticationExecutions: authenticationExecutions(), authenticationSmoke, network, mongodb });
  assert.equal(composed.length, 5);
  assert.equal(composed.flatMap(artifact => artifact.controls).length, 70);
  const report = await assembleReproducibleCloseoutReportV3({ retainedArtifacts: artifacts,
    authenticationExecutions: authenticationExecutions(), authenticationSmoke, network, mongodb,
    reportId: 'staging2-reproducible-closeout', reportType: 'full',
    startedAt: '2026-11-27T12:00:00.000Z', completedAt: '2026-11-27T12:01:00.000Z',
    target: 'https://staging2.optimallearning.org', scannerSourceRevision: '8e3a0a484d146ce85b9733d6065a9d2806296e82',
    deployedApplicationRevision: { state: 'observed', value: '8e3a0a484d146ce85b9733d6065a9d2806296e82' },
    deployedImageDigest: { state: 'observed', value: `registry.example/mofacts@sha256:${'a'.repeat(64)}` },
    toolVersions: { node: process.version },
  });
  assert.equal(report.catalogVersion, 3);
  assert.deepEqual(report.counts, { pass: 70, fail: 0, error: 0, notApplicable: 0,
    info: 0, low: 0, medium: 0, high: 0, critical: 0 });
});
