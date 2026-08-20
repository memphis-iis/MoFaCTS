import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalJson, finalizeReport, sanitizedMetrics, sanitizedText } from './audit-lib.mjs';
import {
  findCanaryLeaks,
  countPotentialSensitiveLogStatements,
  parseNmapOpenPorts,
  parseNpmAuditVulnerabilityCount,
  parseTrivyHighCritical,
} from './scanner-parsers.mjs';
import {
  decryptReportEnvelope,
  encryptReportBuffer,
  verifyCanonicalReportDigest,
} from './report-crypto.mjs';

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
  assert.throws(() => parseNmapOpenPorts('<nmaprun>'));
  assert.throws(() => parseNmapOpenPorts(undefined));
});

test('dependency parsers never turn incomplete evidence into a pass', () => {
  assert.equal(parseNpmAuditVulnerabilityCount({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }), 0);
  assert.equal(parseNpmAuditVulnerabilityCount({ metadata: { vulnerabilities: { high: 2, critical: 1 } } }), 3);
  assert.throws(() => parseNpmAuditVulnerabilityCount({}));
  assert.deepEqual(parseTrivyHighCritical({ Results: [{ Vulnerabilities: [] }] }), []);
  assert.equal(parseTrivyHighCritical({ Results: [{ Vulnerabilities: [{ Severity: 'CRITICAL' }] }] }).length, 1);
  assert.throws(() => parseTrivyHighCritical({}));
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
  assert.match(source, /if \(!resume\.ok\) \{[\s\S]*?errorControl\('authentication\.passwordless-containment'/);
  assert.match(source, /issuedToken[\s\S]*?tokenLogin\.ok[\s\S]*?!mismatchedTarget\.ok[\s\S]*?!adminAccess\.ok[\s\S]*?!crossUserAccess\.ok/);
});
