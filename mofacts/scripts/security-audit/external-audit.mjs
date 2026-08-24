import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';
import { control, errorControl, runCommand, section, writeJsonFile } from './audit-lib.mjs';
import { classifyUdpPortStates, parseNmapPortStates, parseNmapTlsCipherReport } from './scanner-parsers.mjs';

const target = new URL(process.env.AUDIT_TARGET || 'https://mofacts.optimallearning.org');
const outputPath = process.argv[2];
if (!outputPath) throw new Error('output path is required');

async function resolvedAddresses() {
  const [v4, v6] = await Promise.allSettled([dns.resolve4(target.hostname), dns.resolve6(target.hostname)]);
  const addresses = [
    ...(v4.status === 'fulfilled' ? v4.value : []),
    ...(v6.status === 'fulfilled' ? v6.value : []),
  ];
  return [...new Set(addresses)];
}

function socketRequest({ secure, address, path = '/websocket' }) {
  return new Promise((resolve, reject) => {
    let response = '';
    const onConnected = (socket) => {
      const key = randomBytes(16).toString('base64');
      socket.write(`GET ${path} HTTP/1.1\r\nHost: ${target.hostname}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      socket.on('data', (chunk) => {
        response += chunk.toString('latin1');
        if (response.includes('\r\n\r\n')) {
          socket.destroy();
          resolve(response.split('\r\n')[0]);
        }
      });
    };
    const socket = secure
      ? tls.connect({ host: address, port: 443, servername: target.hostname, rejectUnauthorized: true }, () => onConnected(socket))
      : net.connect({ host: address, port: 80 }, () => onConnected(socket));
    socket.setTimeout(10000, () => socket.destroy(new Error('socket timeout')));
    socket.once('error', reject);
  });
}

function tlsProbe(address, minVersion, maxVersion) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: address, port: 443, servername: target.hostname, rejectUnauthorized: true,
      minVersion, maxVersion,
    });
    socket.setTimeout(10000);
    socket.once('secureConnect', () => {
      const result = { ok: socket.authorized, protocol: socket.getProtocol(), certificate: socket.getPeerCertificate() };
      socket.destroy();
      resolve(result);
    });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    socket.once('error', () => resolve({ ok: false, reason: 'rejected' }));
  });
}

async function nmapEveryAddress(args, timeoutMs, useSudo = true) {
  const ports = [];
  for (const address of addresses) {
    const addressArgs = [...(address.includes(':') ? ['-6'] : []), ...args, address];
    const result = useSudo
      ? await runCommand('sudo', ['nmap', ...addressArgs], { timeoutMs })
      : await runCommand('nmap', addressArgs, { timeoutMs });
    if (!result.ok) return { ok: false, reason: result.reason };
    try { ports.push(...parseNmapPortStates(result.stdout)); } catch { return { ok: false, reason: 'nmap output was malformed' }; }
  }
  return { ok: true, ports };
}

const controls = [];
let addresses = [];
try {
  addresses = await resolvedAddresses();
  controls.push(control('external.dns-addresses', 'Resolve every public address', addresses.length ? 'PASS' : 'ERROR', 'HIGH',
    addresses.length ? `Resolved ${addresses.length} unique A or AAAA addresses.` : 'No A or AAAA address was resolved.',
    { metrics: { addressCount: addresses.length } }));
} catch (error) {
  controls.push(errorControl('external.dns-addresses', 'Resolve every public address', error));
}

if (addresses.length) {
  const tcpScan = await nmapEveryAddress(['-Pn', '-n', '-sT', '-p-', '--open', '-oX', '-'], 45 * 60 * 1000);
  if (!tcpScan.ok) {
    controls.push(errorControl('external.public-tcp-ports', 'Only TCP 80 and 443 are public', tcpScan.reason));
  } else {
    const inconclusive = tcpScan.ports.filter((entry) => entry.state === 'open|filtered');
    if (inconclusive.length) {
      controls.push(errorControl('external.public-tcp-ports', 'Only TCP 80 and 443 are public',
        `${inconclusive.length} TCP results were inconclusive`));
    } else {
      const open = tcpScan.ports.filter((entry) => entry.state === 'open').map((entry) => entry.endpoint);
      const unexpected = open.filter((entry) => !entry.endsWith('/tcp/80') && !entry.endsWith('/tcp/443'));
      const perAddress = addresses.every((address) => open.includes(`${address}/tcp/80`) && open.includes(`${address}/tcp/443`));
      controls.push(control('external.public-tcp-ports', 'Only TCP 80 and 443 are public',
        unexpected.length === 0 && perAddress ? 'PASS' : 'FAIL',
        unexpected.some((entry) => /\/tcp\/(?:3000|27017|6379|8931|8932)$/.test(entry)) ? 'CRITICAL' : 'HIGH',
        unexpected.length ? `Found ${unexpected.length} unexpected public TCP ports.` : perAddress
          ? 'Every resolved address exposes TCP 80 and 443 only.'
          : 'One or more resolved addresses did not expose the required TCP ports.',
        {
          observations: unexpected.map((entry) => `unexpected-public-endpoint: ${entry}`),
          metrics: { addressCount: addresses.length, unexpectedPortCount: unexpected.length },
        }));
    }
  }

  const udpPorts = '53,123,443,27017,6379,8931,8932';
  // Retain Nmap's bounded reason category. A firewall DROP commonly remains
  // open|filtered and must stay inconclusive rather than being forced to pass.
  const udpScan = await nmapEveryAddress(['-Pn', '-n', '-sU', '--reason', '-p', udpPorts, '-oX', '-'], 30 * 60 * 1000);
  if (!udpScan.ok) {
    controls.push(errorControl('external.public-udp-ports', 'Selected UDP ports are closed', udpScan.reason));
  } else {
    const expectedResultCount = addresses.length * udpPorts.split(',').length;
    const classification = classifyUdpPortStates(udpScan.ports, expectedResultCount);
    if (classification.status === 'FAIL') {
      controls.push(control('external.public-udp-ports', 'Selected UDP ports are closed', 'FAIL', 'HIGH',
        `Found ${classification.openPortCount} selected UDP ports confirmed open.`,
        {
          observations: classification.openEndpoints.map((entry) => `confirmed-open-endpoint: ${entry}`),
          metrics: { openSelectedUdpPortCount: classification.openPortCount, inconclusivePortCount: classification.inconclusivePortCount },
        }));
    } else if (classification.status === 'ERROR') {
      controls.push(control('external.public-udp-ports', 'Selected UDP ports are closed', 'ERROR', 'HIGH',
        'The UDP scan did not conclusively report every selected port closed.',
        {
          observations: classification.inconclusiveEndpoints.map((entry) => `inconclusive-endpoint: ${entry}`),
          metrics: {
            inconclusive: true,
            inconclusivePortCount: classification.inconclusivePortCount,
            observedResultCount: classification.observedResultCount,
            expectedResultCount: classification.expectedResultCount,
          },
        }));
    } else {
      controls.push(control('external.public-udp-ports', 'Selected UDP ports are closed', 'PASS', 'CRITICAL',
        'Every selected UDP port was conclusively reported closed.',
        { metrics: { closedSelectedUdpPortCount: classification.observedResultCount } }));
    }
  }
} else {
  controls.push(errorControl('external.public-tcp-ports', 'Only TCP 80 and 443 are public', 'DNS resolution did not complete'));
  controls.push(errorControl('external.public-udp-ports', 'Selected UDP ports are closed', 'DNS resolution did not complete'));
}

try {
  const paths = ['/', '/auth/login', '/.well-known/security.txt?audit=1'];
  const results = await Promise.all(paths.map(async (path) => {
    const response = await fetch(`http://${target.hostname}${path}`, { redirect: 'manual' });
    const location = new URL(response.headers.get('location') || '', `http://${target.hostname}${path}`);
    return response.status >= 301 && response.status <= 308
      && location.protocol === 'https:' && location.hostname === target.hostname
      && `${location.pathname}${location.search}` === path;
  }));
  controls.push(control('external.http-redirect', 'HTTP redirects to the same HTTPS host and path',
    results.every(Boolean) ? 'PASS' : 'FAIL', 'HIGH',
    results.every(Boolean) ? 'Every tested HTTP path redirected to the matching HTTPS URL.' : 'At least one HTTP path did not redirect to the matching HTTPS URL.',
    { metrics: { testedPathCount: paths.length, passingPathCount: results.filter(Boolean).length } }));
} catch (error) {
  controls.push(errorControl('external.http-redirect', 'HTTP redirects to the same HTTPS host and path', error));
}

if (addresses.length) {
  try {
    const probes = await Promise.all(addresses.flatMap((address) => [
      tlsProbe(address, 'TLSv1', 'TLSv1'), tlsProbe(address, 'TLSv1.1', 'TLSv1.1'),
      tlsProbe(address, 'TLSv1.2', 'TLSv1.2'), tlsProbe(address, 'TLSv1.3', 'TLSv1.3'),
    ]));
    const perAddress = addresses.map((address, index) => ({ address, probes: probes.slice(index * 4, index * 4 + 4) }));
    const pass = perAddress.every(({ probes: values }) => !values[0].ok && !values[1].ok && values[2].ok && values[3].ok);
    controls.push(control('external.tls-protocols', 'Only TLS 1.2 and 1.3 are accepted', pass ? 'PASS' : 'FAIL', 'CRITICAL',
      pass ? 'Every resolved address rejected TLS 1.0 and 1.1 and accepted TLS 1.2 and 1.3.' : 'At least one resolved address has an invalid TLS protocol result.',
      { metrics: { addressCount: addresses.length } }));
    const certificates = perAddress.map(({ probes: values }) => values[2].certificate || values[3].certificate).filter(Boolean);
    const minDays = Math.min(...certificates.map((certificate) => (new Date(certificate.valid_to).getTime() - Date.now()) / 86400000));
    const certPass = certificates.length === addresses.length && minDays >= 30;
    controls.push(control('external.certificate', 'Certificate hostname, chain, and validity are acceptable', certPass ? 'PASS' : 'FAIL', 'CRITICAL',
      certPass ? 'Every resolved address presented an authorized certificate valid for at least 30 days.' : 'Certificate validation or minimum remaining validity failed.',
      { metrics: { minimumValidityDays: Number.isFinite(minDays) ? Math.floor(minDays) : -1 } }));
  } catch (error) {
    controls.push(errorControl('external.tls-protocols', 'Only TLS 1.2 and 1.3 are accepted', error));
    controls.push(errorControl('external.certificate', 'Certificate hostname, chain, and validity are acceptable', error));
  }

  let cipherError = '';
  let cipherCount = 0;
  let weakCipherCount = 0;
  for (const address of addresses) {
    const result = await runCommand('nmap', [
      ...(address.includes(':') ? ['-6'] : []), '-Pn', '-n', '-p', '443', '--script', 'ssl-enum-ciphers', address,
    ], { timeoutMs: 20 * 60 * 1000 });
    if (!result.ok) { cipherError = result.reason; break; }
    try {
      const parsed = parseNmapTlsCipherReport(result.stdout);
      cipherCount += parsed.cipherCount;
      weakCipherCount += parsed.weakCipherCount;
    } catch {
      cipherError = 'TLS cipher enumeration output was malformed';
      break;
    }
  }
  if (cipherError) {
    controls.push(errorControl('external.tls-ciphers', 'No weak TLS cipher is accepted', cipherError));
  } else {
    controls.push(control('external.tls-ciphers', 'No weak TLS cipher is accepted', weakCipherCount ? 'FAIL' : 'PASS', 'HIGH',
      weakCipherCount ? 'The cipher enumeration reported a prohibited cipher or grade.' : 'Every enumerated cipher met the approved policy.',
      { metrics: { cipherCount, weakCipherCount } }));
  }

  try {
    const secure = await Promise.all(addresses.map((address) => socketRequest({ secure: true, address })));
    const insecure = await Promise.all(addresses.map((address) => socketRequest({ secure: false, address })));
    controls.push(control('external.websocket-tls', 'WSS upgrades and insecure WebSockets do not',
      secure.every((line) => /^HTTP\/1\.[01] 101\b/.test(line)) && insecure.every((line) => !/^HTTP\/1\.[01] 101\b/.test(line)) ? 'PASS' : 'FAIL',
      'HIGH', 'Tested secure and insecure WebSocket upgrade behavior on every resolved address.',
      { metrics: { secureUpgradeCount: secure.filter((line) => / 101\b/.test(line)).length, insecureUpgradeCount: insecure.filter((line) => / 101\b/.test(line)).length } }));
  } catch (error) {
    controls.push(errorControl('external.websocket-tls', 'WSS upgrades and insecure WebSockets do not', error));
  }
} else {
  for (const [id, title] of [
    ['external.tls-protocols', 'Only TLS 1.2 and 1.3 are accepted'],
    ['external.certificate', 'Certificate hostname, chain, and validity are acceptable'],
    ['external.tls-ciphers', 'No weak TLS cipher is accepted'],
    ['external.websocket-tls', 'WSS upgrades and insecure WebSockets do not'],
  ]) controls.push(errorControl(id, title, 'DNS resolution did not complete'));
}

try {
  const response = await fetch(target, { redirect: 'manual' });
  const headers = response.headers;
  const hsts = headers.get('strict-transport-security') || '';
  const csp = headers.get('content-security-policy') || '';
  const frame = headers.get('x-frame-options') || '';
  const referrer = headers.get('referrer-policy') || '';
  const permissions = headers.get('permissions-policy') || '';
  const hstsPass = /max-age=(\d+)/i.test(hsts) && Number(hsts.match(/max-age=(\d+)/i)?.[1]) >= 31536000;
  controls.push(control('external.hsts', 'HSTS is at least one year', hstsPass ? 'PASS' : 'FAIL', 'HIGH',
    hstsPass ? 'HSTS meets the minimum max-age.' : 'HSTS is absent or below the required max-age.'));
  const cspPass = ["frame-ancestors", "object-src", "base-uri", "form-action"].every((directive) => csp.includes(directive))
    && !/(?:^|[;\s])\*(?=[;\s]|$)|http:/i.test(csp);
  controls.push(control('external.csp', 'CSP restricts frames, objects, base URLs, and forms', cspPass ? 'PASS' : 'FAIL', 'HIGH',
    cspPass ? 'CSP contains every required restriction.' : 'CSP is absent, incomplete, or contains an insecure source.'));
  const otherPass = /^deny$/i.test(frame) && /^nosniff$/i.test(headers.get('x-content-type-options') || '')
    && referrer === 'strict-origin-when-cross-origin' && permissions === 'geolocation=(), microphone=(self)';
  controls.push(control('external.security-headers', 'Frame, MIME, referrer, and permissions policies are approved', otherPass ? 'PASS' : 'FAIL', 'MEDIUM',
    otherPass ? 'All required non-CSP security headers match policy.' : 'One or more required security headers are absent or incorrect.'));
} catch (error) {
  controls.push(errorControl('external.hsts', 'HSTS is at least one year', error));
  controls.push(errorControl('external.csp', 'CSP restricts frames, objects, base URLs, and forms', error));
  controls.push(errorControl('external.security-headers', 'Frame, MIME, referrer, and permissions policies are approved', error));
}

await writeJsonFile(outputPath, section('external', controls));
