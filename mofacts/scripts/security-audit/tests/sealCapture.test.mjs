import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { inspectSnapshotTree } from '../qualification/sourceSnapshot.mjs';
import { main as captureMain } from '../qualification/captureBuildSource.mjs';
import { parseMounts, sealCapture, assertCaptureSealed, unsealCapture, sealFailureSummary, summarizeMountState } from '../qualification/sealCapture.mjs';

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
    visibleMountId: async () => undefined,
    assertSealed: async () => {},
    command: async args => {
      calls.push(args);
      if (args[0] === 'mount' && args[1] === '--bind') {
        let propagation = ['shared'];
        if (args[2].endsWith(path.sep + 'test-context')) {
          const parent = entries.find(entry => entry.target === path.dirname(args[2]));
          assert.ok(parent?.options.includes('rw'), 'Create the writable child before protecting its parent');
          assert.deepEqual(parent.propagation, [], 'Detach the parent from propagation peers before creating a child');
          propagation = [];
        }
        entries.push({ target: args[2], options: ['rw'], propagation });
      } else if (args[0] === 'mount' && args[1] === '--make-private') {
        const found = entries.find(entry => entry.target === args[2]);
        assert.ok(found);
        found.propagation = [];
      } else if (args[0] === 'mount') {
        const found = entries.find(entry => entry.target === args[3]);
        assert.ok(found);
        // The privileged boundary must bind both source and target, rather
        // than infer a source from an ambient fstab/mount-table entry.
        assert.deepEqual(args.slice(3), [found.target, found.target]);
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
    [{ mountId: '10', parentId: '1', device: '0:2', root: '/', target: '/tmp/with space', options: ['ro', 'relatime'], propagation: [] }]);
  assert.deepEqual(parseMounts('10 1 0:2 / /tmp rw shared:123 master:456 - ext4 /dev/test rw\n')[0].propagation, ['shared', 'master']);
  assert.throws(() => parseMounts('malformed'));
  assert.throws(() => parseMounts('x'.repeat(1024 * 1024 + 1)));
});

test('mount observations retain visible/hidden parent relationships with no paths, device IDs or kernel IDs', () => {
  const loc = { repo: path.resolve('private-checkout'), root: path.resolve('private-capture'),
    derivative: path.resolve('private-capture', 'test-context') };
  const base = { device: '88:99', root: '/private-backing', options: ['rw'], propagation: ['shared'] };
  const entries = [
    { ...base, root: '/checkout-backing', mountId: '90001', parentId: '1', target: loc.repo },
    { ...base, root: '/capture-backing', mountId: '90002', parentId: '1', target: loc.root, options: ['ro'] },
    { ...base, mountId: '90003', parentId: '90002', target: loc.derivative },
    { ...base, mountId: '90004', parentId: '90003', target: loc.derivative },
  ];
  const result = summarizeMountState(entries, loc, { checkout: '90001', capture: '90002', 'test-copy': '90004' });
  assert.deepEqual(result.visible, { checkout: 1, capture: 2, 'test-copy': 4 });
  assert.equal(result.rows[3].parent, 3);
  assert.equal(result.rows[3].backing, 3);
  assert.equal(result.rows[1].ro, true);
  assert.equal(result.rows[0].shared, true);
  assert.doesNotMatch(JSON.stringify(result), /private|backing\/|9000|88:99/);
  assert.equal(summarizeMountState(Array.from({ length: 20 }, (_, i) => ({ ...base,
    mountId: String(i + 1), target: loc.derivative })), loc).rows.length, 12);
});

test('failure summaries expose only registered operation/error categories, never native arguments or stderr', () => {
  const result = sealFailureSummary({ sealStage: 'bind-checkout', code: 32,
    stderr: 'mount synthetic-private-value: operation not permitted', message: 'synthetic-private-value' });
  assert.match(result, /stage=bind-checkout, code=native-exit-32, reason=operation-not-permitted/);
  assert.doesNotMatch(result, /synthetic-private-value/);
  assert.doesNotMatch(sealFailureSummary({ sealStage: 'synthetic-private-value', code: 'synthetic-private-value',
    stderr: 'synthetic-private-value' }), /synthetic-private-value/);
});

