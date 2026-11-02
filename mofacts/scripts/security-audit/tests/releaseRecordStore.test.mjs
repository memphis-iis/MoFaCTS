import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fixture from '../../../common/securityAudit/fixtures/release-record.fixture.json' with { type: 'json' };
import { writeReleaseRecord, readReleaseBytes, parseReleaseBytes, projectReleaseReceipt } from '../qualification/releaseRecordStore.mjs';
import { parseReleaseReceipt, compareReleaseReceipt } from '../qualification/releaseReceipt.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const record = () => ({ ...structuredClone(fixture), imageId: fixture.qualification.runningImage.configDigest,
  acceptance: 'operator-confirmed readiness and participant smoke checks' });
const encoded = value => Buffer.from(JSON.stringify(value));

async function setup(t) {
  const temporary = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, 'mofacts-release-store-test-'));
  await fs.chmod(root, 0o700);
  const file = path.join(root, 'release.json');
  t.after(async () => {
    assert.equal(path.dirname(root), temporary);
    assert.ok(path.basename(root).startsWith('mofacts-release-store-test-'));
    // Only these owned fixtures contain read-only history on Windows.
    const history = file + '.history';
    const children = await fs.readdir(history).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
    for (const child of children) await fs.chmod(path.join(history, child), 0o600);
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, file };
}

test('record replacement preserves exact historical bytes, current fields, and both content-addressed archives', async t => {
  const { file } = await setup(t);
  const { qualification: _qualification, ...historical } = fixture;
  const prior = Buffer.from(JSON.stringify(historical, null, 4) + '\r\n');
  await fs.writeFile(file, prior);
  const result = await writeReleaseRecord(file, encoded(record()));
  const latest = await readReleaseBytes(file);
  assert.deepEqual(parseReleaseBytes(latest), record());
  assert.equal(result.recordDigestSha256, digest(latest));
  assert.equal(result.proof, 'consistent-unqualified');
  for (const bytes of [prior, latest]) {
    const archived = path.join(file + '.history', digest(bytes) + '.json');
    assert.deepEqual(await readReleaseBytes(archived), bytes);
    assert.equal((await fs.stat(archived)).nlink, 1);
    assert.equal((await fs.stat(archived)).mode & 0o222, 0);
  }
  await writeReleaseRecord(file, encoded(record()));
  assert.equal((await fs.readdir(file + '.history')).length, 2);
});

test('incomplete V2 evidence is retained without inventing workstation proof or changing receipt identity', async t => {
  const { file } = await setup(t);
  const prior = encoded(record());
  await fs.writeFile(file, prior);
  const candidate = record();
  candidate.qualification = {
    schema: 'ReleaseQualificationV2', state: 'unqualified',
    buildIdentity: structuredClone(fixture.qualification.buildIdentity),
    evidenceReferences: { sourceAcquisitionDigestSha256: '1'.repeat(64), ciImageObservationDigestSha256: '2'.repeat(64) },
  };
  const result = await writeReleaseRecord(file, encoded(candidate));
  assert.equal(result.proof, 'incomplete-unqualified');
  const current = await readReleaseBytes(file);
  assert.deepEqual(parseReleaseBytes(current), candidate);
  assert.equal(Object.hasOwn(parseReleaseBytes(current).qualification, 'releaseIdentity'), false);
  assert.deepEqual(await fs.readFile(path.join(file + '.history', digest(prior) + '.json')), prior);
  const receipt = projectReleaseReceipt(current);
  assert.equal(receipt.imageId, candidate.imageId);
  assert.equal(receipt.recordDigestSha256, digest(current));
  assert.equal(Object.hasOwn(receipt, 'qualification'), false);
});

