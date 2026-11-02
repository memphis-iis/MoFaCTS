import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectSnapshotTree } from '../qualification/sourceSnapshot.mjs';
import { main as captureMain } from '../qualification/captureBuildSource.mjs';
import { parseMounts, sealCapture, assertCaptureSealed, unsealCapture } from '../qualification/sealCapture.mjs';

async function fixture(t) {
  const temporary = await fs.realpath(os.tmpdir());
  const workspace = await fs.mkdtemp(path.join(temporary, 'mofacts-qualified-build-'));
  const repository = await fs.mkdtemp(path.join(temporary, 'mofacts-seal-test-'));
  t.after(async () => {
    // Tests must finish native unmounting before deleting any fixture tree.
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.rm(repository, { recursive: true, force: true });
  });
  for (const dir of ['context', 'test-context']) await fs.mkdir(path.join(workspace, dir));
  await fs.mkdir(path.join(repository, 'deploy'));
  await fs.writeFile(path.join(repository, 'deploy/docker-compose.yml'), 'fixture compose');
  await fs.writeFile(path.join(workspace, 'context/Dockerfile'), 'fixture recipe');
  await fs.writeFile(path.join(workspace, 'owner.json'), JSON.stringify({ schema: 'MoFaCTSCaptureWorkspaceV1',
    workspace, id: randomUUID() }));
  for (const name of ['capture.json', 'compose.capture.json', 'test-inputs.json']) {
    await fs.writeFile(path.join(workspace, name), '{}');
  }
  return { workspace, repository };
}

function kernelModel() {
  const entries = [];
  const calls = [];
  return { entries, calls, dependencies: {
    mounts: async () => structuredClone(entries),
    assertSealed: async () => {},
    command: async args => {
      calls.push(args);
      if (args[0] === 'mount' && args[1] === '--bind') {
        entries.push({ target: args[2], options: ['rw'] });
      } else if (args[0] === 'mount') {
        const found = entries.find(entry => entry.target === args[3]);
        assert.ok(found);
        found.options = [args[2].split(',').at(-1)];
      } else if (args[0] === 'umount') {
        const index = entries.findIndex(entry => entry.target === args[1]);
        assert.ok(index >= 0);
        entries.splice(index, 1);
      } else assert.fail('Unexpected privileged operation');
    },
  } };
}

test('mount state parser decodes kernel paths and rejects malformed or oversized input', () => {
  assert.deepEqual(parseMounts('10 1 0:2 / /tmp/with\\040space ro,relatime - ext4 /dev/test rw\n'),
    [{ target: '/tmp/with space', options: ['ro', 'relatime'] }]);
  assert.throws(() => parseMounts('malformed'));
  assert.throws(() => parseMounts('x'.repeat(1024 * 1024 + 1)));
});

test('seal retains native bytes/modes and leaves exactly the test derivative writable', async t => {
  const { workspace, repository } = await fixture(t);
  const before = await inspectSnapshotTree(path.join(workspace, 'context'));
  const model = kernelModel();
  assert.equal((await sealCapture(workspace, repository, model.dependencies)).state, 'capture-sealed-unqualified');
  assert.deepEqual(model.entries, [
    { target: repository, options: ['ro'] }, { target: workspace, options: ['ro'] },
    { target: path.join(workspace, 'test-context'), options: ['rw'] },
  ]);
  assert.deepEqual(await inspectSnapshotTree(path.join(workspace, 'context')), before);
  // Workspace cleanup refuses even before touching installed test output.
  await fs.writeFile(path.join(workspace, 'test-context/keep'), 'retained');
  await assert.rejects(captureMain(['cleanup', '--workspace', workspace]), /Release the capture seal/);
  assert.equal(await fs.readFile(path.join(workspace, 'test-context/keep'), 'utf8'), 'retained');
  await unsealCapture(workspace, repository, model.dependencies);
  assert.deepEqual(model.calls.slice(-3), [
    ['umount', path.join(workspace, 'test-context')], ['umount', workspace], ['umount', repository],
  ]);
  assert.equal(model.entries.length, 0);
  assert.equal((await unsealCapture(workspace, repository, model.dependencies)).state, 'capture-seal-absent');
});

test('failed remount releases only mounts this seal created and never leaves a success receipt', async t => {
  const { workspace, repository } = await fixture(t);
  const model = kernelModel();
  const command = model.dependencies.command;
  model.dependencies.command = async args => {
    if (args[2] === 'remount,bind,rw') throw new Error('Synthetic remount failure');
    await command(args);
  };
  await assert.rejects(sealCapture(workspace, repository, model.dependencies), /Synthetic remount/);
  assert.equal(model.entries.length, 0);
  await assert.rejects(fs.stat(path.join(workspace, 'seal.json')), { code: 'ENOENT' });
});

