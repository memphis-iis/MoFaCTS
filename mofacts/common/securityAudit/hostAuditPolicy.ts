import descriptor from './catalogs/host-measurements.v1.json' with { type: 'json' };
import { proofMeasurements, proofRecord, type ProofMeasurementKind } from './proofFields.ts';

type Measurements = Record<string, number | boolean>;
type Fields = Readonly<Record<string, ProofMeasurementKind>>;
function invalid(): never { throw new Error('Invalid host measurement contract'); }
proofRecord(descriptor, ['observationSchema', 'maximumBytes', 'unavailableReasons', 'evidence', 'listenerInventory', 'groups']);
if (descriptor.observationSchema !== 'MoFaCTSSecurityAuditHostObservationsV1') invalid();
if (!Number.isSafeInteger(descriptor.maximumBytes) || descriptor.maximumBytes < 1 || descriptor.maximumBytes > 65536
  || !descriptor.unavailableReasons.length || new Set(descriptor.unavailableReasons).size !== descriptor.unavailableReasons.length) invalid();
for (const fields of [...Object.values(descriptor.evidence), descriptor.listenerInventory]) {
  if (!Object.keys(fields).length || Object.values(fields).some(kind => kind !== 'count' && kind !== 'boolean')) invalid();
  Object.freeze(fields);
}
Object.freeze(descriptor.evidence); Object.freeze(descriptor.listenerInventory); Object.freeze(descriptor.groups);
Object.freeze(descriptor.unavailableReasons);
export const HOST_MEASUREMENT_DESCRIPTOR = Object.freeze(descriptor);
export const HOST_EVIDENCE_FIELDS = descriptor.evidence as Readonly<Record<string, Fields>>;
export function hostGroupFields(group: string): Fields {
  const groups = descriptor.groups as Record<string, string>;
  if (!Object.hasOwn(groups, group)) invalid();
  const id = groups[group];
  const fields = id === 'listenerInventory' ? descriptor.listenerInventory : HOST_EVIDENCE_FIELDS[id!];
  if (!fields) invalid();
  return fields as Fields;
}
export function hasHostEvidenceContract(id: string): boolean { return Object.hasOwn(HOST_EVIDENCE_FIELDS, id); }

function lessOrEqual(metrics: Measurements, part: string, total: string): void {
  if (Object.hasOwn(metrics, part) && Object.hasOwn(metrics, total) && Number(metrics[part]) > Number(metrics[total])) invalid();
}
export function validateHostMeasurementRelations(id: string, metrics: Measurements): void {
  if (id === 'host-configuration-v1') lessOrEqual(metrics, 'presentSettingCount', 'requiredSettingCount');
  if (id === 'host-listeners-v1') {
    lessOrEqual(metrics, 'unexpectedUdpListenerCount', 'unexpectedListenerCount');
    lessOrEqual(metrics, 'unexpectedListenerCount', 'inspectedListenerCount');
  }
  if (id === 'docker-publications-v1') {
    lessOrEqual(metrics, 'unexpectedUdpPublicationCount', 'unexpectedPublicationCount');
    lessOrEqual(metrics, 'privateNetworkModeCount', 'inspectedContainerCount');
  }
  if (id === 'firewall-policy-v1') lessOrEqual(metrics, 'unexpectedUdpAllowRuleCount', 'unexpectedAllowRuleCount');
}

