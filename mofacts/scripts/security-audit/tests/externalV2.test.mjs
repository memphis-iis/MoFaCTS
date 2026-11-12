import { safeExternalObservationsV2 as observations } from './fixtures/externalFixtures.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import tls from 'node:tls';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseAuditProducerArtifact } from '../../../common/securityAudit/producerArtifact.ts';
import { evaluateExternalObservationsV2, parseExternalNmapV2 } from '../external/observationsV2.mjs';
import { acquireExternalObservationsV2, acquireExternalHttpObservationsV2, EXTERNAL_PROBE_IO_V2, ExternalProbeErrorV2 } from '../external/acquireV2.mjs';
import { evaluateUdpExposure } from '../composite/udpExposure.mjs';
import { writeExternalProducerFilesV2 } from '../external/producerFilesV2.mjs';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';

const address = '192.0.2.10';
function nmap({ protocol = 'tcp', ip = address, rows, extraState = 'closed', extraCount, services, numservices } = {}) {
  rows ??= protocol === 'tcp' ? [[80, 'open'], [443, 'open']] : [[53, 'open', 'udp-response']];
  numservices ??= protocol === 'tcp' ? 65535 : 7;
  services ??= protocol === 'tcp' ? '1-65535' : '53,123,443,6379,8931-8932,27017';
  extraCount ??= numservices - rows.length;
  return `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun scanner="nmap">
    <scaninfo type="${protocol === 'tcp' ? 'connect' : 'udp'}" protocol="${protocol}" numservices="${numservices}" services="${services}"/>
    <host><status state="up"/><address addr="${ip}" addrtype="${ip.includes(':') ? 'ipv6' : 'ipv4'}"/>
    <ports>${extraCount ? `<extraports state="${extraState}" count="${extraCount}"/>` : ''}${rows.map(([port, state, reason = 'syn-ack']) =>
      `<port protocol="${protocol}" portid="${port}"><state state="${state}" reason="${reason}"/></port>`).join('')}</ports></host>
    <runstats><finished exit="success"/><hosts up="1" down="0" total="1"/></runstats></nmaprun>`;
}

test('V2 Nmap acquisition validates exact scope/completion for IPv4 and IPv6 before deriving counts', () => {
  for (const ip of [address, '2001:db8::10']) {
    assert.deepEqual(parseExternalNmapV2(nmap({ ip }), { address: ip, protocol: 'tcp' }), {
      testedEndpointCount: 65535, inconclusiveEndpointCount: 0, openPorts: [80, 443] });
    assert.deepEqual(parseExternalNmapV2(nmap({ protocol: 'udp', ip }), { address: ip, protocol: 'udp' }), {
      testedEndpointCount: 7, inconclusiveEndpointCount: 0, openPorts: [53] });
  }
});

test('V2 Nmap rejects incomplete, duplicate, foreign, contradictory and failed scans', () => {
  const complete = nmap();
  for (const candidate of [
    complete.replace('exit="success"', 'exit="error"'), complete.replace('total="1"', 'total="2"'),
    complete.replace('up="1"', 'up="0"'), complete.replace('state="up"', 'state="down"'),
    nmap({ numservices: 65534 }), nmap({ services: '1-65534,65534' }), nmap({ extraCount: 65534 }),
    nmap({ rows: [[80, 'open'], [80, 'closed']] }), nmap({ rows: [[65536, 'open']] }),
    complete.replace('addr="192.0.2.10"', 'addr="192.0.2.11"'), complete.replace('type="connect"', 'type="syn"'),
    complete.replace('<extraports', '<extraports state="closed" count="65533"/><extraports'),
    complete.replace('</nmaprun>', ''), complete + '<extra/>', '<nmaprun></nmaprun>',
  ]) assert.throws(() => parseExternalNmapV2(candidate, { address, protocol: 'tcp' }));
  assert.throws(() => parseExternalNmapV2(nmap({ protocol: 'udp', rows: [[22, 'closed']] }), { address, protocol: 'udp' }));
});

test('V2 Nmap rejects XML entity/DTD expansion and oversized output', () => {
  for (const candidate of [nmap().replace('<!DOCTYPE nmaprun>', '<!DOCTYPE nmaprun SYSTEM "PRIVATE">'),
    nmap().replace('<!DOCTYPE nmaprun>', '<!DOCTYPE nmaprun [<!ENTITY secret "PRIVATE">]>'),
    ' '.repeat(8 * 1024 * 1024 + 1)]) {
    assert.throws(() => parseExternalNmapV2(candidate, { address, protocol: 'tcp' }));
  }
});