test('always-run unseal can finish partial teardown after an interrupted seal', async t => {
  const { workspace, repository } = await fixture(t);
  const model = kernelModel();
  model.dependencies.assertSealed = async () => { throw new Error('Synthetic probe failure'); };
  const command = model.dependencies.command;
  model.dependencies.command = async args => {
    if (args[0] === 'umount') throw new Error('Synthetic teardown interruption');
    await command(args);
  };
  await assert.rejects(sealCapture(workspace, repository, model.dependencies), /Synthetic teardown/);
  assert.equal(model.entries.length, 3);
  model.dependencies.command = command;
  await unsealCapture(workspace, repository, model.dependencies);
  assert.equal(model.entries.length, 0);
  await assert.rejects(fs.stat(path.join(workspace, 'seal.json')), { code: 'ENOENT' });
});

test('foreign mounts, stale receipts and replaced owner identity fail without unmounting them', async t => {
  const { workspace, repository } = await fixture(t);
  const model = kernelModel();
  model.entries.push({ target: path.join(workspace, 'context'), options: ['ro'] });
  await assert.rejects(sealCapture(workspace, repository, model.dependencies));
  assert.equal(model.calls.length, 0);
  model.entries.length = 0;
  await sealCapture(workspace, repository, model.dependencies);
  await assert.rejects(sealCapture(workspace, repository, model.dependencies), /validation/);
  const receiptPath = path.join(workspace, 'seal.json');
  const original = await fs.readFile(receiptPath, 'utf8');
  await fs.writeFile(receiptPath, JSON.stringify({ ...JSON.parse(original), ownerId: randomUUID() }));
  const count = model.calls.length;
  await assert.rejects(unsealCapture(workspace, repository, model.dependencies));
  assert.equal(model.calls.length, count);
  await fs.writeFile(receiptPath, original);
  model.entries.push({ target: path.join(workspace, 'foreign'), options: ['rw'] });
  await assert.rejects(unsealCapture(workspace, repository, model.dependencies));
  assert.equal(model.calls.length, count);
  model.entries.pop();
  await unsealCapture(workspace, repository, model.dependencies);
});

test('receipt plus simulated ro flags cannot masquerade as a kernel write-protected capture', async t => {
  const { workspace, repository } = await fixture(t);
  const model = kernelModel();
  await sealCapture(workspace, repository, model.dependencies);
  await assert.rejects(assertCaptureSealed(workspace, repository, model.dependencies), /validation/);
  await unsealCapture(workspace, repository, model.dependencies);
});

test('unseal CLI refuses a cwd inside the protected repository before privileged teardown',
  { skip: process.platform !== 'linux' }, async t => {
    const { workspace, repository } = await fixture(t);
    const cli = fileURLToPath(new URL('../qualification/sealCapture.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'unseal', workspace, repository], {
      cwd: repository, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, CI: 'true', GITHUB_WORKSPACE: repository },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Capture seal operation failed; no qualification was issued\.\n$/);
    assert.equal(await fs.readFile(path.join(workspace, 'capture.json'), 'utf8'), '{}');
  });

test('Linux CI seal rejects writes/chmod/replacement while test output stays writable',
  { skip: process.platform !== 'linux' || process.env.CI !== 'true' }, async t => {
    const { workspace, repository } = await fixture(t);
    const candidate = path.join(workspace, 'context');
    const before = await inspectSnapshotTree(candidate);
    try {
      await sealCapture(workspace, repository);
      await assertCaptureSealed(workspace, repository);
      for (const target of [path.join(candidate, 'Dockerfile'), path.join(workspace, 'capture.json'),
        path.join(repository, 'deploy/docker-compose.yml')]) {
        await assert.rejects(fs.writeFile(target, 'replacement'), error => error.code === 'EROFS');
        await assert.rejects(fs.chmod(target, 0o777), error => error.code === 'EROFS');
        await assert.rejects(fs.unlink(target), error => error.code === 'EROFS');
      }
      await assert.rejects(fs.rename(candidate, path.join(workspace, 'replacement')));
      await fs.writeFile(path.join(workspace, 'test-context/output'), 'writable test output');
      assert.equal(await fs.readFile(path.join(workspace, 'test-context/output'), 'utf8'), 'writable test output');
      assert.deepEqual(await inspectSnapshotTree(candidate), before);
    } finally { await unsealCapture(workspace, repository); }
    await fs.writeFile(path.join(candidate, 'Dockerfile'), 'explicitly unsealed');
  });
