import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { retainPinnedAuditArchiveV2, verifySavedAuditArchiveV2, verifyAuditReportReadbackV2, completeOfflineKeyRetentionV2 } from '../core/reportFilesV2.mjs';
import { readAuditFileV2, writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { decryptReportEnvelope } from '../report-crypto.mjs';
import { finalizeAuditReport } from '../../../common/securityAudit/reportV2.ts';
import { errorReport } from './fixtures/v2Fixtures.mjs';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const expectedPublicKeySha256 = crypto.createHash('sha256').update(pair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-integrity-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const report = await errorReport(), reportPath = path.join(directory, 'report.json');
  await writeAuditFileV2(reportPath, report);
  return { directory, report, reportPath, encryptedPath: path.join(directory, 'encrypted.json'),
    readbackPath: path.join(directory, 'receiver.json'), expectedPublicKeySha256,
    env: { AUDIT_TARGET: report.target, AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: publicKey } };
}

test('pinned retention verifies actual saved bytes and returns content-free integrity evidence', async t => {
  const f = await fixture(t), receipt = await retainPinnedAuditArchiveV2(f);
  const saved = await fs.readFile(f.encryptedPath);
  assert.equal(receipt.publicKeySha256, expectedPublicKeySha256);
  assert.equal(receipt.encryptedBytesSha256, crypto.createHash('sha256').update(saved).digest('hex'));
  assert.equal(receipt.savedBytesVerified, true);
  assert.equal(receipt.digestSha256, f.report.digestSha256);
  assert.equal(Object.hasOwn(receipt, 'decrypted'), false);
  assert.deepEqual(await verifySavedAuditArchiveV2({ encryptedPath: f.encryptedPath,
    expectedEncryptedBytesSha256: receipt.encryptedBytesSha256 }), { encryptedBytesSha256: receipt.encryptedBytesSha256, savedBytesVerified: true });
  // Actual offline-key round trip remains a different qualification operation.
  assert.deepEqual(decryptReportEnvelope(JSON.parse(saved), pair.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    await fs.readFile(f.reportPath));
  for (const forbidden of ['PRIVATE KEY', 'ciphertext', 'encryptedKey', f.directory]) assert.equal(JSON.stringify(receipt).includes(forbidden), false);
});

test('missing/foreign pins and private-key input fail before creating archive bytes', async t => {
  const f = await fixture(t);
  for (const patch of [{ expectedPublicKeySha256: undefined }, { expectedPublicKeySha256: '0'.repeat(64) },
    { env: { ...f.env, AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) } }]) {
    await assert.rejects(retainPinnedAuditArchiveV2({ ...f, ...patch }));
    await assert.rejects(fs.stat(f.encryptedPath), { code: 'ENOENT' });
  }
});

test('saved copy corruption and missing expected digest cannot become verified retention', async t => {
  const f = await fixture(t), receipt = await retainPinnedAuditArchiveV2(f);
  await fs.appendFile(f.encryptedPath, 'corruption');
  await assert.rejects(verifySavedAuditArchiveV2({ encryptedPath: f.encryptedPath, expectedEncryptedBytesSha256: receipt.encryptedBytesSha256 }));
  await assert.rejects(verifySavedAuditArchiveV2({ encryptedPath: f.encryptedPath }));
  assert.ok(await fs.stat(f.reportPath));
});

test('receiver readback requires a separately acquired exact validated report', async t => {
  const f = await fixture(t);
  await writeAuditFileV2(f.readbackPath, f.report);
  const receipt = await verifyAuditReportReadbackV2(f);
  assert.equal(receipt.ingestedReportMatched, true);
  assert.equal(receipt.reportId, f.report.reportId);
  assert.equal(receipt.catalogDigestSha256, f.report.catalogDigestSha256);
  await assert.rejects(verifyAuditReportReadbackV2({ ...f, readbackPath: f.reportPath }));
  const { counts, digestSha256, ...payload } = f.report; void counts; void digestSha256;
  await fs.unlink(f.readbackPath);
  await writeAuditFileV2(f.readbackPath, await finalizeAuditReport({ ...payload, reportId: 'different-qualified-report' }));
  await assert.rejects(verifyAuditReportReadbackV2(f));
  assert.ok(await fs.stat(f.reportPath));
});

test('offline-key completion removes only its temporary source after saved archive and exact receiver readback pass', async t => {
  const f = await fixture(t), archiveReceipt = await retainPinnedAuditArchiveV2(f);
  await writeAuditFileV2(f.readbackPath, f.report);
  const result = await completeOfflineKeyRetentionV2({ ...f, archiveReceipt });
  assert.equal(result.temporaryPlaintextRemoved, true);
  assert.equal(result.ingestedReportMatched, true);
  assert.equal(Object.hasOwn(result, 'savedKeyRoundTrip'), false);
  await assert.rejects(fs.stat(f.reportPath), { code: 'ENOENT' });
  await assert.rejects(fs.stat(f.readbackPath), { code: 'ENOENT' });
  assert.ok(await fs.stat(f.encryptedPath));
});

for (const mode of ['missing-readback', 'corrupt-archive', 'wrong-pin', 'wrong-source-receipt', 'forged-receipt-field']) {
  test(`offline-key ${mode} retains temporary plaintext and never claims complete retention`, async t => {
    const f = await fixture(t), archiveReceipt = await retainPinnedAuditArchiveV2(f);
    if (mode !== 'missing-readback') await writeAuditFileV2(f.readbackPath, f.report);
    if (mode === 'corrupt-archive') await fs.appendFile(f.encryptedPath, 'corrupt');
    if (mode === 'wrong-source-receipt') archiveReceipt.reportBytesSha256 = '0'.repeat(64);
    if (mode === 'forged-receipt-field') archiveReceipt.savedKeyRoundTrip = true;
    await assert.rejects(completeOfflineKeyRetentionV2({ ...f, archiveReceipt,
      ...(mode === 'wrong-pin' ? { expectedPublicKeySha256: '0'.repeat(64) } : {}) }));
    assert.ok(await fs.stat(f.reportPath)); assert.ok(await fs.stat(f.encryptedPath));
  });
}

test('encrypted file bounds opt in explicitly without broadening ordinary report reads', async t => {
  const f = await fixture(t), large = path.join(f.directory, 'large-envelope');
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 1); await fs.writeFile(large, bytes);
  await assert.rejects(readAuditFileV2(large));
  const expectedEncryptedBytesSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal((await verifySavedAuditArchiveV2({ encryptedPath: large, expectedEncryptedBytesSha256 })).savedBytesVerified, true);
  for (const maximum of [0, -1, NaN, Infinity, 4 * 1024 * 1024 + 1]) await assert.rejects(readAuditFileV2(large, maximum));
});

test('linked archive/readback files cannot substitute for independently owned bytes', { skip: process.platform !== 'linux' }, async t => {
  const f = await fixture(t), receipt = await retainPinnedAuditArchiveV2(f);
  const link = path.join(f.directory, 'linked-envelope'); await fs.symlink(f.encryptedPath, link);
  await assert.rejects(verifySavedAuditArchiveV2({ encryptedPath: link, expectedEncryptedBytesSha256: receipt.encryptedBytesSha256 }));
  await fs.link(f.reportPath, f.readbackPath);
  await assert.rejects(verifyAuditReportReadbackV2(f));
});
