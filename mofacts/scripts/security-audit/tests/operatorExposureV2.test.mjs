import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import { acquireOperatorExposureV2, finishOperatorExposureV2 } from '../core/operatorExposureV2.mjs';
import { errorReport } from './fixtures/v2Fixtures.mjs';
import { finalizeAuditReport } from '../../../common/securityAudit/reportV2.ts';
import { writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { decryptReportEnvelope } from '../report-crypto.mjs';

const target = 'https://staging2.optimallearning.org';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-operator-exposure-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { counts, digestSha256, ...payload } = await errorReport('exposure'); void counts; void digestSha256;
  const report = await finalizeAuditReport({ ...payload, target });
  const reportPath = path.join(root, 'report.json'); await writeAuditFileV2(reportPath, report);
  return { root, report, reportPath, encryptedPath: path.join(root, 'encrypted.json'), receiptPath: path.join(root, 'outcome.json') };
}

test('operator exposure acquisition isolates signer and preserves independently unavailable evidence', async t => {
  const f = await fixture(t), calls = [];
  const directory = path.join(f.root, 'acquisition');
  const input = { acquisitionPath: path.join(f.root, 'raw.json'), directory,
    env: { PATH: process.env.PATH, AUDIT_TARGET: target, AUDIT_TYPE: 'exposure', AUDIT_REPORT_ID: 'synthetic-operator',
      AUDIT_REPORT_INGEST_SECRET: 'PRIVATE-signer', AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: 'PRIVATE-unneeded' } };
  const dependencies = {
    splitHost: async () => { calls.push('split'); throw new Error('PRIVATE acquisition'); },
    external: async options => {
      calls.push('external'); assert.equal(options.env.AUDIT_REPORT_INGEST_SECRET, undefined);
      assert.equal(options.env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY, undefined);
    },
    host: async () => { calls.push('host'); }, metadata: async () => { calls.push('metadata'); },
    assemble: async () => { calls.push('assemble'); },
  };
  const output = await acquireOperatorExposureV2(input, dependencies);
  assert.deepEqual(calls, ['split', 'external', 'host', 'metadata', 'assemble']);
  assert.equal(output.steps[0].completed, false);
  assert.equal(JSON.stringify(output).includes('PRIVATE'), false);
  await assert.rejects(acquireOperatorExposureV2(input, dependencies), { code: 'EEXIST' });
  assert.equal(calls.length, 5);
});

test('operator report encryption precedes one upload and incomplete execution stays incomplete', async t => {
  const f = await fixture(t), pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  let uploads = 0;
  const result = await finishOperatorExposureV2({ ...f, env: { AUDIT_TARGET: target,
    AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: pair.publicKey.export({ type: 'spki', format: 'pem' }),
    AUDIT_REPORT_INGEST_SECRET: 'synthetic-signer-value-for-only-upload' } }, {
    upload: async options => {
      uploads += 1;
      assert.equal(options.env.AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY, undefined);
      const encrypted = JSON.parse(await fs.readFile(f.encryptedPath, 'utf8'));
      assert.deepEqual(decryptReportEnvelope(encrypted, pair.privateKey.export({ type: 'pkcs8', format: 'pem' })), await fs.readFile(f.reportPath));
    },
  });
  assert.equal(uploads, 1); assert.equal(result.storageAccepted, true);
  assert.equal(result.executionComplete, false); assert.ok(result.counts.error > 0);
  assert.deepEqual(JSON.parse(await fs.readFile(f.receiptPath, 'utf8')), result);
});

test('operator retention failure or foreign target cannot submit or create accepted receipt', async t => {
  const f = await fixture(t); let uploads = 0;
  const dependencies = { encrypt: async () => { throw new Error('PRIVATE key error'); }, upload: async () => { uploads += 1; } };
  await assert.rejects(finishOperatorExposureV2({ ...f, env: { AUDIT_TARGET: target } }, dependencies));
  await assert.rejects(finishOperatorExposureV2({ ...f, env: { AUDIT_TARGET: 'https://production.example' } }, dependencies));
  assert.equal(uploads, 0); await assert.rejects(fs.stat(f.receiptPath), { code: 'ENOENT' });
});
