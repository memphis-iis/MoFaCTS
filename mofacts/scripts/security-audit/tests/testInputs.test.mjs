import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectTestInputs, TEST_INPUTS } from '../qualification/testInputs.mjs';
import { inspectSnapshotTree, SNAPSHOT_LIMITS } from '../qualification/sourceSnapshot.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-test-inputs-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const candidate = path.join(root, 'candidate');
  const repository = path.join(root, 'repository');
  const destination = path.join(root, 'destination');
  for (const dir of [candidate, repository, destination]) await fs.mkdir(dir);
  for (const [name, type] of TEST_INPUTS) {
    const target = path.join(repository, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (type === 'directory') {
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'test.ts'), 'supplemental fixture');
    } else await fs.writeFile(target, 'supplemental fixture');
  }
  await fs.mkdir(path.join(candidate, 'mofacts/tests'), { recursive: true });
  await fs.writeFile(path.join(candidate, 'mofacts/tests/test.ts'), 'supplemental fixture');
  await fs.writeFile(path.join(candidate, 'Dockerfile'), 'captured recipe');
  await fs.writeFile(path.join(repository, 'settings.json'), 'excluded private fixture');
  return { candidate, repository, destination };
}

test('combines reviewed supplemental inputs without changing build source or claiming qualification', async (t) => {
  const { candidate, repository, destination } = await fixture(t);
  const before = await inspectSnapshotTree(candidate);
  const receipt = await collectTestInputs(candidate, repository, destination);
  assert.equal(receipt.state, 'test-inputs-captured-unqualified');
  assert.equal(receipt.buildLocalTreeDigestSha256, before.digestSha256);
  assert.deepEqual(await inspectSnapshotTree(candidate), before);
  assert.equal(receipt.localTreeDigestSha256, (await inspectSnapshotTree(destination)).digestSha256);
  assert.equal(await fs.readFile(path.join(destination, 'Dockerfile'), 'utf8'), 'captured recipe');
  await assert.rejects(fs.stat(path.join(destination, 'settings.json')), { code: 'ENOENT' });
});

test('rejects a supplemental file that would replace captured build bytes', async (t) => {
  const { candidate, repository, destination } = await fixture(t);
  const before = await inspectSnapshotTree(candidate);
  await fs.writeFile(path.join(repository, 'mofacts/tests/test.ts'), 'replacement');
  await assert.rejects(collectTestInputs(candidate, repository, destination), /snapshot/i);
  assert.deepEqual(await inspectSnapshotTree(candidate), before);
});

test('requires every reviewed input and an empty separate derivative', async (t) => {
  const { candidate, repository, destination } = await fixture(t);
  await assert.rejects(collectTestInputs(candidate, repository, candidate), /snapshot/i);
  await fs.writeFile(path.join(destination, 'previous'), 'stale');
  await assert.rejects(collectTestInputs(candidate, repository, destination), /snapshot/i);
  await fs.unlink(path.join(destination, 'previous'));
  await fs.unlink(path.join(repository, '.gitleaksignore'));
  await assert.rejects(collectTestInputs(candidate, repository, destination), { code: 'ENOENT' });
});

for (const forbidden of ['settings.json', '.env.test', 'node_modules/cache', '.git/config', '.meteor/local/cache']) {
  test(`rejects private/cache input ${forbidden}`, async (t) => {
    const { candidate, repository, destination } = await fixture(t);
    const target = path.join(repository, 'examples', forbidden);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'excluded fixture');
    await assert.rejects(collectTestInputs(candidate, repository, destination), /snapshot/i);
  });
}

for (const [key, value] of [['entries', 2], ['bytes', 8], ['fileBytes', 8], ['pathBytes', 8], ['depth', 1]]) {
  test(`enforces the ${key} acquisition bound`, async (t) => {
    const { candidate, repository, destination } = await fixture(t);
    await assert.rejects(collectTestInputs(candidate, repository, destination,
      { ...SNAPSHOT_LIMITS, [key]: value }), /snapshot/i);
  });
}

test('rejects links in a supplemental ancestor', async (t) => {
  const { candidate, repository, destination } = await fixture(t);
  await fs.rename(path.join(repository, 'deploy'), path.join(repository, 'real-deploy'));
  await fs.symlink(path.join(repository, 'real-deploy'), path.join(repository, 'deploy'),
    process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectTestInputs(candidate, repository, destination), /snapshot/i);
});

test('rejects differing native file modes on Linux', { skip: process.platform === 'win32' }, async (t) => {
  const { candidate, repository, destination } = await fixture(t);
  await fs.chmod(path.join(candidate, 'mofacts/tests/test.ts'), 0o600);
  await fs.chmod(path.join(repository, 'mofacts/tests/test.ts'), 0o644);
  await assert.rejects(collectTestInputs(candidate, repository, destination), /snapshot/i);
});
