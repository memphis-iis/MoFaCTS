import { AUDIT_CATALOG_V3, REPRODUCIBLE_QUALIFICATION_CATALOG } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import {
  evaluateDeploymentNetworkAttestation,
  evaluateMongoDeploymentAttestation,
  evaluateReproducibleAuthenticationEvidence,
} from '../../../common/securityAudit/reproducibleQualification.ts';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';

const replacementIds = new Set([
  'external.public-tcp-ports.standard',
  'external.public-tcp-ports.sensitive',
  'external.public-udp-ports',
  'internal.mongodb-auth.unauthenticated-access',
  ...Object.keys(REPRODUCIBLE_AUTHENTICATION_CONTROL_CASES),
]);

const row = (controlId, status, summary, metrics) => ({ controlId, status, evidence: { summary, metrics } });

export function reproducibleReplacementRowsV3({ authenticationExecutions, authenticationSmoke, network, mongodb }) {
  const authentication = evaluateReproducibleAuthenticationEvidence(authenticationExecutions, authenticationSmoke);
  const networkStatus = evaluateDeploymentNetworkAttestation(network);
  const networkRows = [
    'external.public-tcp-ports.standard',
    'external.public-tcp-ports.sensitive',
    'external.public-udp-ports',
  ].map(controlId => row(controlId, networkStatus,
    networkStatus === 'PASS'
      ? 'Cloud and host firewalls, listeners, Docker publications and ordinary web reachability matched the deployment policy.'
      : 'A deployment network attestation differed from the approved policy.', network));
  const mongoStatus = evaluateMongoDeploymentAttestation(mongodb);
  const mongo = row('internal.mongodb-auth.unauthenticated-access', mongoStatus,
    mongoStatus === 'PASS'
      ? 'Disposable authentication enforcement and the deployed private authenticated MongoDB boundary passed.'
      : 'Disposable authentication enforcement or the deployed MongoDB boundary differed from policy.', mongodb);
  return [...authentication, ...networkRows, mongo];
}

// The retained rows are the already accepted 55-control basis. Each caller
// supplies the five complete producer artifacts from that reviewed basis. The
// fifteen superseded rows are replaced, never duplicated or silently retained.
export function composeReproducibleCloseoutArtifactsV3({ retainedArtifacts, ...replacementInput }) {
  if (!Array.isArray(retainedArtifacts) || retainedArtifacts.length !== 5) {
    throw new Error('Reproducible closeout requires the five reviewed producer artifacts');
  }
  const replacements = new Map(reproducibleReplacementRowsV3(replacementInput)
    .map(control => [control.controlId, control]));
  if (replacements.size !== replacementIds.size || [...replacementIds].some(id => !replacements.has(id))) {
    throw new Error('Reproducible closeout replacement membership is incomplete');
  }
  const output = retainedArtifacts.map(artifact => {
    if (!artifact || artifact.artifactSchema !== 'MoFaCTSSecurityAuditProducerArtifactV1'
      || !Array.isArray(artifact.controls)) throw new Error('Invalid reviewed producer artifact');
    const controls = artifact.controls.map(control => replacements.get(control.controlId) ?? control);
    for (const control of controls) {
      if (!replacementIds.has(control.controlId) && control.status !== 'PASS') {
        throw new Error('Reviewed unchanged control is not a recorded pass');
      }
    }
    return parseAuditProducerArtifact({ ...artifact, controls }, REPRODUCIBLE_QUALIFICATION_CATALOG,
      'full', artifact.producerId);
  });
  if (new Set(output.flatMap(artifact => artifact.controls.map(control => control.controlId))).size !== 70
    || [...replacementIds].some(id => output.flatMap(artifact => artifact.controls).filter(row => row.controlId === id).length !== 1)) {
    throw new Error('Reproducible closeout did not produce exact 70-control membership');
  }
  return output;
}

export async function assembleReproducibleCloseoutReportV3({ retainedArtifacts, authenticationExecutions,
  authenticationSmoke, network, mongodb, ...envelope }) {
  const artifacts = composeReproducibleCloseoutArtifactsV3({ retainedArtifacts, authenticationExecutions,
    authenticationSmoke, network, mongodb });
  return assembleAuditReportV2({ ...envelope, acceptedCatalog: AUDIT_CATALOG_V3,
    artifacts: artifacts.map(artifact => ({ producerId: artifact.producerId, artifact })) });
}