// These are closed, domain-specific sufficient failure proofs. A false result
// from an authenticated connectivity probe is unavailable assurance, not a
// demonstrated bypass or grant mismatch. No generic "false means FAIL" rule.
export function hostFailureEstablished(id: string, m: Measurements): boolean {
  const no = (key: string) => m[key] === false;
  const yes = (key: string) => m[key] === true;
  const positive = (key: string) => typeof m[key] === 'number' && Number(m[key]) > 0;
  switch (id) {
    case 'host-configuration-v1': return no('rootOwned') || no('rootOnly')
      || (typeof m.requiredSettingCount === 'number' && typeof m.presentSettingCount === 'number'
        && m.requiredSettingCount > 0 && m.presentSettingCount < m.requiredSettingCount);
    case 'host-listeners-v1': return positive('unexpectedListenerCount') || positive('unexpectedUdpListenerCount');
    case 'application-listener-v1': return no('expectedListenerPresent');
    case 'sidecar-policy-v1': return no('loopbackOnly')
      || (yes('absenceRequired') && ['listenerCount', 'helperContainerCount', 'endpointDeclarationCount', 'publicationCount'].some(positive))
      || (typeof m.listenerCount === 'number' && m.listenerCount !== 0 && m.listenerCount !== 2);
    case 'docker-publications-v1': return positive('unexpectedPublicationCount') || positive('unexpectedUdpPublicationCount') || positive('privateNetworkModeCount');
    case 'firewall-policy-v1': return ['firewallActive', 'defaultDenyInbound', 'publicWebAllowed', 'scopedSshOnly'].some(no)
      || positive('unexpectedAllowRuleCount') || positive('unexpectedUdpAllowRuleCount');
    case 'reverse-proxy-v1': return ['configuredHostMatched', 'httpLoopbackOnly', 'websocketLoopbackOnly'].some(no);
    case 'mongodb-unauthenticated-v1': return yes('unauthenticatedReadAccepted');
    case 'mongodb-scoped-roles-v1': return ['replicaSetMatched', 'applicationGrantsMatched', 'readConcernRoleMatched', 'sidecarAccountStateMatched'].some(no);
    case 'redis-policy-v1': return yes('unauthenticatedCommandAccepted') || positive('hostPublicationCount');
    default: return invalid();
  }
}

export function hostMeasurementsOutcome(id: string, value: unknown): 'PASS' | 'FAIL' | 'ERROR' {
  const fields = HOST_EVIDENCE_FIELDS[id]; if (!fields) invalid();
  const m = proofMeasurements(value, fields, true); validateHostMeasurementRelations(id, m);
  if (hostFailureEstablished(id, m)) return 'FAIL';
  if (Object.keys(m).length !== Object.keys(fields).length) return 'ERROR';
  if (id === 'host-configuration-v1' && m.requiredSettingCount === 0) return 'ERROR';
  // The protected core inventory consists of app, Mongo and Redis, each unique.
  // Partial inspection never establishes safe publication of all three.
  if (id === 'docker-publications-v1' && m.inspectedContainerCount !== 3) return 'ERROR';
  if (id === 'reverse-proxy-v1' && m.inspectedUpstreamCount === 0) return 'ERROR';
  if (id === 'mongodb-scoped-roles-v1' && m.authenticatedConnectivity !== true) return 'ERROR';
  if (id === 'redis-policy-v1' && (m.auditConnectivity !== true || m.applicationConnectivity !== true)) return 'ERROR';
  return 'PASS';
}

const unavailablePrefix = 'unavailable measurement: ';
export function hostUnavailableObservations(id: string, metrics: Measurements): string[] {
  const fields = HOST_EVIDENCE_FIELDS[id]; if (!fields) invalid();
  return Object.keys(fields).filter(key => !Object.hasOwn(metrics, key)).sort().map(key => unavailablePrefix + key);
}
export function parseHostEvidenceMeasurements(id: string, status: 'PASS' | 'FAIL', value: unknown, observations: unknown): Measurements {
  const fields = HOST_EVIDENCE_FIELDS[id]; if (!fields) invalid();
  const metrics = proofMeasurements(value, fields, status === 'FAIL');
  if (hostMeasurementsOutcome(id, metrics) !== status) invalid();
  const expected = hostUnavailableObservations(id, metrics);
  if (observations !== undefined && !Array.isArray(observations)) invalid();
  const markers = (observations as unknown[] | undefined ?? []).filter(item => typeof item === 'string' && item.startsWith(unavailablePrefix));
  if (markers.length !== expected.length || expected.some(marker => markers.filter(value => value === marker).length !== 1)) invalid();
  return metrics;
}
