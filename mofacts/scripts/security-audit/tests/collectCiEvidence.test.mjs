import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ciEvidenceFixture } from './helpers/ciEvidenceFixture.mjs';
import { collectCiEvidence, evidenceCommand, readCiFile } from '../qualification/collectCiEvidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, change = () => {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-ci-acquisition-test-'));
  t.after(async () => {
    // Only this freshly allocated fixture root is eligible for recursive cleanup.
    if (path.dirname(root) !== await fs.realpath(os.tmpdir()) || !path.basename(root).startsWith('mofacts-ci-acquisition-test-')) assert.fail('foreign fixture');
    async function writable(directory) {
      await fs.chmod(directory, 0o700);
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink()) await writable(file);
        else if (entry.isFile()) await fs.chmod(file, 0o600);
      }
    }
    await writable(root);
    await fs.rm(root, { recursive: true });
  });
  const input = ciEvidenceFixture();
  const testAppRoot = path.join(root, 'app');
  for (const directory of ['server', 'common', 'client', 'tests']) await fs.mkdir(path.join(testAppRoot, directory), { recursive: true });
  for (const file of [...input.expectedModules.server, ...input.expectedModules.client]) await fs.writeFile(path.join(testAppRoot, file), '');
  const expectedSourceFile = path.join(root, 'expected.json');
  await fs.writeFile(expectedSourceFile, JSON.stringify(input.expectedObservation));
  const outputDirectory = path.join(root, 'output');
  await fs.mkdir(outputDirectory);
  const archive = Buffer.from('synthetic archive; decoder is injected');
  input.archiveSizeBytes = input.artifact.size_in_bytes = archive.length;
  input.archiveDigestSha256 = hash(archive);
  input.artifact.digest = `sha256:${hash(archive)}`;
  input.artifact.expires_at = '2030-01-01T00:00:00Z';
  const options = { ciRunId: '101', securityRunId: '102', expectedSourceFile,
    testAppRoot, outputDirectory, powershell: 'synthetic-powershell' };
  const calls = [];
  let finalArtifact = false;
  const command = async (executable, args) => {
    calls.push({ executable, args });
    if (executable === 'synthetic-powershell') {
      const target = args[args.indexOf('-OutputDirectory') + 1];
      for (const [name, bytes] of Object.entries(input.files)) await fs.writeFile(path.join(target, name), bytes);
      return Buffer.from(JSON.stringify({ state: 'ci-evidence-archive-read', files: 3, archiveDigestSha256: hash(archive) }));
    }
    assert.equal(executable, 'gh');
    assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
    const resource = args.at(-1).replace('repos/memphis-iis/MoFaCTS/', '');
    if (resource.endsWith('/zip')) return archive;
    let result;
    if (resource === 'actions/workflows/ci.yml') result = input.ciWorkflow;
    else if (resource === 'actions/workflows/security.yml') result = input.securityWorkflow;
    else if (resource === 'actions/runs/101') result = input.ciRun;
    else if (resource === 'actions/runs/102') result = input.securityRun;
    else if (resource.startsWith('actions/runs/101/attempts/')) result = input.ciJobs;
    else if (resource.startsWith('actions/runs/102/attempts/')) result = input.securityJobs;
    else if (resource.startsWith('actions/runs/101/artifacts?')) result = { total_count: 1, artifacts: [input.artifact] };
    else if (resource === 'actions/artifacts/200') { finalArtifact = true; result = input.artifact; }
    else assert.fail('unexpected resource');
    return Buffer.from(JSON.stringify(result));
  };
  const dependencies = { environment: {}, now: () => Date.parse('2026-11-02T00:00:00Z'), command: async (...args) => {
    const result = await command(...args);
    return change({ args, input, result, finalArtifact }) || result;
  } };
  return { options, dependencies, calls, input, root };
}

test('GET-only acquisition preserves exact evidence and reuses only an identical read-only record', async t => {
  const { options, dependencies, calls, input } = await fixture(t);
  const first = await collectCiEvidence(options, dependencies);
  assert.equal(first.state, 'acquired-unqualified');
  assert.equal(first.qualification, 'unqualified');
  const record = await readCiFile(path.join(first.directory, 'acquisition.json'), 16384);
  assert.equal(first.digestSha256, hash(record));
  assert.equal(JSON.parse(record).ci.runId, '101');
  for (const [name, bytes] of Object.entries(input.files)) assert.deepEqual(await fs.readFile(path.join(first.directory, name)), bytes);
  assert.ok(calls.filter(call => call.executable === 'gh').every(call => call.args[0] === 'api' && !call.args.includes('--method')));
  assert.deepEqual(await collectCiEvidence(options, dependencies), first);
  assert.deepEqual(await fs.readdir(options.outputDirectory), [first.digestSha256]);
});

test('rerun/expiry substitution after archive download leaves no accepted output', async t => {
  const { options, dependencies } = await fixture(t, ({ args, result, finalArtifact }) => {
    if (finalArtifact && args[0] === 'gh') return Buffer.from(JSON.stringify({ ...JSON.parse(result), expired: true }));
  });
  await assert.rejects(collectCiEvidence(options, dependencies));
  assert.deepEqual(await fs.readdir(options.outputDirectory), []);
});

