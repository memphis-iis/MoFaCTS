import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { verifyAuditRequestV2, AUDIT_V2_MAX_BODY_BYTES } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { assembleAuditReportFilesV2, readAuditFileV2, parseAuditFileV2,
  writeAuditFileV2, writeAuditProducerFileV2 } from '../core/producerFilesV2.mjs';
import { uploadAuditReportFileV2 } from '../core/uploadV2.mjs';
import { writeHostProducerFilesV2 } from '../internal/producerFilesV2.mjs';
import { hostFixture, unavailableFact } from './fixtures/hostFixtures.mjs';
import { envelope, errorArtifacts, ingestionContext } from './fixtures/v2Fixtures.mjs';

const clock = new Date('2026-11-05T12:02:00.000Z');
const env = { AUDIT_TARGET: 'https://audit.example', AUDIT_REPORT_INGEST_SECRET: 'synthetic-file-pipeline-signing-material' };
async function fixture(t, profile = 'full') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-v2-producer-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifactDirectory = path.join(root, 'producers'); await fs.mkdir(artifactDirectory);
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  const slots = await errorArtifacts(profile);
  for (const { producerId, artifact } of slots) {
    await writeAuditProducerFileV2({ file: path.join(artifactDirectory, `${producerId}.json`),
      catalog, artifact, profile, producerId });
  }
  const { target: _target, ...metadata } = envelope; void _target;
  return { root, catalog, slots, artifactDirectory, outputPath: path.join(root, 'report.json'),
    envelope: { ...metadata, reportType: profile }, env };
}

test('V2 file assembly preserves exact full/exposure profiles and canonical report bytes', async t => {
  for (const profile of ['full', 'exposure']) {
    const input = await fixture(t, profile), report = await assembleAuditReportFilesV2(input);
    assert.equal(report.target, env.AUDIT_TARGET); assert.equal(report.counts.error, profile === 'full' ? 70 : 23);
    assert.deepEqual(await parseSecurityAuditReportV2(report, ingestionContext), report);
    assert.equal((await fs.readFile(input.outputPath, 'utf8')), canonicalAuditJson(report) + '\n');
    if (process.platform !== 'win32') assert.equal((await fs.stat(input.outputPath)).mode & 0o777, 0o600);
  }
});

test('V2 file assembly has named whole-producer recovery for missing, malformed and contradictory files', async t => {
  for (const mode of ['missing', 'malformed', 'duplicate-key', 'duplicate-id', 'wrong-owner', 'metadata']) {
    const input = await fixture(t), external = path.join(input.artifactDirectory, 'external.json');
    if (mode === 'missing') await fs.unlink(external);
    else if (mode === 'malformed') await fs.writeFile(external, 'PRIVATE broken raw output');
    else if (mode === 'duplicate-key') {
      const original = await fs.readFile(external, 'utf8');
      await fs.writeFile(external, '{"producerId":"PRIVATE-foreign",' + original.slice(1));
    } else {
      const artifact = JSON.parse(await fs.readFile(external, 'utf8'));
      if (mode === 'duplicate-id') artifact.controls[1] = artifact.controls[0];
      if (mode === 'wrong-owner') artifact.producerId = 'internal';
      if (mode === 'metadata') artifact.controls[0].title = 'PRIVATE injected metadata';
      await fs.writeFile(external, canonicalAuditJson(artifact));
    }
    const report = await assembleAuditReportFilesV2(input);
    const externalRows = report.sections.external.controls.filter(row => row.controlId !== 'external.public-udp-ports');
    assert.ok(externalRows.every(row => row.status === 'ERROR'
      && row.evidence.category === (mode === 'missing' ? 'producer-missing' : 'producer-malformed')));
    assert.ok(report.sections.internal.controls.every(row => row.evidence.category === 'synthetic-contract-qualification'));
    assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  }
});

test('V2 artifact directory rejects unknown/profile-excluded slots instead of silently dropping them', async t => {
  for (const name of ['foreign.json', 'repository.json', 'external.json.backup']) {
    const input = await fixture(t, 'exposure'); await fs.writeFile(path.join(input.artifactDirectory, name), '{}');
    await assert.rejects(assembleAuditReportFilesV2(input));
    await assert.rejects(fs.stat(input.outputPath), { code: 'ENOENT' });
  }
});