test('malformed V2 and mismatched supplied tuples fail before allocating release-store files', async t => {
  const { root, file } = await setup(t);
  for (const mode of ['binding', 'tuple']) {
    const candidate = record();
    const { schema: _schema, buildIdentity, ...releaseIdentity } = candidate.qualification;
    candidate.qualification = {
      schema: 'ReleaseQualificationV2', state: 'unqualified', buildIdentity,
      evidenceReferences: { sourceAcquisitionDigestSha256: '1'.repeat(64) },
    };
    if (mode === 'binding') candidate.qualification.buildIdentity.baseCommit = 'f'.repeat(40);
    else {
      candidate.qualification.releaseIdentity = releaseIdentity;
      candidate.qualification.releaseIdentity.runningImage.configDigest = 'sha256:' + 'f'.repeat(64);
    }
    await assert.rejects(writeReleaseRecord(file, encoded(candidate)));
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('normal unqualified records remain writable and a receipt never infers a missing image ID', async t => {
  const { file } = await setup(t);
  const current = record();
  delete current.qualification;
  assert.equal((await writeReleaseRecord(file, encoded(current))).proof, 'unavailable');
  assert.equal(projectReleaseReceipt(await readReleaseBytes(file)).imageId, current.imageId);
  const { imageId: _imageId, acceptance: _acceptance, ...historical } = current;
  assert.throws(() => projectReleaseReceipt(encoded(historical)), /recorded running image ID/);
});

test('a linked archive directory cannot redirect preservation into another directory', async t => {
  const { root, file } = await setup(t);
  const other = path.join(root, 'outside-history');
  await fs.mkdir(other, { mode: 0o700 });
  await fs.symlink(other, file + '.history', process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(writeReleaseRecord(file, encoded(record())));
  assert.deepEqual(await fs.readdir(other), []);
  // Remove the link before the fixture's fixed history cleanup enumerates it.
  await fs.unlink(file + '.history');
});

test('Linux refuses a writable archive owner boundary', { skip: process.platform === 'win32' }, async t => {
  const { file } = await setup(t);
  await fs.mkdir(file + '.history', { mode: 0o700 });
  await fs.chmod(file + '.history', 0o777);
  await assert.rejects(writeReleaseRecord(file, encoded(record())));
  await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('inconsistent proof and unknown/private fields fail before allocating any store files', async t => {
  const { root, file } = await setup(t);
  for (const candidate of [
    { ...record(), imageId: `sha256:${'f'.repeat(64)}` },
    { ...record(), rawOutput: 'synthetic-private-value' },
  ]) {
    await assert.rejects(writeReleaseRecord(file, encoded(candidate)), error => {
      assert.doesNotMatch(error.message, /synthetic-private-value/); return true;
    });
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('archive collision or changed latest record fails without overwriting evidence', async t => {
  const { file } = await setup(t);
  const prior = encoded(record());
  await fs.writeFile(file, prior);
  await fs.mkdir(file + '.history', { mode: 0o700 });
  const collision = path.join(file + '.history', digest(prior) + '.json');
  await fs.writeFile(collision, 'conflicting evidence');
  await assert.rejects(writeReleaseRecord(file, prior));
  assert.deepEqual(await fs.readFile(file), prior);
  assert.equal(await fs.readFile(collision, 'utf8'), 'conflicting evidence');
  await fs.unlink(collision);
  const other = encoded({ ...record(), deployedAtUtc: '2026-02-01T00:00:00.000Z' });
  await assert.rejects(writeReleaseRecord(file, prior, { checkpoint: async phase => {
    if (phase === 'history-preserved') await fs.writeFile(file, other);
  } }));
  assert.deepEqual(await fs.readFile(file), other);
});

test('failure before atomic replacement keeps old latest; failure after replacement retains both histories', async t => {
  const { file } = await setup(t);
  const prior = encoded({ ...record(), deployedAtUtc: '2025-01-01T00:00:00.000Z' });
  await fs.writeFile(file, prior);
  for (const phase of ['before-replace', 'after-replace']) {
    await assert.rejects(writeReleaseRecord(file, encoded(record()), { checkpoint: async observed => {
      if (phase === observed) throw new Error('Synthetic interruption');
    } }), /Synthetic interruption/);
    const latest = await readReleaseBytes(file);
    if (phase === 'before-replace') assert.deepEqual(latest, prior);
    else assert.deepEqual(parseReleaseBytes(latest), record());
    assert.deepEqual(await readReleaseBytes(path.join(file + '.history', digest(prior) + '.json')), prior);
    await assert.rejects(fs.stat(file + '.lock'), { code: 'ENOENT' });
  }
  await writeReleaseRecord(file, encoded(record()));
});

test('cooperating writers serialize and never take over an existing lock', async t => {
  const { file } = await setup(t);
  let continueWrite;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { continueWrite = resolve; });
  const first = writeReleaseRecord(file, encoded(record()), { checkpoint: async phase => {
    if (phase === 'history-preserved') { entered(); await gate; }
  } });
  await started;
  try { await assert.rejects(writeReleaseRecord(file, encoded(record())), { code: 'EEXIST' }); }
  finally { continueWrite(); }
  await first;
});

test('multi-link records, oversized bytes and invalid UTF-8 cannot become retained evidence', async t => {
  const { root, file } = await setup(t);
  const other = path.join(root, 'other.json');
  await fs.writeFile(other, encoded(record()));
  await fs.link(other, file);
  await assert.rejects(readReleaseBytes(file));
  await fs.unlink(file);
  await assert.rejects(writeReleaseRecord(file, Buffer.alloc(16385)));
  await assert.rejects(writeReleaseRecord(file, Buffer.from([0xff])));
  assert.equal(await fs.readFile(other, 'utf8'), JSON.stringify(record()));
});

test('Linux file symlinks cannot redirect the latest record', { skip: process.platform === 'win32' }, async t => {
  const { root, file } = await setup(t);
  const other = path.join(root, 'other.json');
  await fs.writeFile(other, encoded(record()));
  await fs.symlink(other, file);
  await assert.rejects(writeReleaseRecord(file, encoded(record())));
  assert.equal(await fs.readFile(other, 'utf8'), JSON.stringify(record()));
});

test('receipt projects only bounded identifiers and compares actual config/revision without claiming qualification', () => {
  const bytes = encoded(record());
  const receipt = projectReleaseReceipt(bytes);
  assert.equal(receipt.recordDigestSha256, digest(bytes));
  assert.equal(receipt.deployedAtUtc, fixture.deployedAtUtc);
  assert.equal(Object.hasOwn(receipt, 'acceptance'), false);
  assert.equal(Object.hasOwn(receipt, 'qualification'), false);
  assert.equal(compareReleaseReceipt(receipt, record().imageId, fixture.baseCommit).result, 'MATCH');
  assert.equal(compareReleaseReceipt(receipt, `sha256:${'f'.repeat(64)}`, fixture.baseCommit).result, 'MISMATCH');
  assert.equal(compareReleaseReceipt(receipt, record().imageId, 'f'.repeat(40)).result, 'MISMATCH');
  assert.equal(compareReleaseReceipt(receipt, 'unknown', fixture.baseCommit).state, 'unavailable');
  for (const changed of [{ ...receipt, rawOutput: 'synthetic-private-value' }, { ...receipt, imageId: 'unknown' },
    { ...receipt, deployedAtUtc: '2026-02-30T00:00:00.000Z' }]) assert.throws(() => parseReleaseReceipt(changed));
});

test('standalone host parser bounds stdin and emits no raw rejected values', () => {
  const module = new URL('../qualification/releaseReceipt.mjs', import.meta.url).href;
  const code = `const {runReceiptCli} = await import(${JSON.stringify(module)}); await runReceiptCli(process.argv.slice(1));`;
  const receipt = projectReleaseReceipt(encoded(record()));
  for (const [input, state] of [
    [JSON.stringify(receipt), 'observed'],
    [JSON.stringify({ ...receipt, privateOutput: 'synthetic-private-value' }), 'unavailable'],
    [' '.repeat(8193), 'unavailable'], [Buffer.from([0xff]), 'unavailable'],
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, record().imageId, fixture.baseCommit],
      { input, encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).state, state);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-value/);
    assert.equal(result.stderr, '');
  }
});

test('process death leaves a visible lock and complete previous latest for explicit owner recovery',
  { skip: process.platform === 'win32' }, async t => {
    const { file } = await setup(t);
    const prior = encoded({ ...record(), deployedAtUtc: '2025-01-01T00:00:00.000Z' });
    await fs.writeFile(file, prior);
    const candidate = path.join(path.dirname(file), 'candidate.json');
    await fs.writeFile(candidate, encoded(record()));
    const module = fileURLToPath(new URL('../qualification/releaseRecordStore.mjs', import.meta.url));
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      const {writeReleaseRecord, readReleaseBytes} = await import(process.argv[1]);
      await writeReleaseRecord(process.argv[2], await readReleaseBytes(process.argv[3]), {
        checkpoint: async phase => { if (phase === 'before-replace') {
          process.stdout.write('READY\\n'); await new Promise(() => setInterval(() => {}, 1000));
        } }
      });`, pathToFileURL(module).href, file, candidate], { stdio: ['ignore', 'pipe', 'pipe'] });
    const closed = new Promise(resolve => child.once('close', resolve));
    t.after(() => child.kill('SIGKILL'));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Synthetic writer did not reach checkpoint')), 10000);
      child.once('error', reject);
      child.stdout.once('data', bytes => { clearTimeout(timer); assert.equal(bytes.toString(), 'READY\n'); resolve(); });
    });
    child.kill('SIGKILL'); await closed;
    assert.deepEqual(await readReleaseBytes(file), prior);
    await assert.rejects(writeReleaseRecord(file, encoded(record())), { code: 'EEXIST' });
    const lock = JSON.parse(await fs.readFile(file + '.lock', 'utf8'));
    assert.equal(lock.pid, child.pid);
    assert.match(lock.id, /^[a-f0-9-]{36}$/);
    // Explicit recovery of only this known-dead writer's files, never a scan or
    // automatic lock takeover. Prior/latest bytes were verified above.
    await fs.unlink(path.join(path.dirname(file), '.release.json.' + lock.id + '.tmp'));
    await fs.unlink(file + '.lock');
    await writeReleaseRecord(file, encoded(record()));
    assert.deepEqual(parseReleaseBytes(await readReleaseBytes(file)), record());
  });