test('V2 UDP counts only actual service responses or closed results as conclusive', () => {
  for (const [state, reason, expectedOpen] of [['open', 'udp-response', [53]], ['open', 'no-response', []],
    ['open|filtered', 'no-response', []], ['filtered', 'admin-prohibited', []]]) {
    const observed = parseExternalNmapV2(nmap({ protocol: 'udp', rows: [[53, state, reason]], extraState: 'open|filtered' }),
      { address, protocol: 'udp' });
    assert.deepEqual(observed.openPorts, expectedOpen);
    assert.equal(observed.inconclusiveEndpointCount, expectedOpen.length ? 6 : 7);
    assert.equal(observed.testedEndpointCount, 7);
  }
});

const catalog = () => readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');

test('V2 external evaluator emits exact catalog subsets without final metadata or duplicate UDP ownership', async () => {
  for (const profile of ['full', 'exposure']) {
    const c = await catalog(), artifact = evaluateExternalObservationsV2(c, profile, observations());
    assert.equal(artifact.controls.length, 11); assert.ok(artifact.controls.every(row => row.status === 'PASS'));
    assert.equal(artifact.controls.some(row => row.controlId === 'external.public-udp-ports'), false);
    assert.equal(artifact.controls.some(row => Object.hasOwn(row, 'title') || Object.hasOwn(row, 'failureSeverity')), false);
    assert.deepEqual(parseAuditProducerArtifact(artifact, c, profile, 'external'), artifact);
  }
});

test('V2 external evaluator preserves fixed TCP tiers and independently evaluated header/certificate failures', async () => {
  const raw = observations();
  raw['external.public-tcp-ports.sensitive'].value.unexpectedPortCount = 1;
  raw['external.certificate'].value.minimumValidityDays = 29;
  raw['external.csp'].value.matchingRestrictionCount = 4;
  const rows = evaluateExternalObservationsV2(await catalog(), 'full', raw).controls;
  assert.equal(rows.find(row => row.controlId === 'external.public-tcp-ports.standard').status, 'PASS');
  for (const id of ['external.public-tcp-ports.sensitive', 'external.certificate', 'external.csp']) {
    assert.equal(rows.find(row => row.controlId === id).status, 'FAIL');
  }
});

test('V2 external evaluator rejects incomplete scope, impossible counts and untrusted metadata as explicit errors', async () => {
  const c = await catalog();
  for (const [id, key, value] of [
    ['external.dns-addresses', 'addressCount', 0], ['external.public-tcp-ports.standard', 'testedEndpointCount', 65534],
    ['external.tls-protocols', 'testedProtocolCount', 3], ['external.certificate', 'validatedCertificateCount', 2],
    ['external.http-redirect', 'passingPathCount', 4], ['external.tls-ciphers', 'cipherCount', 0],
    ['external.websocket-tls', 'secureUpgradeCount', 2], ['external.csp', 'requiredRestrictionCount', 4],
    ['external.hsts', 'matchingRestrictionCount', 2], ['external.security-headers', 'PRIVATE', true],
  ]) {
    const raw = observations(); raw[id].value[key] = value;
    const artifact = evaluateExternalObservationsV2(c, 'full', raw), row = artifact.controls.find(row => row.controlId === id);
    assert.equal(row.status, 'ERROR'); assert.equal(row.evidence.category, 'producer-malformed');
    assert.equal(JSON.stringify(artifact).includes('PRIVATE'), false);
  }
  assert.throws(() => evaluateExternalObservationsV2(c, 'full', { ...observations(), 'external.foreign': {} }));
});

test('V2 external evaluator retains per-control timeout/missing evidence without turning it into a finding', async () => {
  const raw = observations(); delete raw['external.certificate'];
  raw['external.tls-protocols'] = { state: 'unavailable', reason: 'timeout' };
  const rows = evaluateExternalObservationsV2(await catalog(), 'full', raw).controls;
  assert.equal(rows.find(row => row.controlId === 'external.tls-protocols').evidence.category, 'timeout');
  assert.equal(rows.find(row => row.controlId === 'external.certificate').evidence.category, 'evidence-incomplete');
  assert.ok(rows.filter(row => !['external.tls-protocols', 'external.certificate'].includes(row.controlId)).every(row => row.status === 'PASS'));
});