test('V2 producer writer validates before creating files and never replaces existing evidence', async t => {
  const input = await fixture(t), slot = input.slots[0], file = path.join(input.root, 'new-producer.json');
  const bad = structuredClone(slot.artifact); bad.controls.pop();
  await assert.rejects(writeAuditProducerFileV2({ file, artifact: bad, catalog: input.catalog, profile: 'full', producerId: slot.producerId }));
  await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  const bytes = await fs.readFile(path.join(input.artifactDirectory, `${slot.producerId}.json`));
  await writeAuditProducerFileV2({ file, artifact: slot.artifact, catalog: input.catalog, profile: 'full', producerId: slot.producerId });
  await assert.rejects(writeAuditFileV2(file, { changed: true }), { code: 'EEXIST' });
  assert.deepEqual(await fs.readFile(file), bytes);
  await fs.writeFile(input.outputPath, 'original evidence');
  await assert.rejects(assembleAuditReportFilesV2(input), { code: 'EEXIST' });
  assert.equal(await fs.readFile(input.outputPath, 'utf8'), 'original evidence');
});

test('V2 byte parser rejects ambiguous JSON, invalid UTF-8, BOM and extra documents', () => {
  for (const bytes of [Buffer.from('{"a":1,"a":2}'), Buffer.from(' {"a":1}'), Buffer.from('{"a":1}\n\n'),
    Buffer.from('{"a":1}{}'), Buffer.from('\ufeff{"a":1}'), Buffer.from([0x22, 0xff, 0x22])]) {
    assert.throws(() => parseAuditFileV2(bytes));
  }
  assert.deepEqual(parseAuditFileV2(Buffer.from('{"a":1}\n')), { a: 1 });
});

test('V2 file reader rejects oversized files, directories and hard links', async t => {
  const input = await fixture(t), large = path.join(input.root, 'large.json');
  await fs.writeFile(large, Buffer.alloc(AUDIT_V2_MAX_BODY_BYTES + 1));
  await assert.rejects(readAuditFileV2(large)); await assert.rejects(readAuditFileV2(input.artifactDirectory));
  const original = path.join(input.artifactDirectory, 'external.json');
  await fs.link(original, path.join(input.root, 'alias.json'));
  await assert.rejects(readAuditFileV2(original));
  const report = await assembleAuditReportFilesV2(input);
  assert.ok(report.sections.external.controls.filter(row => row.controlId !== 'external.public-udp-ports')
    .every(row => row.evidence.category === 'producer-malformed'));
});

test('V2 file reader and directory boundary reject symlinks', { skip: process.platform === 'win32' }, async t => {
  const input = await fixture(t), original = path.join(input.artifactDirectory, 'external.json');
  await fs.rename(original, path.join(input.root, 'external.json'));
  await fs.symlink(path.join(input.root, 'external.json'), original);
  await assert.rejects(readAuditFileV2(original));
  const report = await assembleAuditReportFilesV2(input);
  assert.ok(report.sections.external.controls.filter(row => row.controlId !== 'external.public-udp-ports')
    .every(row => row.evidence.category === 'producer-malformed'));
  const alias = path.join(input.root, 'alias'); await fs.symlink(input.artifactDirectory, alias);
  await assert.rejects(assembleAuditReportFilesV2({ ...input, artifactDirectory: alias }));
});

test('V2 assembly/upload require the same explicit protected HTTPS origin before touching files', async t => {
  const input = await fixture(t); let requests = 0;
  const fetchImpl = () => { requests++; assert.fail('Network request for invalid configuration'); };
  for (const target of [undefined, '', 'http://audit.example', 'https://audit.example/',
    'https://user:PRIVATE@audit.example', 'https://audit.example/path', 'https://audit.example?q=PRIVATE']) {
    const invalidEnv = { ...env, AUDIT_TARGET: target };
    await assert.rejects(assembleAuditReportFilesV2({ ...input, artifactDirectory: '/absent-producer-input', env: invalidEnv }), error => error.code !== 'ENOENT');
    await assert.rejects(uploadAuditReportFileV2({ reportPath: '/absent-report', env: invalidEnv, fetchImpl }), error => error.code !== 'ENOENT');
  }
  await assert.rejects(assembleAuditReportFilesV2({ ...input, envelope: { ...input.envelope, target: env.AUDIT_TARGET } }));
  await assert.rejects(uploadAuditReportFileV2({ reportPath: '/absent-report', env: { AUDIT_TARGET: env.AUDIT_TARGET }, fetchImpl }), /configuration/);
  assert.equal(requests, 0); await assert.rejects(fs.stat(input.outputPath), { code: 'ENOENT' });
});

