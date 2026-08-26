import { control, section } from './audit-lib.mjs';

function controlById(auditSection, controlId) {
  return auditSection?.controls?.find((entry) => entry?.controlId === controlId);
}

function numericMetric(auditControl, metricName) {
  const value = auditControl?.evidence?.metrics?.[metricName];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function booleanMetric(auditControl, metricName) {
  const value = auditControl?.evidence?.metrics?.[metricName];
  return typeof value === 'boolean' ? value : null;
}

export function resolveCompositeUdpExposure(externalSection, internalSection) {
  const udp = controlById(externalSection, 'external.public-udp-ports');
  if (!udp) return externalSection;

  // A positive external response is already conclusive and cannot be
  // overridden by host evidence.
  if (udp.status === 'FAIL') return externalSection;

  const externalCompleted = udp.status === 'PASS'
    || (udp.status === 'ERROR' && udp.evidence?.metrics?.inconclusive === true);
  if (!externalCompleted) return externalSection;

  const listeners = controlById(internalSection, 'internal.listening-sockets');
  const firewall = controlById(internalSection, 'internal.firewall');
  const docker = controlById(internalSection, 'internal.docker-ports');
  const unexpectedUdpListenerCount = numericMetric(listeners, 'unexpectedUdpListenerCount');
  const unexpectedUdpFirewallAllowRuleCount = numericMetric(firewall, 'unexpectedUdpAllowRuleCount');
  const unexpectedUdpDockerPublicationCount = numericMetric(docker, 'unexpectedUdpPublicationCount');
  const firewallActive = booleanMetric(firewall, 'firewallActive');
  const defaultDenyInbound = booleanMetric(firewall, 'defaultDenyInbound');
  const internalEvidenceComplete = [
    unexpectedUdpListenerCount,
    unexpectedUdpFirewallAllowRuleCount,
    unexpectedUdpDockerPublicationCount,
    firewallActive,
    defaultDenyInbound,
  ].every((value) => value !== null);

  let status = 'ERROR';
  let severity = 'HIGH';
  let summary = 'The external UDP scan completed, but the required host UDP evidence was missing or malformed.';
  if (internalEvidenceComplete) {
    const unsafe = unexpectedUdpListenerCount > 0
      || unexpectedUdpFirewallAllowRuleCount > 0
      || unexpectedUdpDockerPublicationCount > 0
      || !firewallActive
      || !defaultDenyInbound;
    if (unsafe) {
      status = 'FAIL';
      summary = 'Host listener, Docker publication, or firewall evidence contradicts the approved public UDP exposure policy.';
    } else {
      status = 'PASS';
      severity = 'CRITICAL';
      summary = udp.status === 'PASS'
        ? 'External closure and host evidence agree that the selected UDP services are not publicly exposed.'
        : 'External probes received no service response, and host listener, Docker, and firewall evidence confirms that the selected UDP services are not publicly exposed.';
    }
  }

  const resolved = control(
    udp.controlId,
    udp.title,
    status,
    severity,
    summary,
    {
      observations: udp.evidence?.observations,
      metrics: {
        ...(udp.evidence?.metrics || {}),
        internalEvidenceComplete,
        unexpectedUdpListenerCount: unexpectedUdpListenerCount ?? -1,
        unexpectedUdpAllowRuleCount: unexpectedUdpFirewallAllowRuleCount ?? -1,
        unexpectedUdpPublicationCount: unexpectedUdpDockerPublicationCount ?? -1,
        firewallActive: firewallActive ?? false,
        defaultDenyInbound: defaultDenyInbound ?? false,
        inconclusive: status === 'ERROR',
      },
    },
  );
  return section(externalSection.sectionId, externalSection.controls.map((entry) => (
    entry.controlId === udp.controlId ? resolved : entry
  )));
}