const env = { AUDIT_TARGET: 'https://audit.example' }, now = new Date('2026-11-05T12:02:00.000Z');
function ioFixture() {
  const calls = [];
  const methods = {
    async resolve() { return [address, '2001:db8::10']; },
    async scan({ address: ip, protocol }) { return nmap({ ip, protocol, ...(protocol === 'udp' ? { rows: [[53, 'closed', 'port-unreach']] } : {}) }); },
    async handshake({ protocol }) { return ['TLSv1', 'TLSv1.1'].includes(protocol)
      ? { accepted: false } : { accepted: true, authorized: true, validTo: '2026-12-20T12:02:00.000Z' }; },
    async request(url) {
      return url.protocol === 'http:' ? { status: 301, headers: new Headers({ location: 'https://audit.example' + url.pathname + url.search }) }
        : { status: 200, headers: new Headers({ 'strict-transport-security': 'max-age=31536000',
          'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'geolocation=(), microphone=(self)' }) };
    },
    async websocket({ secure }) { return secure ? 101 : 301; },
    async ciphers() { return { cipherCount: 3, weakCipherCount: 0 }; },
  };
  return { calls, io: Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (...args) => {
    calls.push({ name, args }); return method(...args);
  }])) };
}

test('targeted HTTP recovery reuses full-producer observations without repeating unrelated probes', async () => {
  const full = await acquireExternalObservationsV2({ env, now, io: ioFixture().io });
  const focused = ioFixture(), result = await acquireExternalHttpObservationsV2({ env, io: focused.io });
  assert.equal(Object.keys(result).length, 4);
  for (const [id, observation] of Object.entries(result)) assert.deepEqual(observation, full.observations[id]);
  assert.equal(focused.calls.length, 4);
  assert.ok(focused.calls.every(call => call.name === 'request'));
  const missing = await acquireExternalHttpObservationsV2({ env, io: { request: async () => { throw new ExternalProbeErrorV2('timeout'); } } });
  assert.ok(Object.values(missing).every(row => row.state === 'unavailable' && row.reason === 'timeout'));
});

test('V2 acquisition covers the resolved IPv4/IPv6 inventory and derives actual external/composite counts', async () => {
  const value = ioFixture(), result = await acquireExternalObservationsV2({ env, now, io: value.io });
  const artifact = evaluateExternalObservationsV2(await catalog(), 'full', result.observations);
  assert.ok(artifact.controls.every(row => row.status === 'PASS'));
  assert.deepEqual(result.udp, { state: 'observed', value: { expectedResultCount: 14, observedResultCount: 14, openSelectedUdpPortCount: 0 } });
  assert.deepEqual(result.observations['external.tls-protocols'].value,
    { addressCount: 2, testedProtocolCount: 8, acceptedLegacyCount: 0, rejectedModernCount: 0 });
  assert.deepEqual(result.observations['external.certificate'].value,
    { addressCount: 2, validatedCertificateCount: 2, minimumValidityDays: 45 });
  for (const [name, count] of [['scan', 4], ['handshake', 8], ['request', 4], ['websocket', 4], ['ciphers', 2]]) {
    assert.equal(value.calls.filter(call => call.name === name).length, count);
  }
});

test('V2 acquisition preserves one active Nmap process across addresses and scan families', async () => {
  const { io } = ioFixture(); let active = 0, maximum = 0;
  for (const name of ['scan', 'ciphers']) {
    const original = io[name];
    io[name] = async (...args) => {
      active++; maximum = Math.max(maximum, active);
      try { await new Promise(resolve => setImmediate(resolve)); return await original(...args); }
      finally { active--; }
    };
  }
  const result = await acquireExternalObservationsV2({ env, now, io });
  assert.equal(maximum, 1); assert.equal(active, 0);
  assert.ok(evaluateExternalObservationsV2(await catalog(), 'full', result.observations).controls.every(row => row.status === 'PASS'));
});

test('V2 acquisition splits observed sensitive/standard TCP findings and missing web ports', async () => {
  const { io } = ioFixture(), original = io.scan;
  io.scan = async input => input.protocol === 'tcp'
    ? nmap({ ip: input.address, rows: [[80, 'open'], [22, 'open'], [27017, 'open']] }) : original(input);
  const result = await acquireExternalObservationsV2({ env, now, io });
  assert.deepEqual(result.observations['external.public-tcp-ports.standard'].value,
    { addressCount: 2, testedEndpointCount: 131070, unexpectedPortCount: 2, missingRequiredPortCount: 2 });
  assert.deepEqual(result.observations['external.public-tcp-ports.sensitive'].value,
    { addressCount: 2, testedEndpointCount: 131070, unexpectedPortCount: 2, missingRequiredPortCount: 0 });
  const artifact = evaluateExternalObservationsV2(await catalog(), 'full', result.observations);
  assert.ok(artifact.controls.filter(row => row.controlId.startsWith('external.public-tcp-ports.')).every(row => row.status === 'FAIL'));
});

