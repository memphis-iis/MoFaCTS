import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { dockerImageFixture } from './helpers/dockerImageArchiveFixture.mjs';
import { readDockerArchiveIdentity } from '../qualification/imageArchiveIdentity.mjs';
import { streamDockerImageIdentity } from '../qualification/observeDockerImage.mjs';
import { observeImageCanariesV2 } from '../repository/imageCanariesV2.mjs';

const encode = value => Buffer.from(JSON.stringify(value));
const environment = { PATH: process.env.PATH, NODE_OPTIONS: '' };
const ownerLabel = 'org.mofacts.security-audit.repository-canary.owner';
const canaries = ['SYNTHETIC-PRIVATE-CANARY'];
const good = { state: 'observed', value: { evaluatedCount: 3, findingCount: 0 } };
function fixture(options = {}) {
  const selected = dockerImageFixture('index'), config = dockerImageFixture('classic');
  const other = dockerImageFixture('classic', 'other');
  const platform = dockerImageFixture('manifest').inspection.nativeId;
  const runtimeImage = 'registry.example/mofacts@' + platform;
  const calls = [], identities = [], files = [];
  const id = 'b'.repeat(64);
  let container, removed = false;
  const run = async spec => {
    calls.push(spec); const { args } = spec;
    assert.equal(spec.command, 'docker'); assert.deepEqual(args.slice(0, 2), ['--context', 'default']);
    assert.deepEqual(spec.environment, environment);
    const command = args[2], action = args[3];
    if (command === 'image') {
      const reference = args.at(-1);
      if (reference === runtimeImage) return { exitCode: 0, stdout: encode({ nativeId: selected.inspection.nativeId,
        platform: options.platform || 'linux/amd64', digests: options.digests || [runtimeImage] }) };
      const inspected = reference === selected.inspection.nativeId ? selected : reference === other.configDigest ? other : config;
      return { exitCode: 0, stdout: encode(inspected.inspection) };
    }
    if (action === 'ls') {
      const filter = args[args.indexOf('--filter') + 1];
      if (options.listError && container) throw Error('PRIVATE daemon failure');
      if (!container) return { exitCode: 0, stdout: Buffer.alloc(0) };
      assert.ok(filter === `id=${id}` || filter === `name=^/${container.name.slice(1)}$`);
      return { exitCode: 0, stdout: encode({ id, name: container.name.slice(1) }) };
    }
    if (action === 'create') {
      const name = args[args.indexOf('--name') + 1], owner = args[args.indexOf('--label') + 1].slice(ownerLabel.length + 1);
      const mount = args[args.indexOf('--mount') + 1], scanner = /,source=([^,]+),/.exec(mount)[1];
      files.push(scanner); assert.equal(Number((await fs.stat(scanner)).mode) & 0o777, 0o444);
      const target = '/mofacts-audit/clientBundleCanariesV2.mjs';
      container = { id, name: '/' + name, owner, image: options.conflictingImage ? other.configDigest : config.configDigest,
        config: { Image: runtimeImage, Entrypoint: ['/usr/local/bin/node'], Cmd: [target], User: '65534:65534',
          OpenStdin: true, AttachStdin: true, StdinOnce: true, Tty: false, Env: ['NODE_OPTIONS='], Healthcheck: { Test: ['NONE'] } },
        host: { NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: false, RestartPolicy: { Name: 'no' },
          CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges:true'], PidsLimit: 64,
          Memory: 134217728, MemorySwap: 134217728, NanoCpus: 500000000, LogConfig: { Type: 'none' } },
        mounts: [{ Type: 'bind', Source: scanner, Destination: target, RW: false }], state: { Status: 'created', Running: false } };
      if (options.mutate) options.mutate(container);
      if (options.createFailure) {
        if (options.unknownCreate) container = undefined;
        return { exitCode: -1, failure: 'timeout', stdout: Buffer.alloc(0) };
      }
      return { exitCode: 0, stdout: Buffer.from(id + '\n') };
    }
    if (action === 'inspect') { assert.equal(args.at(-1), id); return { exitCode: 0, stdout: encode(container) }; }
    if (action === 'start') {
      assert.equal(args.at(-1), id); assert.deepEqual(JSON.parse(spec.input), canaries);
      assert.equal(spec.timeoutMs, 300000);
      if (options.startFailure) {
        container.state = { Status: 'running', Running: true, ExitCode: 0, OOMKilled: false, Error: '' };
        return { exitCode: -1, failure: 'timeout', stdout: Buffer.from('PRIVATE partial') };
      }
      if (options.changeScanner) await fs.appendFile(files[0], '\n// unexpected source mutation\n');
      if (options.replaceWorkspace) {
        const workspace = path.dirname(files[0]);
        await fs.rename(workspace, workspace + '.moved'); await fs.mkdir(workspace);
        await fs.writeFile(path.join(workspace, 'replacement'), 'synthetic replacement must remain');
      }
      container.state = { Status: options.running ? 'running' : 'exited', Running: !!options.running,
        ExitCode: options.oom ? 137 : 0, OOMKilled: !!options.oom, Error: '' };
      return { exitCode: 0, stdout: options.raw || encode(options.output || good) };
    }
    assert.equal(action, 'rm'); assert.equal(args.at(-1), id); assert.ok(args.includes('--volumes'));
    if (options.removeError) throw Error('PRIVATE removal failure');
    removed = true; if (!options.remaining) container = undefined;
    return { exitCode: 0, stdout: Buffer.from(id + '\n') };
  };
  const archive = async inspection => {
    identities.push(inspection.nativeId);
    const target = inspection.nativeId === selected.inspection.nativeId ? selected
      : inspection.nativeId === other.configDigest ? other : config;
    return readDockerArchiveIdentity(Readable.from([target.archive()]), inspection);
  };
  const input = { runtimeImage, canaries, environment };
  return { input, calls, files, identities, run, archive, removed: () => removed,
    observe: () => observeImageCanariesV2(input, { run, archive }) };
}