test('mount-layout rejection distinguishes missing protection from incorrect flags without exposing paths', async t => {
  const { workspace, repository } = await fixture(t);
  for (const kind of ['missing-checkout', 'incorrect-mode-capture', 'non-private-checkout']) {
    const model = kernelModel();
    model.dependencies.mounts = async () => {
      const entries = structuredClone(model.entries);
      if (entries.length === 3) {
        if (kind === 'missing-checkout') return entries.filter(entry => entry.target !== repository);
        if (kind === 'non-private-checkout') entries.find(entry => entry.target === repository).propagation = ['shared'];
        else entries.find(entry => entry.target === workspace).options = ['rw'];
      }
      return entries;
    };
    await assert.rejects(sealCapture(workspace, repository, model.dependencies), error => {
      assert.match(sealFailureSummary(error), new RegExp('reason=' + kind));
      assert.ok(!sealFailureSummary(error).includes(workspace));
      assert.ok(!sealFailureSummary(error).includes(repository));
      return true;
    });
    assert.equal(model.entries.length, 0);
  }
});

test('seal retains native bytes/modes and leaves exactly the test derivative writable', async t => {
  const { workspace, repository } = await fixture(t);
  const before = await inspectSnapshotTree(path.join(workspace, 'context'));
  const model = kernelModel();
  assert.equal((await sealCapture(workspace, repository, model.dependencies)).state, 'capture-sealed-unqualified');
  assert.deepEqual(model.entries, [
    { target: repository, options: ['ro'], propagation: [] }, { target: workspace, options: ['ro'], propagation: [] },
    { target: path.join(workspace, 'test-context'), options: ['rw'], propagation: [] },
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
    if (args[2] === 'remount,bind,ro' && args[3] === workspace) throw new Error('Synthetic remount failure');
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
    assert.match(result.stderr, /^Capture seal operation failed \(stage=unseal-cwd, code=unclassified, reason=unspecified\); no qualification was issued\.\n$/);
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

test('Linux CI shared parent does not propagate a second hidden test mount',
  { skip: process.platform !== 'linux' || process.env.CI !== 'true' }, async t => {
    const execute = promisify(execFile);
    const parent = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'mofacts-shared-parent-test-'));
    const originalTemporary = process.env.TMPDIR;
    let parentMounted = false;
    let sharedFixture;
    try {
      await execute('sudo', ['-n', 'mount', '--bind', parent, parent]);
      parentMounted = true;
      await execute('sudo', ['-n', 'mount', '--make-private', parent]);
      await execute('sudo', ['-n', 'mount', '--make-shared', parent]);
      // Change only this test process's explicit temporary-root contract. The
      // fixture mount is isolated from the host's original temporary mount.
      process.env.TMPDIR = parent;
      sharedFixture = await fixture(t);
      await sealCapture(sharedFixture.workspace, sharedFixture.repository);
      await assertCaptureSealed(sharedFixture.workspace, sharedFixture.repository);
      const entries = parseMounts(await fs.readFile('/proc/self/mountinfo', 'utf8'));
      const child = entries.filter(entry => entry.target === path.join(sharedFixture.workspace, 'test-context'));
      assert.equal(child.length, 1);
      assert.deepEqual(child[0].propagation, []);
      await fs.writeFile(path.join(sharedFixture.workspace, 'test-context/output'), 'writable');
    } finally {
      try { if (sharedFixture) await unsealCapture(sharedFixture.workspace, sharedFixture.repository); }
      finally {
        if (originalTemporary === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = originalTemporary;
        if (parentMounted) await execute('sudo', ['-n', 'umount', parent]);
        await fs.rm(parent, { recursive: true, force: true });
      }
    }
  });