test('V2 uploader signs exact persisted bytes for the V2 endpoint with one request and independent receiver validation', async t => {
  const input = await fixture(t), report = await assembleAuditReportFilesV2(input); let requests = 0, disposed = 0;
  await uploadAuditReportFileV2({ reportPath: input.outputPath, env, now: clock, fetchImpl: async (url, options) => {
    requests++; assert.equal(url.href, env.AUDIT_TARGET + '/internal/security-audits/v2');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST'); assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(options.body, await fs.readFile(input.outputPath));
    const verified = verifyAuditRequestV2({ body: options.body, secret: env.AUDIT_REPORT_INGEST_SECRET, now: clock, headers: {
      timestamp: options.headers['X-MoFaCTS-Audit-Timestamp'], nonce: options.headers['X-MoFaCTS-Audit-Nonce'],
      signature: options.headers['X-MoFaCTS-Audit-Signature'] } });
    // These receiver observations are independent fixture inputs, never copied
    // from report claims to bypass the receiver's identity comparison.
    assert.deepEqual(await parseSecurityAuditReportV2(verified.value, ingestionContext), report);
    return new Response(new ReadableStream({ cancel() { disposed++; } }), { status: 201 });
  } });
  assert.equal(requests, 1); assert.equal(disposed, 1);
});

test('V2 uploader rejects target/digest/time mutations before a network request', async t => {
  const input = await fixture(t); await assembleAuditReportFilesV2(input);
  let requests = 0; const fetchImpl = () => { requests++; assert.fail('Invalid report reached network'); };
  await assert.rejects(uploadAuditReportFileV2({ reportPath: input.outputPath, env: { ...env, AUDIT_TARGET: 'https://other.example' }, now: clock, fetchImpl }));
  for (const now of [new Date('invalid'), new Date('2026-11-05T12:20:00.000Z'), new Date('2026-11-05T11:55:00.000Z')]) {
    await assert.rejects(uploadAuditReportFileV2({ reportPath: input.outputPath, env, now, fetchImpl }));
  }
  const report = JSON.parse(await fs.readFile(input.outputPath, 'utf8')); report.counts.error--;
  await fs.writeFile(input.outputPath, canonicalAuditJson(report));
  await assert.rejects(uploadAuditReportFileV2({ reportPath: input.outputPath, env, now: clock, fetchImpl }));
  assert.equal(requests, 0);
});

test('V2 uploader rejects every non-201 response and transport error without retries or private diagnostics', async t => {
  const input = await fixture(t); await assembleAuditReportFilesV2(input);
  for (const status of [200, 301, 400, 401, 409, 413, 429, 500, 503]) {
    let requests = 0, disposed = 0;
    await assert.rejects(uploadAuditReportFileV2({ reportPath: input.outputPath, env, now: clock, fetchImpl: async () => {
      requests++; return new Response(new ReadableStream({ cancel() { disposed++; } }), { status });
    } }), /^Error: V2 audit upload was not accepted$/);
    assert.equal(requests, 1); assert.equal(disposed, 1);
  }
  let requests = 0;
  await assert.rejects(uploadAuditReportFileV2({ reportPath: input.outputPath, env, now: clock, fetchImpl: async () => {
    requests++; throw new Error('PRIVATE ' + env.AUDIT_REPORT_INGEST_SECRET);
  } }), /^Error: V2 audit upload transport failed$/);
  assert.equal(requests, 1);
});

test('V2 uploader CLI has no target option and prints only a constant failure diagnostic', async () => {
  const cli = fileURLToPath(new URL('../upload-report-v2.mjs', import.meta.url));
  for (const args of [[], ['missing.json', '--target', 'https://other.example'], ['missing.json']]) {
    await assert.rejects(promisify(execFile)(process.execPath, [cli, ...args], {
      env: { ...process.env, AUDIT_TARGET: 'https://user:PRIVATE@audit.example', AUDIT_REPORT_INGEST_SECRET: 'PRIVATE'.repeat(8) },
    }), error => error.stdout === '' && error.stderr === 'V2 audit upload failed; no acceptance was recorded.\n');
  }
});