test('V2 image bridge verifies classic/containerd graph identity, restrictions and cleanup before accepting counts', async () => {
  const f = fixture(); assert.deepEqual(await f.observe(), good);
  assert.equal(f.identities.length, 2); assert.equal(f.removed(), true);
  const create = f.calls.find(row => row.args[3] === 'create');
  for (const [flag, value] of [['--pull', 'never'], ['--network', 'none'], ['--platform', 'linux/amd64'], ['--user', '65534:65534'],
    ['--cap-drop', 'ALL'], ['--memory', '128m'], ['--memory-swap', '128m'], ['--cpus', '0.5'],
    ['--pids-limit', '64'], ['--log-driver', 'none'], ['--env', 'NODE_OPTIONS=']]) assert.equal(create.args[create.args.indexOf(flag) + 1], value);
  for (const flag of ['--read-only', '--no-healthcheck', '--interactive']) assert.ok(create.args.includes(flag));
  const transmitted = f.calls.filter(row => row.input !== undefined);
  assert.equal(transmitted.length, 1); assert.equal(transmitted[0].args[3], 'start');
  assert.equal(JSON.stringify(f.calls.map(row => row.args)).includes(canaries[0]), false);
  assert.ok(f.calls.findIndex(row => row.args[3] === 'inspect') < f.calls.findIndex(row => row.args[3] === 'start'));
  for (const file of f.files) await assert.rejects(fs.stat(file), { code: 'ENOENT' });
});

