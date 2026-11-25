import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';
import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { AUDIT_ERROR_CATEGORIES } from '../../../common/securityAudit/evidenceContracts.ts';
import { parseNmapTlsCipherReport } from '../scanner-parsers.mjs';
import { runCommand } from '../audit-lib.mjs';
import { EXTERNAL_UDP_PORTS_V2, EXTERNAL_SENSITIVE_TCP_PORTS_V2, parseExternalNmapV2, canonicalExternalAddressV2 } from './observationsV2.mjs';

export class ExternalProbeErrorV2 extends Error {
  constructor(category) {
    super('External acquisition did not complete');
    if (!AUDIT_ERROR_CATEGORIES.includes(category)) throw new Error('Invalid external acquisition category');
    this.category = category;
  }
}
const observed = value => ({ state: 'observed', value });
const unavailable = reason => ({ state: 'unavailable', reason });
const malformed = () => { throw new ExternalProbeErrorV2('producer-malformed'); };
async function capture(work) {
  try { return observed(await work()); }
  catch (error) { return unavailable(error instanceof ExternalProbeErrorV2 ? error.category : 'transport'); }
}

async function resolve(hostname) {
  if (net.isIP(hostname)) return [hostname];
  const results = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
  const addresses = [];
  for (const result of results) {
    if (result.status === 'fulfilled') addresses.push(...result.value);
    else if (!['ENODATA', 'ENOTFOUND'].includes(result.reason?.code)) throw new ExternalProbeErrorV2('transport');
  }
  return addresses;
}

async function scan({ address, protocol }) {
  const args = [...(net.isIP(address) === 6 ? ['-6'] : []), '-Pn', '-n', protocol === 'tcp' ? '-sT' : '-sU',
    '--reason', ...(protocol === 'tcp' ? ['-p-'] : ['-p', EXTERNAL_UDP_PORTS_V2.join(',')]), '-oX', '-', address];
  const result = protocol === 'udp'
    ? await runCommand('sudo', ['-n', 'nmap', ...args], { timeoutMs: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
    : await runCommand('nmap', args, { timeoutMs: 45 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  if (!result.ok) throw new ExternalProbeErrorV2('transport');
  return result.stdout;
}

function boundedSocketProbe(socket, resolve, reject) {
  let complete = false;
  const finish = (error, value) => {
    if (complete) return;
    complete = true;
    clearTimeout(deadline);
    socket.destroy();
    if (error) reject(error); else resolve(value);
  };
  // An idle timeout can be reset by a trickle of bytes. This overall budget
  // includes connection and handshake/header acquisition and never resets.
  const deadline = setTimeout(() => finish(new ExternalProbeErrorV2('timeout')), 10_000);
  socket.once('close', () => finish(new ExternalProbeErrorV2('evidence-incomplete')));
  return finish;
}

// A handshake-only observer sends no HTTP request, application data or credential.
// Certificate verification still runs; its result is measured separately from
// protocol negotiation. Normal HTTP/WSS probes retain certificate enforcement.
// Node ownership: https://nodejs.org/download/release/v24.22.1/docs/api/tls.html
function handshake({ address, hostname, protocol }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: address, port: 443, servername: net.isIP(hostname) ? undefined : hostname,
      minVersion: protocol, maxVersion: protocol, rejectUnauthorized: false,
      // Offer legacy handshakes only for this credential-free observation;
      // local cipher restrictions must not masquerade as remote rejection.
      ...(['TLSv1', 'TLSv1.1'].includes(protocol) ? { ciphers: 'DEFAULT@SECLEVEL=0' } : {}) });
    const finish = boundedSocketProbe(socket, resolve, reject);
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const result = { accepted: socket.getProtocol() === protocol,
        authorized: socket.authorized === true && !tls.checkServerIdentity(hostname, certificate), validTo: certificate.valid_to };
      finish(null, result);
    });
    socket.once('error', error => {
      // Only the explicit peer protocol-version alert establishes rejection.
      // A reset, local crypto restriction or arbitrary exception is unavailable.
      if (error.code === 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION') finish(null, { accepted: false });
      else finish(new ExternalProbeErrorV2('transport'));
    });
  });
}

