import net from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

// Same selected scan scope as V1. This inert implementation replaces V1 at
// cutover; the executable V1 parser/producers are intentionally unchanged.
export const EXTERNAL_UDP_PORTS_V2 = Object.freeze([53, 123, 443, 6379, 8931, 8932, 27017]);
export const EXTERNAL_SENSITIVE_TCP_PORTS_V2 = Object.freeze([3000, 27017, 6379, 8931, 8932]);
const invalid = () => { throw new Error('Invalid external scan observations'); };
const count = value => {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,5})$/.test(value)) invalid();
  return Number(value);
};
const arrayPaths = new Set(['nmaprun.scaninfo', 'nmaprun.host', 'nmaprun.host.address',
  'nmaprun.host.ports.port', 'nmaprun.host.ports.extraports']);

export function canonicalExternalAddressV2(address) {
  const family = net.isIP(address);
  if (!family) invalid();
  if (family === 4) return address;
  try { return new URL(`http://[${address}]/`).hostname.slice(1, -1); } catch { return invalid(); }
}

// Reuse the application's existing XML dependency, with entity processing off.
// The full scan inventory and completion marker are required; a handful of
// port rows alone is not proof that the requested address/port scope ran.
export function parseExternalNmapV2(xml, { address, protocol }) {
  if (!net.isIP(address) || !['tcp', 'udp'].includes(protocol) || typeof xml !== 'string'
    || Buffer.byteLength(xml) > 8 * 1024 * 1024 || /<!ENTITY/i.test(xml)
    || /<!DOCTYPE(?!\s+nmaprun\s*>)/i.test(xml) || XMLValidator.validate(xml) !== true) invalid();
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    processEntities: false, ignoreDeclaration: true, ignorePiTags: true,
    isArray: (_name, jsonPath) => arrayPaths.has(jsonPath) }).parse(xml);
  if (Object.keys(parsed).length !== 1 || !parsed.nmaprun || Array.isArray(parsed.nmaprun)) invalid();
  const run = parsed.nmaprun, scans = run.scaninfo, hosts = run.host;
  if (run['@_scanner'] !== 'nmap' || run.runstats?.finished?.['@_exit'] !== 'success'
    || run.runstats?.hosts?.['@_up'] !== '1' || run.runstats?.hosts?.['@_down'] !== '0'
    || run.runstats?.hosts?.['@_total'] !== '1' || !Array.isArray(scans) || scans.length !== 1
    || scans[0]['@_protocol'] !== protocol || scans[0]['@_type'] !== (protocol === 'tcp' ? 'connect' : 'udp')
    || !Array.isArray(hosts) || hosts.length !== 1 || hosts[0].status?.['@_state'] !== 'up') invalid();
  const expected = protocol === 'tcp' ? 65535 : EXTERNAL_UDP_PORTS_V2.length;
  if (count(scans[0]['@_numservices']) !== expected || typeof scans[0]['@_services'] !== 'string') invalid();
  const selected = new Set();
  for (const range of scans[0]['@_services'].split(',')) {
    if (!/^[1-9]\d{0,4}(?:-[1-9]\d{0,4})?$/.test(range)) invalid();
    const [start, end = start] = range.split('-').map(Number);
    if (start > end || end > 65535 || end - start + 1 > expected) invalid();
    for (let port = start; port <= end; port++) {
      if (selected.has(port) || (protocol === 'udp' && !EXTERNAL_UDP_PORTS_V2.includes(port))) invalid();
      selected.add(port);
    }
  }
  if (selected.size !== expected) invalid();
  const addresses = hosts[0].address;
  if (!Array.isArray(addresses)) invalid();
  const ipAddresses = addresses.filter(row => ['ipv4', 'ipv6'].includes(row['@_addrtype']));
  if (ipAddresses.length !== 1 || canonicalExternalAddressV2(ipAddresses[0]['@_addr']) !== canonicalExternalAddressV2(address)
    || ipAddresses[0]['@_addrtype'] !== (net.isIP(address) === 6 ? 'ipv6' : 'ipv4')) invalid();
  const ports = hosts[0].ports;
  if (!ports || Array.isArray(ports)) invalid();
  const seen = new Set(), openPorts = [], summaries = new Set();
  let testedEndpointCount = 0, inconclusiveEndpointCount = 0;
  for (const row of ports.port || []) {
    const port = count(row['@_portid']), state = row.state?.['@_state'];
    if (row['@_protocol'] !== protocol || !selected.has(port) || seen.has(port) || typeof state !== 'string') invalid();
    seen.add(port); testedEndpointCount++;
    if (state === 'open' && (protocol === 'tcp' || row.state['@_reason'] === 'udp-response')) openPorts.push(port);
    else if (state !== 'closed' && !(protocol === 'tcp' && state === 'filtered')) inconclusiveEndpointCount++;
  }
  for (const row of ports.extraports || []) {
    const state = row['@_state'], amount = count(row['@_count']);
    if (!['closed', 'filtered', 'open|filtered'].includes(state) || summaries.has(state) || amount < 1) invalid();
    summaries.add(state); testedEndpointCount += amount;
    if (state !== 'closed' && !(protocol === 'tcp' && state === 'filtered')) inconclusiveEndpointCount += amount;
  }
  if (testedEndpointCount !== expected) invalid();
  return { testedEndpointCount, inconclusiveEndpointCount, openPorts };
}

