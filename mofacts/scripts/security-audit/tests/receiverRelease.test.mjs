import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fixture from '../../../common/securityAudit/fixtures/release-record.fixture.json' with { type: 'json' };
import { parsePublishedImage, parseReleaseReceiptV2, receiptPlatformImage, compareReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';
import { projectReleaseReceiptV2 } from '../qualification/releaseRecordStore.mjs';
import { createAuditReceiverPlatformIdentity, readReceiverReleaseBytes } from '../../../server/securityAudit/securityAuditReceiverRelease.ts';

const publication = fixture.qualification.publishedImage;
const record = () => ({ ...structuredClone(fixture), imageId: publication.configDigest, acceptance: 'operator-confirmed readiness and participant smoke checks' });
const bytes = value => Buffer.from(JSON.stringify(value));
const receipt = () => projectReleaseReceiptV2(bytes(record()), publication);
const build = { state: 'observed', identity: fixture.qualification.buildIdentity };

test('V2 projection binds explicit manifest/index publication to the existing record without requiring Phase 3 proof', () => {
  const bare = record(); delete bare.qualification;
  const projected = projectReleaseReceiptV2(bytes(bare), publication);
  assert.equal(projected.schema, 'MoFaCTSReleaseReceiptV2');
  assert.equal(Object.hasOwn(projected, 'qualification'), false);
  assert.equal(receiptPlatformImage(projected), 'registry.example.test/mofacts@' + publication.digest);
  const index = { ...publication, kind: 'index', platformManifestDigest: 'sha256:' + 'e'.repeat(64) };
  assert.equal(receiptPlatformImage(projectReleaseReceiptV2(bytes(bare), index)), 'registry.example.test/mofacts@' + index.platformManifestDigest);
  assert.equal(compareReleaseReceiptV2(projected, bare.imageId, bare.baseCommit, 'linux/amd64').result, 'MATCH');
  assert.equal(compareReleaseReceiptV2(projected, bare.imageId, bare.baseCommit, 'linux/arm64').result, 'MISMATCH');
});

test('V2 projection rejects missing, conflicting, private and ambiguous image mapping', () => {
  for (const mutate of [v => { v.publishedImage = undefined; }, v => { v.raw = 'synthetic-private-value'; },
    v => { v.publishedImage.configDigest = 'sha256:' + 'f'.repeat(64); },
    v => { v.publishedImage.digest = 'sha256:' + 'f'.repeat(64); },
    v => { v.publishedImage.kind = 'index'; }, v => { v.publishedImage.platform = 'linux/amd64\n'; },
    v => { v.publishedImage.platformManifestDigest = 'sha256:' + 'e'.repeat(64); }]) {
    const value = receipt(); mutate(value); assert.throws(() => parseReleaseReceiptV2(value));
  }
  assert.throws(() => projectReleaseReceiptV2(bytes(record()), { ...publication, kind: 'index', platformManifestDigest: 'sha256:' + 'e'.repeat(64) }));
  assert.throws(() => parsePublishedImage({ ...publication, privateValue: 'synthetic-private-value' }), error => !error.message.includes('synthetic-private-value'));
});

test('receiver independently checks platform/revision/dirty flag and refreshes receipt each request', async () => {
  let current = receipt(), reads = 0;
  const load = createAuditReceiverPlatformIdentity(async () => structuredClone(build), async () => { reads++; return bytes(current); }, 'linux/amd64');
  const observed = { state: 'observed', value: receiptPlatformImage(current) };
  assert.deepEqual(await load(), observed);
  for (const mutate of [v => { v.baseCommit = 'f'.repeat(40); }, v => { v.includedUncommittedLocalChanges = true; },
    v => { v.publishedImage.platform = 'linux/arm64'; }]) {
    current = receipt(); mutate(current);
    assert.deepEqual(await load(), { state: 'conflicting', reason: 'independent-observations-disagree' });
  }
  current = receipt(); assert.deepEqual(await load(), observed); assert.equal(reads, 5);
  assert.deepEqual(await createAuditReceiverPlatformIdentity(async () => ({ state: 'unavailable', reason: 'not-provided' }), async () => bytes(receipt()))(),
    { state: 'unavailable', reason: 'unresolved' });
});

test('missing or malformed receipt stays explicit and never rejects ordinary startup', async () => {
  for (const raw of [undefined, Buffer.from('bad JSON'), Buffer.alloc(8193), Buffer.from([0xff])]) {
    const load = createAuditReceiverPlatformIdentity(async () => build, async () => raw);
    assert.deepEqual(await load(), { state: 'unavailable', reason: raw === undefined ? 'not-provided' : 'malformed' });
  }
  assert.deepEqual(await createAuditReceiverPlatformIdentity(async () => build, async () => { throw new Error('private diagnostic'); })(),
    { state: 'unavailable', reason: 'malformed' });
  const malformedRepository = { ...receipt(), image: 'registry.example.test///mofacts:' + fixture.tag };
  assert.deepEqual(await createAuditReceiverPlatformIdentity(async () => build, async () => bytes(malformedRepository), 'linux/amd64')(),
    { state: 'unavailable', reason: 'malformed' });
});

test('root Linux reader enforces protected file/directory bounds and observes atomic replacement', {
  skip: process.platform !== 'linux' || process.getuid?.() !== 0,
}, async t => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-receiver-release-'));
  await fs.chmod(root, 0o700); const file = path.join(root, 'release-receipt.json');
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  assert.equal(await readReceiverReleaseBytes(root), undefined);
  await fs.writeFile(file, bytes(receipt()), { mode: 0o600 });
  assert.deepEqual(await readReceiverReleaseBytes(root), bytes(receipt()));
  await fs.chmod(root, 0o755); await assert.rejects(readReceiverReleaseBytes(root)); await fs.chmod(root, 0o700);
  await fs.chmod(file, 0o644); await assert.rejects(readReceiverReleaseBytes(root)); await fs.chmod(file, 0o600);
  const next = { ...receipt(), deployedAtUtc: '2026-02-01T00:00:00.000Z' };
  const temporary = path.join(root, 'next.json'); await fs.writeFile(temporary, bytes(next), { mode: 0o600 });
  await fs.rename(temporary, file); assert.deepEqual(await readReceiverReleaseBytes(root), bytes(next));
  await fs.link(file, temporary); await assert.rejects(readReceiverReleaseBytes(root)); await fs.unlink(temporary);
  await fs.rename(file, temporary); await fs.symlink(temporary, file); await assert.rejects(readReceiverReleaseBytes(root));
  await fs.unlink(file); await fs.rename(temporary, file);
  await fs.writeFile(file, Buffer.alloc(8193)); await assert.rejects(readReceiverReleaseBytes(root));
  await fs.unlink(file); await fs.mkdir(file); await assert.rejects(readReceiverReleaseBytes(root));
});
