import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { observeEmbeddedBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { auditReceiverRevision, createAuditReceiverIdentityLoader, readEmbeddedSourceBytes } from '../../../server/securityAudit/securityAuditReceiverIdentity.ts';
import { authenticateAuditRequestV2, signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { errorReport, ingestionContext } from './fixtures/v2Fixtures.mjs';

const identity = { schema: 'BuildIdentityV1', baseCommit: 'a'.repeat(40),
  includedUncommittedLocalChanges: true, sourceSnapshotDigestSha256: 'b'.repeat(64) };
const carrier = { schema: 'MoFaCTSImageSourceObservationV1', state: 'source-matched-unqualified', identity };
const absent = { state: 'unavailable', reason: 'not-provided' };
const malformed = { state: 'unavailable', reason: 'malformed' };

test('receiver identity reuses the existing carrier and preserves dirty snapshot provenance', () => {
  assert.deepEqual(observeEmbeddedBuildIdentity(carrier), { state: 'observed', identity });
  assert.deepEqual(observeEmbeddedBuildIdentity(undefined), absent);
  assert.deepEqual(observeEmbeddedBuildIdentity({ schema: carrier.schema, state: 'unavailable', reason: 'not-requested' }), absent);
  for (const value of [null, {}, { ...carrier, extra: true }, { ...carrier, state: 'qualified' },
    { ...carrier, identity: { ...identity, includedUncommittedLocalChanges: 'true' } },
    { ...carrier, identity: { ...identity, sourceSnapshotDigestSha256: 'unknown' } },
    { schema: carrier.schema, state: 'unavailable', reason: 'not-requested', identity }]) {
    assert.deepEqual(observeEmbeddedBuildIdentity(value), malformed);
  }
});

test('receiver identity reads once under concurrent callers and returns isolated observations', async () => {
  let reads = 0;
  const load = createAuditReceiverIdentityLoader(async () => { reads++; return Buffer.from(JSON.stringify(carrier)); });
  const values = await Promise.all([load(), load(), load()]);
  assert.equal(reads, 1);
  values[0].identity.baseCommit = 'f'.repeat(40);
  assert.deepEqual(await load(), { state: 'observed', identity });
  assert.deepEqual(auditReceiverRevision(await load()), { state: 'observed', value: identity.baseCommit });
});

test('missing/unreadable/malformed identity stays bounded and cached without startup rejection', async () => {
  for (const bytes of [undefined, Buffer.alloc(0), Buffer.alloc(8193), Buffer.from([0xff]), Buffer.from('{'), Buffer.from('{}')]) {
    let reads = 0;
    const load = createAuditReceiverIdentityLoader(async () => { reads++; return bytes; });
    const expected = bytes === undefined ? absent : malformed;
    assert.deepEqual(await load(), expected);
    assert.deepEqual(auditReceiverRevision(await load()), expected);
    assert.equal(reads, 1);
  }
  let attempts = 0;
  const load = createAuditReceiverIdentityLoader(async () => { attempts++; throw new Error('synthetic private detail'); });
  assert.deepEqual(await load(), malformed); assert.deepEqual(await load(), malformed);
  assert.equal(attempts, 1);
});

test('embedded source reader bounds regular files and rejects non-files/oversize/hard links', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-receiver-identity-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'source.json');
  assert.equal(await readEmbeddedSourceBytes(file), undefined);
  await assert.rejects(readEmbeddedSourceBytes(directory));
  await fs.writeFile(file, JSON.stringify(carrier));
  assert.equal((await readEmbeddedSourceBytes(file)).toString(), JSON.stringify(carrier));
  const link = path.join(directory, 'hard.json'); await fs.link(file, link);
  await assert.rejects(readEmbeddedSourceBytes(file)); await fs.unlink(link);
  await fs.writeFile(file, Buffer.alloc(8193)); await assert.rejects(readEmbeddedSourceBytes(file));
  await fs.writeFile(file, ''); await assert.rejects(readEmbeddedSourceBytes(file));
});

test('receiver revision rejects a signed contradictory claim but records missing-proof ERROR reports', async () => {
  const load = createAuditReceiverIdentityLoader(async () => Buffer.from(JSON.stringify(carrier)));
  const receiverRevision = auditReceiverRevision(await load());
  const report = await errorReport();
  const secret = 'synthetic-only-'.repeat(4), timestamp = '1793880120', nonce = 'synthetic-receiver-nonce-0001';
  const args = value => { const body = Buffer.from(canonicalAuditJson(value)); return { body, secret,
    now: new Date(Number(timestamp) * 1000), headers: { timestamp, nonce, signature: signAuditRequestV2(secret, timestamp, nonce, body) },
    receiver: { targetOrigin: ingestionContext.targetOrigin, receiverRevision, receiverImage: absent } }; };
  assert.deepEqual((await authenticateAuditRequestV2(args(report))).report, report);
  report.deployedApplicationRevision = { state: 'observed', value: 'f'.repeat(40) };
  const { digestSha256: _old, ...payload } = report; report.digestSha256 = await auditDigest(payload);
  await assert.rejects(authenticateAuditRequestV2(args(report)));
});

test('Linux embedded source reader rejects symbolic links without following them', { skip: process.platform !== 'linux' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-receiver-symlink-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'source.json');
  const link = path.join(directory, 'linked.json');
  await fs.writeFile(file, JSON.stringify(carrier));
  await fs.symlink(file, link);
  await assert.rejects(readEmbeddedSourceBytes(link));
  assert.equal((await readEmbeddedSourceBytes(file)).toString(), JSON.stringify(carrier));
});