async function hostFiles(t, host, udp, profile = 'full') {
  const input = await fixture(t, profile);
  for (const producerId of ['internal', 'composite-exposure']) await fs.unlink(path.join(input.artifactDirectory, `${producerId}.json`));
  const hostObservationPath = path.join(input.root, 'host.json'), udpObservationPath = path.join(input.root, 'udp.json');
  if (host !== undefined) await fs.writeFile(hostObservationPath, typeof host === 'string' ? host : canonicalAuditJson(host) + '\n');
  if (udp !== undefined) await fs.writeFile(udpObservationPath, canonicalAuditJson(udp) + '\n');
  await writeHostProducerFilesV2({ ...input, hostObservationPath, udpObservationPath, profile, now: clock });
  return assembleAuditReportFilesV2(input);
}

test('V2 host file adapter emits validated internal/composite artifacts for both exact profiles', async t => {
  for (const profile of ['full', 'exposure']) {
    const report = await hostFiles(t, await hostFixture(),
      { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0 }, profile);
    assert.ok(report.sections.internal.controls.every(row => row.status === 'PASS'));
    assert.equal(report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports').status, 'PASS');
    await parseSecurityAuditReportV2(report, ingestionContext);
  }
});

test('V2 host file adapter preserves missing/version/malformed errors and independent positive UDP proof', async t => {
  const wrongVersion = await hostFixture(); wrongVersion.observationSchema = 'WrongHostVersion';
  for (const [host, category] of [[undefined, 'producer-missing'], [wrongVersion, 'observation-version'], ['PRIVATE broken host JSON', 'producer-malformed']]) {
    const report = await hostFiles(t, host,
      { observedResultCount: 1, expectedResultCount: 7, openSelectedUdpPortCount: 1 });
    assert.ok(report.sections.internal.controls.every(row => row.status === 'ERROR' && row.evidence.category === category));
    const udp = report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports');
    assert.equal(udp.status, 'FAIL'); assert.equal(Object.keys(udp.evidence.metrics).length, 3);
    assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  }
  const missingUdp = await hostFiles(t, await hostFixture(), undefined);
  assert.ok(missingUdp.sections.internal.controls.every(row => row.status === 'PASS'));
  assert.equal(missingUdp.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports').status, 'ERROR');
});

test('V2 host file adapter retains conclusive host failure with unavailable facts and never fabricates composite PASS', async t => {
  const host = await hostFixture();
  host.observations.redis.unauthenticatedCommandAccepted.value = true;
  unavailableFact(host, 'redis', 'auditConnectivity'); unavailableFact(host, 'firewall', 'firewallActive');
  const report = await hostFiles(t, host, { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0 });
  assert.equal(report.sections.internal.controls.find(row => row.controlId === 'internal.redis-auth').status, 'FAIL');
  assert.equal(report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports').status, 'ERROR');
});

test('V2 host emitter CLI writes explicit errors for absent observations without claiming a security pass', async t => {
  const input = await fixture(t, 'exposure');
  for (const producerId of ['internal', 'composite-exposure']) await fs.unlink(path.join(input.artifactDirectory, `${producerId}.json`));
  const cli = fileURLToPath(new URL('../emit-host-producers-v2.mjs', import.meta.url));
  const args = ['exposure', path.join(input.root, 'missing-host.json'), path.join(input.root, 'missing-udp.json'), input.artifactDirectory];
  const result = await promisify(execFile)(process.execPath, [cli, ...args]);
  assert.equal(result.stdout, 'V2 host and composite producer artifacts written; inspect their outcomes.\n');
  assert.equal(result.stderr, '');
  const report = await assembleAuditReportFilesV2(input);
  assert.ok(report.sections.internal.controls.every(row => row.status === 'ERROR' && row.evidence.category === 'producer-missing'));
  assert.equal(report.sections.external.controls.find(row => row.controlId === 'external.public-udp-ports').status, 'ERROR');
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'invalid-profile', ...args.slice(1)]),
    error => error.stdout === '' && error.stderr === 'V2 host artifact emission failed; no complete producer output is claimed.\n');
});
