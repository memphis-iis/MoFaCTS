import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, finalizeReport, isExecutionErrorControl, sanitizedMetrics, sanitizedText } from './audit-lib.mjs';
import {
  boundedGitleaksObservations,
  boundedNpmAuditObservations,
  boundedNpmFindings,
  boundedTrivyObservations,
  classifyUdpPortStates,
  developmentOnlyNpmFindings,
  findCanaryLeaks,
  countPotentialSensitiveLogStatements,
  parseNmapOpenPorts,
  parseNmapPortStates,
  parseNmapTlsCipherReport,
  parseNpmAuditVulnerabilityCount,
  npmAuditFindings,
  parseTrivyHighCritical,
} from './scanner-parsers.mjs';
import {
  decryptReportEnvelope,
  encryptReportBuffer,
  verifyCanonicalReportDigest,
} from './report-crypto.mjs';
import {
  assertUniqueSemanticProbeIds,
  passwordlessContainmentOutcomes,
  routeProbePassed,
  selectExpiredResetLink,
  semanticAuthorizationProbeId,
  throttleResultCategory,
  throttleWasObserved,
} from './authentication-probes.mjs';

test('canonical reports hash deterministically and exclude the digest from its payload', () => {
  const sections = Object.fromEntries(['external', 'authentication', 'internal', 'repository'].map((sectionId) => [
    sectionId, { sectionId, status: 'NOT_APPLICABLE', controls: [] },
  ]));
  const input = {
    schema: 'SecurityAuditReportV1', reportId: 'audit-12345678', reportType: 'full',
    startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
    target: 'https://mofacts.optimallearning.org', sourceRevision: 'abcdef0', productionImage: `sha256:${'b'.repeat(64)}`,
    toolVersions: { node: '24.15.0' }, sections, executionErrors: [],
  };
  const report = finalizeReport(input);
  const { digestSha256, ...payload } = report;
  assert.equal(digestSha256, crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex'));
  assert.equal(finalizeReport(input).digestSha256, digestSha256);
});

test('redaction removes emails and credential-shaped evidence', () => {
  const result = sanitizedText('user@example.org password=hunter2 Authorization:Bearer-value');
  assert.doesNotMatch(result, /user@example\.org|hunter2|Bearer-value/);
  assert.deepEqual(sanitizedMetrics({ count: 2, passwordValue: 'no', note: 'user@example.org' }), {
    count: 2,
    note: '[redacted-email]',
  });
});

test('nmap parser handles passing, vulnerable, malformed, and missing output', () => {
  const prefix = '<?xml version="1.0"?><nmaprun><host><address addr="192.0.2.2" addrtype="ipv4"/><ports>';
  assert.deepEqual(parseNmapOpenPorts(`${prefix}</ports></host></nmaprun>`), []);
  assert.deepEqual(parseNmapOpenPorts(`${prefix}<port protocol="tcp" portid="6379"><state state="open"/></port></ports></host></nmaprun>`), ['192.0.2.2/tcp/6379']);
  const udp = parseNmapPortStates(`${prefix}<port protocol="udp" portid="53"><state state="open|filtered"/></port><port protocol="udp" portid="443"><state state="closed"/></port></ports></host></nmaprun>`);
  assert.deepEqual(udp, [
    { endpoint: '192.0.2.2/udp/53', state: 'open|filtered' },
    { endpoint: '192.0.2.2/udp/443', state: 'closed' },
  ]);
  assert.deepEqual(parseNmapOpenPorts(`${prefix}<port protocol="udp" portid="53"><state state="open|filtered"/></port></ports></host></nmaprun>`), []);
  assert.throws(() => parseNmapOpenPorts('<nmaprun>'));
  assert.throws(() => parseNmapOpenPorts(undefined));
});

test('TLS cipher parser ignores NULL compression but rejects weak cipher entries and malformed output', () => {
  const strong = `| ssl-enum-ciphers:\n|   TLSv1.2:\n|     ciphers:\n|       TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (ecdh_x25519) - A\n|     compressors:\n|       NULL\n|_  least strength: A`;
  assert.deepEqual(parseNmapTlsCipherReport(strong), { cipherCount: 1, weakCipherCount: 0 });
  const weak = `| ssl-enum-ciphers:\n|   TLSv1.2:\n|     ciphers:\n|       TLS_RSA_WITH_NULL_SHA (rsa 2048) - F\n|_  least strength: F`;
  assert.deepEqual(parseNmapTlsCipherReport(weak), { cipherCount: 1, weakCipherCount: 1 });
  assert.throws(() => parseNmapTlsCipherReport('| ssl-enum-ciphers:\n| compressors:\n| NULL'));
  assert.throws(() => parseNmapTlsCipherReport(undefined));
});

test('UDP classification distinguishes closed, open, inconclusive, and incomplete scans', () => {
  const closed = [{ endpoint: '192.0.2.2/udp/53', state: 'closed' }];
  assert.equal(classifyUdpPortStates(closed, 1).status, 'PASS');
  assert.equal(classifyUdpPortStates([{ ...closed[0], state: 'open' }], 1).status, 'FAIL');
  assert.equal(classifyUdpPortStates([{ ...closed[0], state: 'open|filtered' }], 1).status, 'ERROR');
  assert.deepEqual(classifyUdpPortStates([{ ...closed[0], state: 'open|filtered' }], 1).inconclusiveEndpoints,
    ['192.0.2.2/udp/53 state=open|filtered']);
  assert.equal(classifyUdpPortStates([], 1).status, 'ERROR');
  assert.equal(classifyUdpPortStates([closed[0], closed[0]], 2).status, 'ERROR');
  assert.throws(() => classifyUdpPortStates(null, 1));
});

test('inconclusive controls remain visible without becoming execution failures or severity findings', () => {
  const inconclusive = {
    status: 'ERROR', severity: 'HIGH', evidence: { summary: 'No conclusive response.', metrics: { inconclusive: true } },
  };
  assert.equal(isExecutionErrorControl(inconclusive), false);
  assert.equal(isExecutionErrorControl({ ...inconclusive, evidence: { summary: 'Tool failed.' } }), true);
  const sections = { external: { controls: [inconclusive] } };
  const report = finalizeReport({ sections });
  assert.equal(report.counts.error, 1);
  assert.equal(report.counts.high, 0);
});

test('dependency parsers never turn incomplete evidence into a pass', () => {
  assert.equal(parseNpmAuditVulnerabilityCount({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }), 0);
  assert.equal(parseNpmAuditVulnerabilityCount({ metadata: { vulnerabilities: { high: 2, critical: 1 } } }), 3);
  assert.throws(() => parseNpmAuditVulnerabilityCount({}));
  assert.deepEqual(parseTrivyHighCritical({ Results: [{ Vulnerabilities: [] }] }), []);
  assert.equal(parseTrivyHighCritical({ Results: [{ Vulnerabilities: [{ Severity: 'CRITICAL' }] }] }).length, 1);
  assert.throws(() => parseTrivyHighCritical({}));
});

test('repository findings expose bounded identifiers without raw scanner evidence', () => {
  assert.deepEqual(boundedGitleaksObservations([
    { RuleID: 'generic-api-key', File: 'mofacts/server/example.test.ts', Secret: 'must-not-appear' },
  ]), ['gitleaks.generic-api-key: mofacts/server/example.test.ts:unknown commit=unknown']);
  assert.deepEqual(boundedNpmAuditObservations({
    vulnerabilities: {
      transitive: { severity: 'moderate', isDirect: false },
      direct: { severity: 'high', isDirect: true },
    },
  }), [
    'npm.direct: severity=high, direct=yes',
    'npm.transitive: severity=moderate, direct=no',
  ]);
  assert.deepEqual(boundedNpmFindings(npmAuditFindings({
    vulnerabilities: { direct: { severity: 'high', isDirect: true } },
  })), ['npm.direct: severity=high, direct=yes']);
  assert.deepEqual(boundedTrivyObservations([
    { VulnerabilityID: 'CVE-2026-1234', PkgName: 'runtime-lib', InstalledVersion: '1.0.0', Severity: 'HIGH', FixedVersion: '2.0.0' },
  ]), ['trivy.CVE-2026-1234: package=runtime-lib, installed=1.0.0, fixed=2.0.0, severity=HIGH']);
  assert.throws(() => boundedGitleaksObservations([{ RuleID: 'generic-api-key' }]));
  assert.throws(() => boundedNpmAuditObservations({}));
  assert.throws(() => boundedTrivyObservations([{ VulnerabilityID: 'CVE-2026-1234' }]));
});

test('development dependency findings exclude runtime packages without mutating source order', () => {
  const all = [
    { name: 'dev-only', severity: 'high', direct: true },
    { name: 'runtime', severity: 'moderate', direct: false },
  ];
  const runtime = [{ name: 'runtime', severity: 'moderate', direct: false }];
  assert.deepEqual(developmentOnlyNpmFindings(all, runtime), [all[0]]);
  boundedNpmFindings(all);
  assert.deepEqual(all.map((finding) => finding.name), ['dev-only', 'runtime']);
});

test('canary scanning detects retained secrets without emitting their values', () => {
  const canary = 'AUDIT-CANARY-123456';
  assert.equal(findCanaryLeaks(['safe', `payload:${canary}`], [canary]).length, 1);
  assert.deepEqual(findCanaryLeaks(['safe'], [canary]), []);
});

test('sensitive log scanning distinguishes safe summaries from personal identifiers', () => {
  assert.equal(countPotentialSensitiveLogStatements("serverConsole('count', resultCount);"), 0);
  assert.equal(countPotentialSensitiveLogStatements("serverConsole('Password reset completed successfully');"), 0);
  assert.equal(countPotentialSensitiveLogStatements("serverConsole('reset', normalizedEmail.canonical);"), 1);
  assert.throws(() => countPotentialSensitiveLogStatements(null));
});

test('production authentication policy uses ambiguous errors and a 30-day session maximum', () => {
  const source = fs.readFileSync(new URL('../../server/startup/serverStartup.ts', import.meta.url), 'utf8');
  assert.match(source, /Accounts as any\)\.config\(\{[\s\S]*?loginExpirationInDays:\s*30,/);
  assert.match(source, /Accounts as any\)\.config\(\{[\s\S]*?ambiguousErrorMessages:\s*true,/);
});

test('public Caddy example sends a one-year HSTS policy', () => {
  const source = fs.readFileSync(new URL('../../../deploy/Caddyfile.self-hosted.example', import.meta.url), 'utf8');
  assert.match(source, /header Strict-Transport-Security "max-age=31536000"/);
});

test('host exposure audit inspects the active Apache HTTPS site rather than inactive Caddy configuration', () => {
  const source = fs.readFileSync(new URL('../../../deploy/security-audit/host-exposure-audit.sh', import.meta.url), 'utf8');
  const config = fs.readFileSync(new URL('../../../deploy/security-audit/security-audit.conf.example', import.meta.url), 'utf8');
  assert.match(config, /^APACHE_HTTPS_SITE_FILE=\/etc\/apache2\/sites-enabled\/000-default-le-ssl\.conf$/m);
  assert.match(source, /systemctl is-active apache2/);
  assert.match(source, /apache2ctl configtest/);
  assert.match(source, /internal\.reverse-proxy-routes/);
  assert.match(source, /mongodb\.unauthenticated-denied/);
  assert.match(source, /redis\.unauthenticated-denied/);
  assert.match(source, /unauth_redis_output=.*redis-cli --no-auth-warning --raw PING/);
  assert.match(source, /grep -Eq '\^NOAUTH\(\[\[:space:\]\]\|\$\)'/);
  assert.match(source, /unauth_redis=2/);
  assert.match(source, /redis\.application-authenticated-connectivity/);
  assert.match(source, /applicationConnectivityProbeExit/);
  assert.doesNotMatch(source, /redis-cli --no-auth-warning PING >\/dev\/null 2>&1; echo \$\?/);
  assert.match(source, /firewall\.default-deny/);
  assert.match(source, /ufw show added/);
  assert.match(source, /host-firewall-policy\.awk/);
  assert.match(config, /^MOFACTS_SSH_MANAGEMENT_INTERFACE=tailscale0$/m);
  assert.match(source, /unexpected_socket_observations/);
  assert.match(source, /host-listener-policy\.awk/);
  assert.match(source, /127\\\.0\\\.0\\\.1:3000/);
  assert.doesNotMatch(source, /CADDY_CONFIG_FILE|internal\.caddy-routes|caddy adapt/);
});

test('production audit reaches the host through a pinned ephemeral Tailscale identity', () => {
  const workflow = fs.readFileSync(new URL('../../../.github/workflows/production-security-audit.yml', import.meta.url), 'utf8');
  assert.match(workflow, /tailscale\/github-action@306e68a486fd2350f2bfc3b19fcd143891a4a2d8 # v4/);
  assert.match(workflow, /oauth-client-id: \$\{\{ secrets\.TS_OAUTH_CLIENT_ID \}\}/);
  assert.match(workflow, /oauth-secret: \$\{\{ secrets\.TS_OAUTH_SECRET \}\}/);
  assert.match(workflow, /tags: tag:ci/);
  assert.match(workflow, /version: 1\.102\.3/);
  assert.match(workflow, /ping: \$\{\{ secrets\.AUDIT_SSH_HOST \}\}/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

function executablePath(fileUrl) {
  const nativePath = fileURLToPath(fileUrl);
  if (process.platform !== 'win32') return nativePath;
  const match = /^([A-Za-z]):\\(.*)$/.exec(nativePath);
  assert.ok(match, `Cannot map fixture path into WSL: ${nativePath}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function classifyHostListenerFixture(fixtureName) {
  const policy = executablePath(new URL('../../../deploy/security-audit/host-listener-policy.awk', import.meta.url));
  const fixture = executablePath(new URL(`./fixtures/${fixtureName}`, import.meta.url));
  const executable = process.platform === 'win32' ? 'wsl.exe' : 'awk';
  const args = process.platform === 'win32'
    ? ['--exec', 'awk', '-f', policy, fixture]
    : ['-f', policy, fixture];
  return execFileSync(executable, args, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
}

function classifyHostFirewallFixture(fixtureName) {
  const policy = executablePath(new URL('../../../deploy/security-audit/host-firewall-policy.awk', import.meta.url));
  const fixture = executablePath(new URL(`./fixtures/${fixtureName}`, import.meta.url));
  const executable = process.platform === 'win32' ? 'wsl.exe' : 'awk';
  const policyArgs = [
    '-v', 'management_interface=tailscale0',
    '-v', 'management_cidrs=100.64.0.0/10,fd7a:115c:a1e0::/48',
    '-f', policy,
    fixture,
  ];
  const args = process.platform === 'win32' ? ['--exec', 'awk', ...policyArgs] : policyArgs;
  return execFileSync(executable, args, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
}

test('host listener policy accepts only reviewed loopback, DHCP, web, and SSH fixtures', () => {
  assert.deepEqual(classifyHostListenerFixture('host-listeners-expected.fixture'), []);

  const dangerous = classifyHostListenerFixture('host-listeners-dangerous.fixture');
  assert.equal(dangerous.length, 5);
  assert.ok(dangerous.some((line) => line.includes('0.0.0.0:68')));
  assert.ok(dangerous.some((line) => line.includes('ens5:68')));
  assert.ok(dangerous.some((line) => line.includes('0.0.0.0:3000')));
  assert.ok(dangerous.some((line) => line.includes('[::]:27017')));
  assert.ok(dangerous.some((line) => line.includes('*:6379')));
});

test('host firewall policy accepts only private-interface SSH and public web rules', () => {
  assert.deepEqual(classifyHostFirewallFixture('host-firewall-expected.fixture'), []);

  const dangerous = classifyHostFirewallFixture('host-firewall-dangerous.fixture');
  assert.equal(dangerous.length, 5);
  assert.ok(dangerous.some((line) => line.includes('ufw allow 22/tcp')));
  assert.ok(dangerous.some((line) => line.includes('on eth0')));
  assert.ok(dangerous.some((line) => line.includes('ufw allow 3000/tcp')));
  assert.ok(dangerous.some((line) => line.includes('fd7a:115c:a1e0::/48=0')));
  assert.ok(dangerous.some((line) => line.includes('443/tcp=0')));
});

test('production hardening assets preserve reviewed findings and remove unnecessary runtime tooling', () => {
  const ignore = fs.readFileSync(new URL('../../../.gitleaksignore', import.meta.url), 'utf8');
  const ignoredFingerprints = ignore.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
  assert.equal(ignoredFingerprints.length, 7);
  assert.deepEqual(ignoredFingerprints.filter((line) => line.includes('mofacts/.deploy/settings.local.json')), [
    '403ea082da296f5d7e476cfa99786bfb99ec3015:mofacts/.deploy/settings.local.json:generic-api-key:4',
    'bbb9400da27cc4c74c3024c4d1597a31173a298c:mofacts/.deploy/settings.local.json:generic-api-key:4',
  ]);
  const dockerfile = fs.readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /apk update && apk upgrade --no-cache && apk add --no-cache/);
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/);
  const apache = fs.readFileSync(new URL('../../../deploy/maintenance/apache-mofacts-maintenance.conf', import.meta.url), 'utf8');
  assert.match(apache, /ProxyPass \/websocket ws:\/\/127\.0\.0\.1:3000\/websocket/);
  assert.match(apache, /Content-Security-Policy-Report-Only/);
  assert.match(apache, /style-src 'self' https:\/\/fonts\.googleapis\.com/);
  assert.match(apache, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  assert.match(apache, /media-src 'self' blob: data:/);
  assert.doesNotMatch(apache, /(?:script-src|style-src)[^;]*(?:'unsafe-inline'|'unsafe-eval')/);
  assert.doesNotMatch(apache, /ws:\/\/localhost:3000/);
  const auditAdmin = fs.readFileSync(new URL('../../client/views/adminSecurityAudits.ts', import.meta.url), 'utf8');
  assert.match(auditAdmin, /auditText\(key, options\?\.hash\)/);
  const studentPerformance = fs.readFileSync(new URL('../../client/lib/studentPerformanceRuntime.ts', import.meta.url), 'utf8');
  assert.match(studentPerformance, /clientConsole\(2, 'setStudentPerformance:start'\)/);
  assert.doesNotMatch(studentPerformance, /clientConsole\([^\n]*student(?:ID|Username)/);
  const probabilityCalculation = fs.readFileSync(new URL('../../../learning-components/models/adaptive-logistic/probabilityCalculation.ts', import.meta.url), 'utf8');
  assert.match(probabilityCalculation, /calculateCardProbabilities:complete[\s\S]*stimulusCount: count/);
  assert.doesNotMatch(probabilityCalculation, /JSON\.stringify\(ptemp\)/);
  const compose = fs.readFileSync(new URL('../../../deploy/docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /REDIS_URL: "redis:\/\/:\$\{MOFACTS_REDIS_PASSWORD:\?[^}]+\}@redis:6379\/0"/);
  assert.match(compose, /redis-server --appendonly yes --requirepass \\"\$\$MOFACTS_REDIS_PASSWORD\\"/);
  assert.match(compose, /REDISCLI_AUTH=\\"\$\$MOFACTS_REDIS_PASSWORD\\" redis-cli --no-auth-warning ping/);
});

test('encrypted report retention round-trips and detects tampering', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  const sections = Object.fromEntries(['external', 'authentication', 'internal', 'repository'].map((sectionId) => [
    sectionId, { sectionId, status: 'NOT_APPLICABLE', controls: [] },
  ]));
  const report = finalizeReport({
    schema: 'SecurityAuditReportV1', reportId: 'audit-encryption-test', reportType: 'exposure',
    startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z',
    target: 'https://mofacts.optimallearning.org', sourceRevision: 'unknown', productionImage: 'unknown',
    toolVersions: { node: 'test' }, sections, executionErrors: [],
  });
  const plaintext = Buffer.from(`${canonicalJson(report)}\n`);
  const encrypted = encryptReportBuffer(plaintext, publicKey.export({ type: 'spki', format: 'pem' }));
  const decrypted = decryptReportEnvelope(encrypted, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.deepEqual(verifyCanonicalReportDigest(decrypted), report);
  const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` };
  assert.throws(() => decryptReportEnvelope(tampered, privateKey.export({ type: 'pkcs8', format: 'pem' })));
});

test('production authentication probes honor session-scoped credentials and fail closed', () => {
  const source = fs.readFileSync(new URL('./production-auth-audit.mjs', import.meta.url), 'utf8');
  assert.match(source, /sessionStorage\.getItem\('Meteor\.loginToken'\)/);
  assert.match(source, /sessionStorage\.setItem\('Meteor\.loginToken', stored\.token\)/);
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\('Meteor\.(?:loginToken|userId|loginTokenExpires)'/);
  assert.match(source, /if \(!resume\.ok\) \{[\s\S]*?passwordlessContainmentOutcomes\(\{\}\)[\s\S]*?errorControl\(outcome\.id/);
  assert.match(source, /passwordlessContainmentOutcomes\([\s\S]*?issuedToken[\s\S]*?modifiedTargetRejected[\s\S]*?crossUserMethodDenied/);
  assert.match(source, /reset-token\.expired-rejected[\s\S]*?reset-token\.current-single-use[\s\S]*?reset-token\.replay-rejected/);
  assert.match(source, /semanticAuthorizationProbeId\('method'[\s\S]*?semanticAuthorizationProbeId\('route'[\s\S]*?semanticAuthorizationProbeId\('publication'[\s\S]*?semanticAuthorizationProbeId\('download'/);
  assert.doesNotMatch(source, /numberedProbeId/);
  assert.match(source, /observations:\s*authorizationFailures[\s\S]*?omittedFailureCount:/);
  assert.match(source, /throttle\.connection[\s\S]*?throttle\.identifier[\s\S]*?throttle\.ip/);
  assert.match(source, /index < 11/);
});

test('authentication probe helpers produce stable bounded diagnostics', () => {
  const routeProbe = { actor: 'learnerA', path: '/admin/security-audits', expectDenied: true };
  assert.equal(
    semanticAuthorizationProbeId('route', routeProbe),
    semanticAuthorizationProbeId('route', { ...routeProbe }),
  );
  assert.match(semanticAuthorizationProbeId('route', routeProbe), /^authorization\.route\.learnera-admin-security-audits-[a-f0-9]{8}$/);
  assert.match(
    semanticAuthorizationProbeId('download', { actor: 'anonymous', path: `/download/${'a'.repeat(40)}` }),
    /anonymous-download-parameter-/,
  );
  assert.equal(assertUniqueSemanticProbeIds({ route: [routeProbe, { ...routeProbe }] }), false);
  assert.equal(throttleWasObserved({ ok: false, code: 'rate-limit' }), true);
  assert.equal(throttleResultCategory({ ok: false, code: 403 }), 'invalid-credentials');
  assert.equal(routeProbePassed({
    actor: 'learnerA', requestedPath: '/admin/security-audits', finalPath: '/home', expectDenied: true, authReady: true,
  }), true);
  assert.equal(routeProbePassed({
    actor: 'anonymous', requestedPath: '/profile', finalPath: '/profile', expectDenied: true, authReady: true,
  }), false);
});

test('passwordless containment accepts token issuance and identifies the exact failing boundary', () => {
  const passingState = {
    issuedToken: true,
    tokenLogin: true,
    identityMatches: true,
    experimentFlag: true,
    targetMatches: true,
    modifiedTargetRejected: true,
    adminDenied: true,
    ordinaryAccountDenied: true,
    assignedExperimentAllowed: true,
    crossUserMethodDenied: true,
    crossUserPublicationContained: true,
    tokenNotLeaked: true,
  };
  const passing = passwordlessContainmentOutcomes(passingState);
  assert.equal(passing.length, 12);
  assert.equal(passing.every((outcome) => outcome.passed), true);
  const failing = passwordlessContainmentOutcomes({ ...passingState, modifiedTargetRejected: false });
  assert.deepEqual(failing.filter((outcome) => !outcome.passed).map((outcome) => outcome.id), [
    'authentication.passwordless.modified-target-rejected',
  ]);
});

test('reset expiration probes select only links older than the configured lifetime', () => {
  const now = Date.parse('2026-08-21T12:00:00Z');
  const links = [
    { token: 'recent', issuedAtMs: now - 30 * 60 * 1000 },
    { token: 'expired', issuedAtMs: now - 90 * 60 * 1000 },
    { token: 'invalid-date', issuedAtMs: Number.NaN },
  ];
  assert.equal(selectExpiredResetLink(links, now, 60 * 60 * 1000)?.token, 'expired');
  assert.equal(selectExpiredResetLink(links.slice(0, 1), now, 60 * 60 * 1000), null);
  assert.throws(() => selectExpiredResetLink(null, now, 60 * 60 * 1000));
});