function establishedOutcome(id, m) {
  const require = condition => { if (!condition) invalid(); };
  if (id === 'external.dns-addresses') { require(m.addressCount > 0); return true; }
  if (id.startsWith('external.public-tcp-ports.')) {
    require(m.addressCount > 0 && m.testedEndpointCount === m.addressCount * 65535
      && m.unexpectedPortCount <= m.testedEndpointCount && m.missingRequiredPortCount <= m.addressCount * 2);
    if (id.endsWith('.sensitive')) require(m.missingRequiredPortCount === 0);
    return m.unexpectedPortCount === 0 && m.missingRequiredPortCount === 0;
  }
  if (id === 'external.http-redirect') {
    require(m.testedPathCount === 3 && m.passingPathCount <= m.testedPathCount);
    return m.passingPathCount === m.testedPathCount;
  }
  if (id === 'external.tls-protocols') {
    require(m.addressCount > 0 && m.testedProtocolCount === m.addressCount * 4
      && m.acceptedLegacyCount <= m.addressCount * 2 && m.rejectedModernCount <= m.addressCount * 2);
    return m.acceptedLegacyCount === 0 && m.rejectedModernCount === 0;
  }
  if (id === 'external.certificate') {
    require(m.addressCount > 0 && m.validatedCertificateCount <= m.addressCount);
    return m.validatedCertificateCount === m.addressCount && m.minimumValidityDays >= 30;
  }
  if (id === 'external.tls-ciphers') {
    require(m.cipherCount > 0 && m.weakCipherCount <= m.cipherCount); return m.weakCipherCount === 0;
  }
  if (id === 'external.websocket-tls') {
    require(m.addressCount > 0 && m.secureUpgradeCount <= m.addressCount && m.insecureUpgradeCount <= m.addressCount);
    return m.secureUpgradeCount === m.addressCount && m.insecureUpgradeCount === 0;
  }
  const required = { 'external.hsts': 1, 'external.csp': 5, 'external.security-headers': 4 }[id];
  require(required && m.requiredRestrictionCount === required && m.matchingRestrictionCount <= required);
  return m.matchingRestrictionCount === required;
}

// Acquisition emits bounded metrics or an explicit unavailable category. It
// never emits evaluated V1 controls or catalog titles/severity/profile metadata.
export function evaluateExternalObservationsV2(catalog, profile, observations) {
  const definitions = profileControls(catalog, profile).filter(row => row.producerId === 'external');
  if (!definitions.length || (observations !== undefined && (!observations || typeof observations !== 'object'
    || Array.isArray(observations) || Object.keys(observations).some(id => !definitions.some(row => row.controlId === id))))) invalid();
  const controls = definitions.map(definition => {
    const input = observations?.[definition.controlId];
    let status, evidence;
    try {
      if (input === undefined) {
        status = 'ERROR'; evidence = { category: 'evidence-incomplete', summary: 'Required external measurements are unavailable.' };
      } else if (input.state === 'unavailable' && Object.keys(input).length === 2 && Object.hasOwn(input, 'reason')) {
        status = 'ERROR'; evidence = { category: input.reason, summary: 'External acquisition did not establish this control.' };
      } else {
        if (input.state !== 'observed' || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'value')) invalid();
        status = establishedOutcome(definition.controlId, input.value) ? 'PASS' : 'FAIL';
        evidence = { metrics: input.value, summary: status === 'PASS'
          ? 'Complete external observations match the approved policy.' : 'Complete external observations establish a policy violation.' };
      }
      evidence = parseAuditEvidence(definition.evidenceContract, status, evidence);
    } catch {
      status = 'ERROR'; evidence = { category: 'producer-malformed', summary: 'External measurements did not satisfy this control contract.' };
    }
    return { controlId: definition.controlId, status, evidence };
  });
  return parseAuditProducerArtifact({ artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1',
    producerId: 'external', sectionId: 'external', controls }, catalog, profile, 'external');
}
