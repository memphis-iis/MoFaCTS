import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../common/securityAudit/catalogRegistry.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { finalizeAuditReport, parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { encryptAuditReportFileV2, assertAuditExecutionCompleteFileV2 } from '../core/reportFilesV2.mjs';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { evaluateExternalObservationsV2 } from '../external/observationsV2.mjs';
import { evaluateHostObservations, hostUdpMeasurements } from '../internal/evaluateHost.mjs';
import { evaluateUdpExposure } from '../composite/udpExposure.mjs';
import { decryptReportEnvelope } from '../report-crypto.mjs';
import { safeExternalObservationsV2 } from './fixtures/externalFixtures.mjs';
import { hostFixture, hostNow } from './fixtures/hostFixtures.mjs';
import { envelope, errorReport } from './fixtures/v2Fixtures.mjs';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { AUDIT_TARGET: envelope.target, AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: publicKey };
async function fixture(t, report) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-retention-v2-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, 'report.json'), encryptedPath = path.join(directory, 'encrypted.json');
  const bytes = Buffer.from(canonicalAuditJson(report) + '\n');
  await fs.writeFile(reportPath, bytes); return { reportPath, encryptedPath, bytes, env };
}
async function completeReport(fail = false) {
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion'), raw = safeExternalObservationsV2();
  if (fail) raw['external.public-tcp-ports.sensitive'].value.unexpectedPortCount = 1;
  const host = await hostFixture();
  const producers = [evaluateExternalObservationsV2(catalog, 'exposure', raw),
    await evaluateHostObservations(catalog, 'exposure', Buffer.from(canonicalAuditJson(host)), hostNow),
    evaluateUdpExposure(catalog, 'exposure', { observedResultCount: 7, expectedResultCount: 7, openSelectedUdpPortCount: 0 }, await hostUdpMeasurements(host, hostNow))];
  return assembleAuditReportV2({ ...envelope, reportType: 'exposure', artifacts: producers.map(artifact => ({ producerId: artifact.producerId, artifact })) });
}

test('V2 retention preserves exact validated report bytes and digests through the existing authenticated encryption format', async t => {
  for (const report of [await errorReport(), await completeReport()]) {
    const f = await fixture(t, report); await encryptAuditReportFileV2(f);
    const encrypted = JSON.parse(await fs.readFile(f.encryptedPath, 'utf8'));
    const plain = decryptReportEnvelope(encrypted, privateKey);
    assert.deepEqual(plain, f.bytes); assert.equal(Number((await fs.stat(f.encryptedPath)).mode) & 0o777, 0o600);
    assert.equal(JSON.stringify(encrypted).includes(report.reportId), false);
    assert.deepEqual(await parseSecurityAuditReportV2(JSON.parse(plain), { purpose: 'retained' }), report);
  }
});

test('V2 final assertion accepts complete PASS and security FAIL reports while rejecting any execution ERROR', async t => {
  for (const fail of [false, true]) {
    const report = await completeReport(fail), f = await fixture(t, report);
    assert.equal(report.counts.error, 0); assert.equal(report.counts.fail, fail ? 1 : 0);
    await assertAuditExecutionCompleteFileV2(f);
  }
  const f = await fixture(t, await errorReport());
  await assert.rejects(assertAuditExecutionCompleteFileV2(f), /incomplete/);
});

test('V2 final assertion checks actual ERROR counts even when a syntactically valid error list is empty', async t => {
  const report = await errorReport(); report.executionErrors = [];
  const { digestSha256, counts, ...payload } = report; void digestSha256; void counts;
  const modified = await finalizeAuditReport(payload), f = await fixture(t, modified);
  assert.equal(modified.executionErrors.length, 0); assert.ok(modified.counts.error > 0);
  await assert.rejects(assertAuditExecutionCompleteFileV2(f), /incomplete/);
});

test('V2 retention fails before creating output for malformed/digest/target/key inputs and never overwrites prior output', async t => {
  const f = await fixture(t, await errorReport());
  for (const change of [{ env: { ...env, AUDIT_TARGET: 'https://another.example' } },
    { env: { ...env, AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: 'PRIVATE-invalid-key' } }, { env: {} }]) {
    await assert.rejects(encryptAuditReportFileV2({ ...f, ...change })); await assert.rejects(fs.stat(f.encryptedPath), { code: 'ENOENT' });
  }
  await fs.writeFile(f.encryptedPath, 'prior owner output');
  await assert.rejects(encryptAuditReportFileV2(f), /already exists/);
  assert.equal(await fs.readFile(f.encryptedPath, 'utf8'), 'prior owner output');
  await fs.unlink(f.encryptedPath);
  const value = JSON.parse(f.bytes); value.digestSha256 = '0'.repeat(64); await fs.writeFile(f.reportPath, canonicalAuditJson(value) + '\n');
  await assert.rejects(encryptAuditReportFileV2(f)); await assert.rejects(fs.stat(f.encryptedPath), { code: 'ENOENT' });
});

test('V2 retention CLI accepts only protected target/key configuration and prints constant diagnostics', async t => {
  const f = await fixture(t, await errorReport()), script = fileURLToPath(new URL('../encrypt-report-v2.mjs', import.meta.url));
  const environment = { PATH: process.env.PATH, NODE_OPTIONS: '', ...env };
  const result = await promisify(execFile)(process.execPath, [script, f.reportPath, f.encryptedPath], { env: environment });
  assert.equal(result.stdout, 'V2 audit report encrypted for retention.\n');
  await assert.rejects(promisify(execFile)(process.execPath, [script, f.reportPath, f.encryptedPath, 'PRIVATE-extra'], { env: environment }), error => {
    assert.equal(error.code, 1); assert.equal(error.stderr.includes('PRIVATE'), false); return true;
  });
});

test('V2 final assertion CLI separates security findings from scanner failures and rejects extra arguments', async t => {
  const script = fileURLToPath(new URL('../assert-execution-complete-v2.mjs', import.meta.url));
  const environment = { PATH: process.env.PATH, NODE_OPTIONS: '', AUDIT_TARGET: envelope.target };
  const complete = await fixture(t, await completeReport(true));
  const result = await promisify(execFile)(process.execPath, [script, complete.reportPath], { env: environment });
  assert.equal(result.stdout, 'V2 audit execution completed without scanner errors.\n');
  const incomplete = await fixture(t, await errorReport());
  for (const args of [[incomplete.reportPath], [complete.reportPath, 'PRIVATE-extra'], []]) {
    await assert.rejects(promisify(execFile)(process.execPath, [script, ...args], { env: environment }), error => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, 'V2 audit execution is incomplete or invalid.\n');
      return true;
    });
  }
});