test('V2 acquisition preserves a real UDP response when another address scan fails', async () => {
  const { io } = ioFixture(), original = io.scan;
  io.scan = async input => {
    if (input.protocol !== 'udp') return original(input);
    if (input.address.includes(':')) throw new Error('PRIVATE scan failed');
    return nmap({ protocol: 'udp', rows: [[53, 'open', 'udp-response']] });
  };
  const result = await acquireExternalObservationsV2({ env, now, io });
  assert.deepEqual(result.udp.value, { expectedResultCount: 14, observedResultCount: 7, openSelectedUdpPortCount: 1 });
  const artifact = evaluateUdpExposure(await catalog(), 'full', result.udp.value, undefined);
  assert.equal(artifact.controls[0].status, 'FAIL'); assert.equal(Object.keys(artifact.controls[0].evidence.metrics).length, 3);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('V2 acquisition keeps inconclusive UDP results incomplete and malformed TCP scans as errors', async () => {
  const { io } = ioFixture();
  io.scan = async ({ address: ip, protocol }) => protocol === 'tcp' ? '<PRIVATE/>'
    : nmap({ protocol, ip, rows: [[53, 'open|filtered', 'no-response']], extraState: 'open|filtered' });
  const result = await acquireExternalObservationsV2({ env, now, io });
  assert.equal(result.observations['external.public-tcp-ports.standard'].reason, 'producer-malformed');
  assert.deepEqual(result.udp.value, { expectedResultCount: 14, observedResultCount: 0, openSelectedUdpPortCount: 0 });
  assert.equal(evaluateUdpExposure(await catalog(), 'full', result.udp.value, undefined).controls[0].status, 'ERROR');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('V2 acquisition keeps TLS transport/timeout evidence separate from confirmed protocol rejection', async () => {
  const { io } = ioFixture(), original = io.handshake;
  io.handshake = async input => {
    if (input.protocol === 'TLSv1') throw new ExternalProbeErrorV2('timeout');
    return original(input);
  };
  const result = await acquireExternalObservationsV2({ env, now, io });
  assert.deepEqual(result.observations['external.tls-protocols'], { state: 'unavailable', reason: 'timeout' });
  assert.equal(result.observations['external.certificate'].state, 'observed');
  const artifact = evaluateExternalObservationsV2(await catalog(), 'full', result.observations);
  assert.equal(artifact.controls.find(row => row.controlId === 'external.tls-protocols').status, 'ERROR');
  assert.equal(artifact.controls.find(row => row.controlId === 'external.certificate').status, 'PASS');
});

test('V2 acquisition does not hide a different modern certificate or fabricate validity for a missing certificate', async () => {
  const { io } = ioFixture(), original = io.handshake;
  io.handshake = async input => input.protocol === 'TLSv1.3'
    ? { accepted: true, authorized: false, validTo: '2026-11-10T12:02:00.000Z' } : original(input);
  let result = await acquireExternalObservationsV2({ env, now, io });
  assert.equal(result.observations['external.certificate'].value.validatedCertificateCount, 0);
  assert.equal(result.observations['external.certificate'].value.minimumValidityDays, 5);
  assert.equal(evaluateExternalObservationsV2(await catalog(), 'full', result.observations).controls
    .find(row => row.controlId === 'external.certificate').status, 'FAIL');
  io.handshake = async input => input.protocol === 'TLSv1.3' ? { accepted: true, authorized: true } : original(input);
  result = await acquireExternalObservationsV2({ env, now, io });
  assert.deepEqual(result.observations['external.certificate'], { state: 'unavailable', reason: 'evidence-incomplete' });
});

test('V2 acquisition validates protected target, default web-port scope and full adapter interface before I/O', async () => {
  const value = ioFixture();
  for (const target of [undefined, 'http://audit.example', 'https://user:PRIVATE@audit.example', 'https://audit.example:8443', 'https://audit.example/path']) {
    await assert.rejects(acquireExternalObservationsV2({ env: { AUDIT_TARGET: target }, now, io: value.io }));
  }
  await assert.rejects(acquireExternalObservationsV2({ env, now, io: { resolve: value.io.resolve } }));
  assert.equal(value.calls.length, 0);
});

test('V2 acquisition treats missing/malformed DNS inventory as unavailable rather than scanning guessed addresses', async () => {
  for (const addresses of [[], ['--injected-option'], Array.from({ length: 33 }, (_, i) => `192.0.2.${i + 1}`)]) {
    const value = ioFixture(); value.io.resolve = async () => addresses;
    const result = await acquireExternalObservationsV2({ env, now, io: value.io });
    assert.equal(result.observations['external.dns-addresses'].state, 'unavailable');
    assert.equal(result.udp.state, 'unavailable');
    assert.equal(value.calls.some(call => ['scan', 'handshake', 'websocket', 'ciphers'].includes(call.name)), false);
  }
});

test('V2 acquisition normalizes equivalent IPv6 representations without inventing extra endpoints', async () => {
  const value = ioFixture(); value.io.resolve = async () => ['2001:0DB8:0000:0:0:0:0:10', '2001:db8::10'];
  const result = await acquireExternalObservationsV2({ env, now, io: value.io });
  assert.deepEqual(result.observations['external.dns-addresses'], { state: 'observed', value: { addressCount: 1 } });
  assert.equal(result.udp.value.expectedResultCount, 7);
  assert.equal(value.calls.filter(call => call.name === 'scan').length, 2);
  assert.deepEqual(parseExternalNmapV2(nmap({ ip: '2001:db8::10' }), { address: '2001:0db8:0:0:0:0:0:10', protocol: 'tcp' }).openPorts, [80, 443]);
});

test('V2 TLS adapter offers a legacy handshake only in its isolated observer and requires an explicit peer rejection', async t => {
  const seen = [];
  t.mock.method(tls, 'connect', options => {
    seen.push(options);
    const socket = new EventEmitter(); socket.setTimeout = () => {};
    socket.destroy = () => queueMicrotask(() => socket.emit('close'));
    queueMicrotask(() => socket.emit('error', { code: options.maxVersion === 'TLSv1'
      ? 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION' : 'ECONNRESET' }));
    return socket;
  });
  assert.deepEqual(await EXTERNAL_PROBE_IO_V2.handshake({ address, hostname: 'audit.example', protocol: 'TLSv1' }), { accepted: false });
  await assert.rejects(EXTERNAL_PROBE_IO_V2.handshake({ address, hostname: 'audit.example', protocol: 'TLSv1.2' }), error => error.category === 'transport');
  assert.equal(seen[0].ciphers, 'DEFAULT@SECLEVEL=0'); assert.equal(seen[0].rejectUnauthorized, false);
  assert.equal(Object.hasOwn(seen[1], 'ciphers'), false); assert.equal(seen[1].servername, 'audit.example');
  assert.equal(Object.hasOwn(seen[0], 'session'), false); assert.equal(Object.hasOwn(seen[0], 'key'), false);
});

test('V2 TLS and WebSocket probes have an absolute deadline that byte activity cannot extend', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [];
  const connect = (_options, connected) => {
    const socket = new EventEmitter(); socket.destroyedCount = 0; socket.write = () => true;
    socket.destroy = () => { socket.destroyedCount++; queueMicrotask(() => socket.emit('close')); };
    sockets.push(socket); if (connected) queueMicrotask(connected); return socket;
  };
  t.mock.method(tls, 'connect', connect); t.mock.method(net, 'connect', connect);
  const result = Promise.all([
    EXTERNAL_PROBE_IO_V2.handshake({ address, hostname: 'audit.example', protocol: 'TLSv1.2' }),
    EXTERNAL_PROBE_IO_V2.websocket({ address, hostname: 'audit.example', secure: true }),
    EXTERNAL_PROBE_IO_V2.websocket({ address, hostname: 'audit.example', secure: false }),
  ].map(promise => promise.then(() => assert.fail('Incomplete probe succeeded'), error => error)));
  await Promise.resolve();
  for (let second = 0; second < 9; second++) {
    t.mock.timers.tick(1000);
    for (const socket of sockets) socket.emit('data', Buffer.from('x'));
  }
  assert.ok(sockets.every(socket => socket.destroyedCount === 0));
  t.mock.timers.tick(1000);
  assert.ok((await result).every(error => error.category === 'timeout'));
  assert.ok(sockets.every(socket => socket.destroyedCount === 1));
});

test('V2 socket completion and early close settle once and dispose their deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [];
  t.mock.method(tls, 'connect', () => {
    const socket = new EventEmitter(); socket.destroyedCount = 0; socket.authorized = true;
    socket.getProtocol = () => 'TLSv1.2';
    socket.getPeerCertificate = () => ({ subjectaltname: 'DNS:audit.example', valid_to: '2026-12-20T12:02:00.000Z' });
    socket.destroy = () => { socket.destroyedCount++; queueMicrotask(() => socket.emit('close')); };
    sockets.push(socket); return socket;
  });
  const success = EXTERNAL_PROBE_IO_V2.handshake({ address, hostname: 'audit.example', protocol: 'TLSv1.2' });
  sockets[0].emit('secureConnect'); assert.equal((await success).accepted, true);
  const closed = EXTERNAL_PROBE_IO_V2.handshake({ address, hostname: 'audit.example', protocol: 'TLSv1.2' });
  sockets[1].emit('close'); await assert.rejects(closed, error => error.category === 'evidence-incomplete');
  t.mock.timers.tick(20_000); assert.ok(sockets.every(socket => socket.destroyedCount === 1));
});

async function outputFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-external-v2-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifactDirectory = path.join(root, 'producers'); await fs.mkdir(artifactDirectory);
  return { root, artifactDirectory, udpObservationPath: path.join(root, 'udp.json'), env, now, profile: 'exposure' };
}

test('V2 external emitter writes one validated producer plus raw UDP counts for the separate composite owner', async t => {
  const input = await outputFixture(t), { io } = ioFixture();
  assert.deepEqual(await writeExternalProducerFilesV2({ ...input, io }), { udpObservationWritten: true });
  const file = path.join(input.artifactDirectory, 'external.json'), bytes = await fs.readFile(file, 'utf8'), artifact = JSON.parse(bytes);
  assert.equal(bytes, canonicalAuditJson(artifact) + '\n');
  assert.ok(artifact.controls.every(row => row.status === 'PASS'));
  parseAuditProducerArtifact(artifact, await catalog(), 'exposure', 'external');
  assert.deepEqual(JSON.parse(await fs.readFile(input.udpObservationPath, 'utf8')),
    { expectedResultCount: 14, observedResultCount: 14, openSelectedUdpPortCount: 0 });
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('V2 external emitter leaves unavailable UDP inventory absent and refuses stale evidence before probes', async t => {
  const input = await outputFixture(t), value = ioFixture(); value.io.resolve = async () => [];
  assert.deepEqual(await writeExternalProducerFilesV2({ ...input, io: value.io }), { udpObservationWritten: false });
  await assert.rejects(fs.stat(input.udpObservationPath), { code: 'ENOENT' });
  const before = await fs.readFile(path.join(input.artifactDirectory, 'external.json'));
  value.calls.length = 0;
  await assert.rejects(writeExternalProducerFilesV2({ ...input, io: value.io }), /already exists/);
  assert.equal(value.calls.length, 0); assert.deepEqual(await fs.readFile(path.join(input.artifactDirectory, 'external.json')), before);
  const second = await outputFixture(t); await fs.writeFile(second.udpObservationPath, 'original raw observation');
  await assert.rejects(writeExternalProducerFilesV2({ ...second, io: value.io }), /already exists/);
  await assert.rejects(fs.stat(path.join(second.artifactDirectory, 'external.json')), { code: 'ENOENT' });
});

test('V2 external emitter rejects bad output layout and CLI configuration without launching probes', async t => {
  const input = await outputFixture(t), value = ioFixture();
  await assert.rejects(writeExternalProducerFilesV2({ ...input, io: value.io, udpObservationPath: path.join(input.artifactDirectory, 'udp.json') }));
  assert.equal(value.calls.length, 0);
  const cli = fileURLToPath(new URL('../emit-external-producer-v2.mjs', import.meta.url));
  for (const args of [[], ['exposure', input.artifactDirectory, input.udpObservationPath]]) {
    await assert.rejects(promisify(execFile)(process.execPath, [cli, ...args], {
      env: { ...process.env, AUDIT_TARGET: 'https://user:PRIVATE@audit.example' },
    }), error => error.stdout === '' && error.stderr === 'V2 external acquisition failed; no complete output is claimed.\n');
  }
});
