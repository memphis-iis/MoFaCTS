import { profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseUdpExternalMeasurements, parseUdpHostMeasurements, udpHostPolicySatisfied } from '../../../common/securityAudit/evidenceContracts.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';

// Inert V2 evaluator. Actual external/host acquisition adapters remain separate;
// never translate V1 PASS/FAIL or fill absent measurements with default values.
export function evaluateUdpExposure(catalog, profile, externalInput, hostInput) {
  const definitions = profileControls(catalog, profile).filter(row => row.producerId === 'composite-exposure');
  if (definitions.length !== 1 || definitions[0].controlId !== 'external.public-udp-ports') {
    throw new Error('Unsupported composite exposure catalog');
  }
  const result = (status, evidence) => parseAuditProducerArtifact({
    artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId: 'composite-exposure',
    sectionId: definitions[0].sectionId, controls: [{ controlId: definitions[0].controlId, status, evidence }],
  }, catalog, profile, 'composite-exposure');
  const unavailable = input => result('ERROR', { summary: 'Required UDP acquisition did not satisfy its bounded measurement contract.',
    category: input === undefined ? 'evidence-incomplete' : 'producer-malformed' });
  let external;
  try { external = parseUdpExternalMeasurements(externalInput); }
  catch { return unavailable(externalInput); }
  if (external.openSelectedUdpPortCount > 0) {
    return result('FAIL', { summary: 'An external service response confirms selected public UDP exposure.', metrics: external });
  }
  if (external.observedResultCount !== external.expectedResultCount) {
    return result('ERROR', { summary: 'The external UDP acquisition did not cover the complete selected inventory.', category: 'evidence-incomplete' });
  }
  let host;
  try { host = parseUdpHostMeasurements(hostInput); }
  catch { return unavailable(hostInput); }
  const safe = udpHostPolicySatisfied(host);
  return result(safe ? 'PASS' : 'FAIL', {
    summary: safe ? 'Complete external observations and host policy corroborate absence of selected public UDP services.'
      : 'Complete host observations contradict the approved UDP exposure policy.',
    metrics: { ...external, ...host },
  });
}