test('V2 image bridge preserves positive canary findings and rejects false-empty or malformed count protocols', async () => {
  const positive = { state: 'observed', value: { evaluatedCount: 3, findingCount: 1 } };
  assert.deepEqual(await fixture({ output: positive }).observe(), positive);
  for (const output of [{ state: 'observed', value: { evaluatedCount: 0, findingCount: 0 } },
    { state: 'observed', value: { evaluatedCount: 2, findingCount: 3 } },
    { state: 'observed', value: { evaluatedCount: 3, findingCount: 0, PRIVATE: 'hidden' } }]) {
    const f = fixture({ output }), result = await f.observe();
    assert.equal(result.state, 'unavailable'); assert.equal(f.removed(), true); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  const duplicate = fixture({ raw: Buffer.from('{"state":"observed","value":{},"value":{"evaluatedCount":3,"findingCount":0}}') });
  assert.equal((await duplicate.observe()).state, 'unavailable');
});

test('V2 image bridge refuses weakened isolation before transferring stdin or executing code', async () => {
  for (const mutate of [value => { value.host.NetworkMode = 'host'; }, value => { value.host.ReadonlyRootfs = false; },
    value => { value.host.Memory = 0; }, value => { value.host.CapDrop = []; }, value => { value.host.Privileged = true; },
    value => { value.mounts[0].RW = true; }, value => { value.config.Env = ['NODE_OPTIONS=--require=PRIVATE']; },
    value => { value.config.Healthcheck.Test = ['CMD', 'PRIVATE']; }, value => { value.config.StdinOnce = false; }]) {
    const f = fixture({ mutate }); assert.equal((await f.observe()).state, 'unavailable');
    assert.equal(f.calls.some(row => row.input !== undefined), false); assert.equal(f.removed(), true);
  }
});

test('V2 image bridge refuses unproven selected-image coordinates and a conflicting container config graph', async () => {
  for (const options of [{ platform: 'linux/arm64' }, { digests: [] }, { conflictingImage: true }]) {
    const f = fixture(options); assert.equal((await f.observe()).reason, 'identity-conflict');
    assert.equal(f.calls.some(row => row.input !== undefined), false);
  }
  const f = fixture();
  assert.equal((await observeImageCanariesV2({ ...f.input, runtimeImage: 'mutable:tag' }, { run: f.run, archive: f.archive })).reason, 'identity-unavailable');
  assert.equal(f.calls.length, 0);
});

test('V2 image bridge cleans daemon-side containers on attach timeout and never accepts running/OOM/mutated-source results', async () => {
  const timed = fixture({ startFailure: true }); assert.equal((await timed.observe()).reason, 'timeout'); assert.equal(timed.removed(), true);
  for (const options of [{ running: true }, { oom: true }, { changeScanner: true }]) {
    const f = fixture(options); assert.equal((await f.observe()).state, 'unavailable'); assert.equal(f.removed(), true);
  }
});

test('V2 image bridge recovers an ambiguously created owned container but reports unfinished create uncertainty', async () => {
  const known = fixture({ createFailure: true }); assert.equal((await known.observe()).state, 'unavailable'); assert.equal(known.removed(), true);
  const unknown = fixture({ createFailure: true, unknownCreate: true });
  await assert.rejects(unknown.observe(), error => error.code === 'AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE');
  assert.equal(unknown.removed(), false);
});

test('V2 image bridge never removes foreign ownership and cleanup uncertainty blocks even a positive result', async () => {
  for (const options of [{ mutate: value => { value.owner = 'foreign'; } }, { listError: true }, { removeError: true }, { remaining: true }]) {
    const f = fixture(options);
    await assert.rejects(f.observe(), error => {
      assert.equal(error.code, 'AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE');
      assert.match(error.probe.name, /^mofacts-repository-canary-/); assert.equal(error.message.includes('PRIVATE'), false); return true;
    });
    if (options.mutate || options.listError) assert.equal(f.removed(), false);
    for (const file of f.files) await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  }
});

test('V2 image bridge rejects missing canaries, unsafe environments and invalid injected dependencies without substitution', async () => {
  const f = fixture();
  assert.equal((await observeImageCanariesV2({ ...f.input, canaries: [] }, { run: f.run, archive: f.archive })).reason, 'configuration');
  await assert.rejects(observeImageCanariesV2({ ...f.input, environment: { ...environment, AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' } },
    { run: f.run, archive: f.archive }), /Invalid repository command configuration/);
  await assert.rejects(observeImageCanariesV2(f.input, { run: null, archive: f.archive }), /inspection incomplete/);
  assert.equal(f.calls.length, 0);
});

test('V2 image bridge reports changed workspace ownership and preserves the replacement for explicit recovery', async t => {
  const f = fixture({ replaceWorkspace: true });
  t.after(async () => {
    for (const file of f.files) for (const directory of [path.dirname(file), path.dirname(file) + '.moved']) {
      assert.match(path.basename(directory), /^mofacts-image-canary-v2-/);
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  await assert.rejects(f.observe(), error => {
    assert.equal(error.code, 'AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE');
    assert.equal(error.workspace, path.dirname(f.files[0])); return true;
  });
  assert.equal(f.removed(), true);
  assert.equal(await fs.readFile(path.join(path.dirname(f.files[0]), 'replacement'), 'utf8'), 'synthetic replacement must remain');
});

test('shared image archive streaming accepts an explicit narrow environment without changing its identity interpretation', async () => {
  const f = dockerImageFixture('classic'); let launched;
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const spawn = (command, args, options) => {
    launched = { command, args, options };
    queueMicrotask(() => { child.stdout.end(f.archive()); child.stderr.end(); child.emit('close', 0); });
    return child;
  };
  assert.deepEqual(await streamDockerImageIdentity(f.inspection, environment, spawn), { configDigest: f.configDigest, platform: 'linux/amd64' });
  assert.deepEqual(launched.options.env, environment);
  assert.deepEqual(launched.args, ['--context', 'default', 'image', 'save', f.inspection.nativeId]);
});