async function request(url) {
  let response;
  try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw new ExternalProbeErrorV2(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport'); }
  try { return { status: response.status, headers: response.headers }; }
  finally { try { await response.body?.cancel(); } catch { /* No response body is retained. */ } }
}

function websocket({ address, hostname, secure }) {
  return new Promise((resolve, reject) => {
    let response = '';
    const connected = () => socket.write(`GET /websocket HTTP/1.1\r\nHost: ${net.isIP(hostname) === 6 ? `[${hostname}]` : hostname}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const socket = secure
      ? tls.connect({ host: address, port: 443, servername: net.isIP(hostname) ? undefined : hostname,
        rejectUnauthorized: true, checkServerIdentity: (_name, certificate) => tls.checkServerIdentity(hostname, certificate) }, connected)
      : net.connect({ host: address, port: 80 }, connected);
    const finish = boundedSocketProbe(socket, resolve, reject);
    socket.once('error', () => finish(new ExternalProbeErrorV2('transport')));
    socket.once('end', () => { if (!response.includes('\r\n\r\n')) finish(new ExternalProbeErrorV2('evidence-incomplete')); });
    socket.on('data', chunk => {
      response += chunk.toString('latin1');
      if (response.length > 8192) { finish(new ExternalProbeErrorV2('evidence-incomplete')); return; }
      if (response.includes('\r\n\r\n')) {
        const line = response.split('\r\n', 1)[0], match = /^HTTP\/1\.[01] ([1-5]\d\d)(?: |$)/.exec(line);
        if (!match) finish(new ExternalProbeErrorV2('producer-malformed')); else finish(null, Number(match[1]));
      }
    });
  });
}

async function ciphers({ address }) {
  const result = await runCommand('nmap', [...(net.isIP(address) === 6 ? ['-6'] : []), '-Pn', '-n', '-p', '443',
    '--script', 'ssl-enum-ciphers', address], { timeoutMs: 20 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  if (!result.ok) throw new ExternalProbeErrorV2('transport');
  try { return parseNmapTlsCipherReport(result.stdout); } catch { return malformed(); }
}

export const EXTERNAL_PROBE_IO_V2 = Object.freeze({ resolve, scan, handshake, request, websocket, ciphers });

// The full producer and targeted recovery checks share these exact HTTP probes.
// This returns only its four owned observations, not a complete report or scan.
export async function acquireExternalHttpObservationsV2({ env = process.env, io = EXTERNAL_PROBE_IO_V2 } = {}) {
  const target = new URL(auditTargetOrigin(env.AUDIT_TARGET)), observations = {};
  if (typeof io?.request !== 'function') throw new Error('Invalid HTTP acquisition configuration');
  observations['external.http-redirect'] = await capture(async () => {
    const paths = ['/', '/auth/login', '/.well-known/security.txt?audit=1'];
    const pass = await Promise.all(paths.map(async pathname => {
      const url = new URL(pathname, target); url.protocol = 'http:';
      const result = await io.request(url);
      if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599 || !(result.headers instanceof Headers)) return malformed();
      const location = result.headers.get('location');
      if (result.status < 301 || result.status > 308 || !location) return false;
      let redirected; try { redirected = new URL(location, url); } catch { return false; }
      return redirected.origin === target.origin && redirected.pathname + redirected.search === pathname;
    }));
    return { testedPathCount: paths.length, passingPathCount: pass.filter(Boolean).length };
  });
  const headers = await capture(async () => {
    const response = await io.request(target);
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599 || !(response.headers instanceof Headers)) return malformed();
    return response.headers;
  });
  for (const id of ['hsts', 'csp', 'security-headers']) observations[`external.${id}`] = headers.state !== 'observed' ? headers : (() => {
    const h = headers.value, hsts = h.get('strict-transport-security') || '', csp = h.get('content-security-policy') || '';
    const matches = id === 'hsts' ? [Number(hsts.match(/max-age=(\d+)/i)?.[1]) >= 31536000]
      : id === 'csp' ? [...['frame-ancestors', 'object-src', 'base-uri', 'form-action'].map(name => csp.includes(name)),
        !/(?:^|[;\s])\*(?=[;\s]|$)|http:/i.test(csp)]
        : [/^deny$/i.test(h.get('x-frame-options') || ''), /^nosniff$/i.test(h.get('x-content-type-options') || ''),
          h.get('referrer-policy') === 'strict-origin-when-cross-origin', h.get('permissions-policy') === 'geolocation=(), microphone=(self)'];
    return observed({ requiredRestrictionCount: matches.length, matchingRestrictionCount: matches.filter(Boolean).length });
  })();
  return observations;
}

export async function acquireExternalObservationsV2({ env = process.env, now = new Date(), io = EXTERNAL_PROBE_IO_V2 } = {}) {
  const target = new URL(auditTargetOrigin(env.AUDIT_TARGET));
  if (target.port || !(now instanceof Date) || !Number.isFinite(now.getTime())
    || Object.keys(EXTERNAL_PROBE_IO_V2).some(name => typeof io?.[name] !== 'function')) {
    throw new Error('External V2 acquisition configuration is invalid');
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, ''), observations = {};
  const inventory = await capture(async () => {
    const raw = await io.resolve(hostname);
    if (!Array.isArray(raw) || raw.length > 32 || raw.some(address => !net.isIP(address))) return malformed();
    let addresses;
    try { addresses = [...new Set(raw.map(canonicalExternalAddressV2))]; } catch { return malformed(); }
    if (!addresses.length) throw new ExternalProbeErrorV2('evidence-incomplete');
    return addresses;
  });
  observations['external.dns-addresses'] = inventory.state === 'observed' ? observed({ addressCount: inventory.value.length }) : inventory;
  const addresses = inventory.state === 'observed' ? inventory.value : [];
  const scanAddress = async (address, protocol) => {
    const xml = await io.scan({ address, protocol });
    try { return parseExternalNmapV2(xml, { address, protocol }); } catch { return malformed(); }
  };
  const tcp = inventory.state === 'observed' ? await capture(async () => {
    // Preserve V1's one-Nmap-process-at-a-time resource bound.
    const scans = [];
    for (const address of addresses) scans.push(await scanAddress(address, 'tcp'));
    if (scans.some(scan => scan.inconclusiveEndpointCount)) throw new ExternalProbeErrorV2('evidence-incomplete');
    return scans;
  }) : inventory;
  for (const tier of ['standard', 'sensitive']) {
    observations[`external.public-tcp-ports.${tier}`] = tcp.state !== 'observed' ? tcp : observed({
      addressCount: addresses.length, testedEndpointCount: tcp.value.reduce((sum, scan) => sum + scan.testedEndpointCount, 0),
      unexpectedPortCount: tcp.value.reduce((sum, scan) => sum + scan.openPorts.filter(port => ![80, 443].includes(port)
        && EXTERNAL_SENSITIVE_TCP_PORTS_V2.includes(port) === (tier === 'sensitive')).length, 0),
      missingRequiredPortCount: tier === 'sensitive' ? 0
        : tcp.value.reduce((sum, scan) => sum + [80, 443].filter(port => !scan.openPorts.includes(port)).length, 0),
    });
  }
  let udp = inventory;
  if (inventory.state === 'observed') {
    const valid = [];
    for (const address of addresses) {
      try { valid.push(await scanAddress(address, 'udp')); }
      catch { /* Unknown results contribute no conclusive coverage, not invented closed ports. */ }
    }
    udp = observed({ expectedResultCount: addresses.length * EXTERNAL_UDP_PORTS_V2.length,
      observedResultCount: valid.reduce((sum, scan) => sum + scan.testedEndpointCount - scan.inconclusiveEndpointCount, 0),
      openSelectedUdpPortCount: valid.reduce((sum, scan) => sum + scan.openPorts.length, 0) });
  }
  Object.assign(observations, await acquireExternalHttpObservationsV2({ env, io }));
  const protocols = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
  const handshakes = inventory.state === 'observed' ? await Promise.all(addresses.map(async address =>
    Promise.all(protocols.map(protocol => capture(async () => {
      const probe = await io.handshake({ address, hostname, protocol });
      if (typeof probe?.accepted !== 'boolean') return malformed();
      return probe;
    }))))) : [];
  observations['external.tls-protocols'] = inventory.state !== 'observed' ? inventory : await capture(async () => {
    const all = handshakes.flat();
    const missing = all.find(probe => probe.state !== 'observed');
    if (missing) throw new ExternalProbeErrorV2(missing.reason);
    return { addressCount: addresses.length, testedProtocolCount: all.length,
      acceptedLegacyCount: handshakes.reduce((sum, probes) => sum + probes.slice(0, 2).filter(probe => probe.value.accepted).length, 0),
      rejectedModernCount: handshakes.reduce((sum, probes) => sum + probes.slice(2).filter(probe => !probe.value.accepted).length, 0) };
  });
  observations['external.certificate'] = inventory.state !== 'observed' ? inventory : await capture(async () => {
    const certificates = handshakes.map(probes => {
      const modern = probes.slice(2), missing = modern.find(probe => probe.state !== 'observed');
      if (missing) throw new ExternalProbeErrorV2(missing.reason);
      const accepted = modern.map(probe => probe.value).filter(probe => probe.accepted);
      if (!accepted.length || accepted.some(probe => typeof probe.authorized !== 'boolean'
        || typeof probe.validTo !== 'string' || !Number.isFinite(Date.parse(probe.validTo)))) {
        throw new ExternalProbeErrorV2('evidence-incomplete');
      }
      return accepted;
    });
    return { addressCount: addresses.length, validatedCertificateCount: certificates.filter(probes => probes.every(probe => probe.authorized)).length,
      minimumValidityDays: Math.floor(Math.min(...certificates.flat().map(probe => (Date.parse(probe.validTo) - now.getTime()) / 86400000))) };
  });
  observations['external.tls-ciphers'] = inventory.state !== 'observed' ? inventory : await capture(async () => {
    const results = [];
    for (const address of addresses) results.push(await io.ciphers({ address }));
    if (results.some(row => !Number.isSafeInteger(row?.cipherCount) || row.cipherCount < 1
      || !Number.isSafeInteger(row.weakCipherCount) || row.weakCipherCount < 0 || row.weakCipherCount > row.cipherCount)) return malformed();
    return { cipherCount: results.reduce((sum, row) => sum + row.cipherCount, 0),
      weakCipherCount: results.reduce((sum, row) => sum + row.weakCipherCount, 0) };
  });
  observations['external.websocket-tls'] = inventory.state !== 'observed' ? inventory : await capture(async () => {
    const results = await Promise.all(addresses.map(async address => Promise.all([true, false].map(secure => io.websocket({ address, hostname, secure })))));
    if (results.flat().some(status => !Number.isInteger(status) || status < 100 || status > 599)) return malformed();
    return { addressCount: addresses.length, secureUpgradeCount: results.filter(row => row[0] === 101).length,
      insecureUpgradeCount: results.filter(row => row[1] === 101).length };
  });
  return { observations, udp };
}