test('a later CI attempt or an elapsed timestamp cannot retain the earlier success', async t => {
  for (const mode of ['attempt', 'timestamp']) {
    let observedRuns = 0;
    const { options, dependencies } = await fixture(t, ({ args, result, finalArtifact }) => {
      if (mode === 'timestamp' && finalArtifact && args[1].at(-1) === 'repos/memphis-iis/MoFaCTS/actions/artifacts/200') {
        return Buffer.from(JSON.stringify({ ...JSON.parse(result), expires_at: '2000-01-01T00:00:00Z' }));
      }
      if (mode === 'attempt' && args[0] === 'gh' && args[1].at(-1) === 'repos/memphis-iis/MoFaCTS/actions/runs/101') {
        if (++observedRuns === 2) return Buffer.from(JSON.stringify({ ...JSON.parse(result), run_attempt: 2 }));
      }
    });
    await assert.rejects(collectCiEvidence(options, dependencies));
    assert.deepEqual(await fs.readdir(options.outputDirectory), []);
  }
});

test('stored-login contract rejects token overrides before any remote call', async t => {
  const { options, dependencies, calls } = await fixture(t);
  await assert.rejects(collectCiEvidence(options, { ...dependencies, environment: { GH_TOKEN: 'private canary' } }),
    /Token environment overrides/);
  assert.equal(calls.length, 0);
});

test('Linux refuses a group/world-writable output owner boundary before acquisition', {
  skip: process.platform === 'win32',
}, async t => {
  const { options, dependencies, calls } = await fixture(t);
  await fs.chmod(options.outputDirectory, 0o777);
  await assert.rejects(collectCiEvidence(options, dependencies));
  assert.equal(calls.length, 0);
});

test('wrong expected source, unexpected files and changed native decoder digest fail closed', async t => {
  for (const mode of ['source', 'file', 'digest']) {
    const { options, dependencies } = await fixture(t, ({ args }) => {
      if (args[0] === 'synthetic-powershell' && mode === 'digest') return Buffer.from(JSON.stringify({
        state: 'ci-evidence-archive-read', files: 3, archiveDigestSha256: '0'.repeat(64),
      }));
    });
    if (mode === 'source') {
      const observation = JSON.parse(await fs.readFile(options.expectedSourceFile));
      observation.identity.sourceSnapshotDigestSha256 = '0'.repeat(64);
      await fs.writeFile(options.expectedSourceFile, JSON.stringify(observation));
    }
    if (mode === 'file') {
      const original = dependencies.command;
      dependencies.command = async (...args) => {
        const result = await original(...args);
        if (args[0] === 'synthetic-powershell') await fs.writeFile(path.join(args[1][args[1].indexOf('-OutputDirectory') + 1], 'extra.json'), '{}');
        return result;
      };
    }
    await assert.rejects(collectCiEvidence(options, dependencies));
    assert.deepEqual(await fs.readdir(options.outputDirectory), []);
  }
});

test('preserved-record collision cannot overwrite or clean unrelated existing bytes', async t => {
  const { options, dependencies } = await fixture(t);
  const first = await collectCiEvidence(options, dependencies);
  const archive = path.join(first.directory, 'artifact.zip');
  await fs.chmod(archive, 0o600);
  await fs.writeFile(archive, 'preserve this changed content');
  await fs.chmod(archive, 0o400);
  await assert.rejects(collectCiEvidence(options, dependencies));
  assert.equal(await fs.readFile(archive, 'utf8'), 'preserve this changed content');
  assert.deepEqual(await fs.readdir(options.outputDirectory), [first.digestSha256]);
});

test('bounded native runner rejects output overflow, errors and missing executable without raw stderr', async () => {
  assert.equal((await evidenceCommand(process.execPath, ['-e', 'process.stdout.write("ok")'], 10)).toString(), 'ok');
  await assert.rejects(evidenceCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], 10), /CI evidence command failed/);
  await assert.rejects(evidenceCommand(process.execPath, ['-e', 'process.stderr.write("private canary");process.exit(1)'], 10),
    error => error.message === 'CI evidence command failed');
  await assert.rejects(evidenceCommand('mofacts-nonexistent-executable', [], 10), /CI evidence command failed/);
});

test('cancellation waits for child close before permitting caller cleanup', {
  skip: process.platform === 'win32', timeout: 5000,
}, async t => {
  const { root } = await fixture(t);
  const marker = path.join(root, 'child-closed');
  const code = `const fs=require('node:fs');
    process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(process.argv[1],'closed');process.exit(0)},30));
    process.stdout.write('overflow'.repeat(20)); setInterval(()=>{},1000);`;
  await assert.rejects(evidenceCommand(process.execPath, ['-e', code, marker], 10), /CI evidence command failed/);
  assert.equal(await fs.readFile(marker, 'utf8'), 'closed');
});
