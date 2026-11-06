import { HOST_OBSERVATION_SCHEMA, hostObservationContractDigest } from '../../../../common/securityAudit/hostObservations.ts';

export const hostNow = new Date('2026-11-05T12:02:00.000Z');
export const safeHostMeasurements = {
  configuration: { requiredSettingCount: 18, presentSettingCount: 18, rootOwned: true, rootOnly: true },
  listeners: { inspectedListenerCount: 4, unexpectedStandardListenerCount: 0, unexpectedSensitiveListenerCount: 0,
    unexpectedStandardUdpListenerCount: 0, unexpectedSensitiveUdpListenerCount: 0 },
  application: { expectedListenerPresent: true },
  sidecar: { absenceRequired: true, listenerCount: 0, helperContainerCount: 0, endpointDeclarationCount: 0, publicationCount: 0, loopbackOnly: true },
  docker: { inspectedContainerCount: 3, unexpectedPublicationCount: 0, unexpectedUdpPublicationCount: 0, privateNetworkModeCount: 0 },
  firewall: { firewallActive: true, defaultDenyInbound: true, publicWebAllowed: true, scopedSshOnly: true, unexpectedAllowRuleCount: 0, unexpectedUdpAllowRuleCount: 0 },
  proxy: { configuredHostMatched: true, httpLoopbackOnly: true, websocketLoopbackOnly: true, inspectedUpstreamCount: 2 },
  mongoUnauthenticated: { unauthenticatedReadAccepted: false },
  mongoRoles: { authenticatedConnectivity: true, replicaSetMatched: true, applicationGrantsMatched: true, readConcernRoleMatched: true, sidecarAccountStateMatched: true },
  redis: { unauthenticatedCommandAccepted: false, auditConnectivity: true, applicationConnectivity: true, hostPublicationCount: 0 },
};
export async function hostFixture() {
  return { observationSchema: HOST_OBSERVATION_SCHEMA, contractDigestSha256: await hostObservationContractDigest(),
    observedAt: '2026-11-05T12:01:00.000Z', observations: Object.fromEntries(Object.entries(safeHostMeasurements)
      .map(([group, fields]) => [group, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { state: 'observed', value }]))])) };
}
export function unavailableFact(fixture, group, key, reason = 'transport') {
  fixture.observations[group][key] = { state: 'unavailable', reason };
}
