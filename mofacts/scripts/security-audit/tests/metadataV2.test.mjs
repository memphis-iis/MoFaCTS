import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readAuditImageContextV2, writeAuditMetadataV2 } from '../core/metadataV2.mjs';
import { writeAuditFileV2, parseAuditFileV2 } from '../core/producerFilesV2.mjs';
import { hostAcquisitionFixture } from './fixtures/hostAcquisitionFixtures.mjs';
async function files(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-v2-metadata-'));
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  return { receipt: path.join(root, 'receipt.json'), metadata: path.join(root, 'metadata.json') };
}
const env = { AUDIT_TARGET: 'https://audit.example', AUDIT_TYPE: 'exposure', AUDIT_REPORT_ID: 'metadata-qualification', AUDIT_STARTED_AT: '2026-11-05T12:00:00.000Z' };
test('metadata derives platform image and source only from the validated matching host receipt', async t => {
  const input = await files(t), value = (await hostAcquisitionFixture()).releaseReceipt;
  value.receipt.publishedImage = { ...value.receipt.publishedImage, kind: 'index', platformManifestDigest: 'sha256:' + 'e'.repeat(64) };
  await writeAuditFileV2(input.receipt, value);
  const context = await readAuditImageContextV2(input.receipt);
  assert.equal(context.AUDIT_RUNTIME_IMAGE, 'ppavlikmemphis/mofacts-staging2@sha256:' + 'e'.repeat(64));
  const now = new Date('2026-11-05T12:02:00.000Z');
  await writeAuditMetadataV2({ releaseReceiptPath: input.receipt, metadataPath: input.metadata, env, now });
  const metadata = parseAuditFileV2(await fs.readFile(input.metadata));
  assert.equal(metadata.completedAt, now.toISOString()); assert.deepEqual(metadata.deployedImageDigest, context.deployedImageDigest);
  assert.equal(metadata.deployedApplicationRevision.value, value.receipt.baseCommit);
  await assert.rejects(writeAuditMetadataV2({ releaseReceiptPath: input.receipt, metadataPath: input.metadata, env, now }));
});
test('missing or mismatched receipts retain unavailable identity despite caller-supplied image or revision claims', async t => {
  const input = await files(t);
  const missing = await readAuditImageContextV2(input.receipt);
  assert.equal(missing.deployedImageDigest.state, 'unavailable'); assert(!Object.hasOwn(missing, 'AUDIT_RUNTIME_IMAGE'));
  const value = (await hostAcquisitionFixture()).releaseReceipt; value.result = 'MISMATCH'; await writeAuditFileV2(input.receipt, value);
  await writeAuditMetadataV2({ releaseReceiptPath: input.receipt, metadataPath: input.metadata,
    env: { ...env, AUDIT_RUNTIME_IMAGE: 'registry.example/untrusted:tag', GITHUB_SHA: 'f'.repeat(40) } });
  const metadata = parseAuditFileV2(await fs.readFile(input.metadata));
  assert.equal(metadata.deployedApplicationRevision.state, 'unavailable'); assert.equal(metadata.deployedImageDigest.state, 'unavailable');
  assert(!JSON.stringify(metadata).includes('untrusted')); assert(!Object.hasOwn(metadata, 'scannerSourceRevision'));
});
test('invalid target/profile cannot allocate metadata', async t => {
  const input = await files(t);
  for (const changed of [{ ...env, AUDIT_TYPE: 'other' }, { ...env, AUDIT_TARGET: 'http://audit.example' }]) {
    await assert.rejects(writeAuditMetadataV2({ releaseReceiptPath: input.receipt, metadataPath: input.metadata, env: changed }));
    await assert.rejects(fs.stat(input.metadata), { code: 'ENOENT' });
  }
});
