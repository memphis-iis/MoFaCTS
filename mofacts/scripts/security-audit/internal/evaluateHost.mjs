import { profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { HostObservationVersionError, observedHostMeasurements, parseHostObservations, parseHostObservationBytes } from '../../../common/securityAudit/hostObservations.ts';
import { HOST_MEASUREMENT_DESCRIPTOR, hostMeasurementsOutcome, hostUnavailableObservations } from '../../../common/securityAudit/hostAuditPolicy.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';

const groupByContract = new Map(Object.entries(HOST_MEASUREMENT_DESCRIPTOR.groups).map(([group, contract]) => [contract, group]));
function measurements(definition, observations) {
  if (definition.evidenceContract === 'host-listeners-v1') {
    const raw = observedHostMeasurements(observations.listeners);
    const tier = definition.controlId === 'internal.listening-sockets.standard' ? 'Standard'
      : definition.controlId === 'internal.listening-sockets.sensitive' ? 'Sensitive' : null;
    if (!tier) throw new Error('Unsupported listener control binding');
    return Object.fromEntries([['inspectedListenerCount', 'inspectedListenerCount'],
      ['unexpectedListenerCount', `unexpected${tier}ListenerCount`],
      ['unexpectedUdpListenerCount', `unexpected${tier}UdpListenerCount`]]
      .filter(([, source]) => Object.hasOwn(raw, source)).map(([target, source]) => [target, raw[source]]));
  }
  const group = groupByContract.get(definition.evidenceContract);
  if (!group) throw new Error('Unsupported internal observation binding');
  return observedHostMeasurements(observations[group]);
}

// Named recovery owns the complete internal subset for malformed/missing host
// envelopes. Valid per-fact unavailability is evaluated control by control.
// No V1 status translation and no independently installed host activation here.
export async function evaluateHostObservations(catalog, profile, input, now) {
  const definitions = profileControls(catalog, profile).filter(row => row.producerId === 'internal');
  const artifact = controls => parseAuditProducerArtifact({ artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1',
    producerId: 'internal', sectionId: 'internal', controls }, catalog, profile, 'internal');
  let parsed;
  try { parsed = await (input instanceof Uint8Array ? parseHostObservationBytes(input, now) : parseHostObservations(input, now)); }
  catch (error) {
    const category = input === undefined ? 'producer-missing'
      : error instanceof HostObservationVersionError ? 'observation-version' : 'producer-malformed';
    return artifact(definitions.map(row => ({ controlId: row.controlId, status: 'ERROR',
      evidence: { summary: 'The host envelope did not satisfy its current complete observation contract.', category } })));
  }
  return artifact(definitions.map(row => {
    const metrics = measurements(row, parsed.observations), status = hostMeasurementsOutcome(row.evidenceContract, metrics);
    if (status === 'ERROR') return { controlId: row.controlId, status,
      evidence: { summary: 'Required host measurements could not establish this control.', category: 'evidence-incomplete' } };
    const observations = hostUnavailableObservations(row.evidenceContract, metrics);
    return { controlId: row.controlId, status, evidence: {
      summary: status === 'FAIL' ? 'Observed host facts establish a violation of this control.' : 'All required host safety measurements were established.',
      metrics, ...(observations.length ? { observations } : {}),
    } };
  }));
}

export async function hostUdpMeasurements(input, now) {
  // Independently validate the complete envelope again at the composite boundary;
  // valid-looking subfields from a stale/malformed host response are not evidence.
  const envelope = await parseHostObservations(input, now);
  const listeners = observedHostMeasurements(envelope.observations.listeners);
  const firewall = observedHostMeasurements(envelope.observations.firewall);
  const docker = observedHostMeasurements(envelope.observations.docker);
  const result = {};
  if (typeof listeners.unexpectedStandardUdpListenerCount === 'number' && typeof listeners.unexpectedSensitiveUdpListenerCount === 'number') {
    result.unexpectedUdpListenerCount = listeners.unexpectedStandardUdpListenerCount + listeners.unexpectedSensitiveUdpListenerCount;
  }
  for (const key of ['firewallActive', 'defaultDenyInbound', 'unexpectedUdpAllowRuleCount']) {
    if (Object.hasOwn(firewall, key)) result[key] = firewall[key];
  }
  if (Object.hasOwn(docker, 'unexpectedUdpPublicationCount')) result.unexpectedUdpPublicationCount = docker.unexpectedUdpPublicationCount;
  return result;
}
