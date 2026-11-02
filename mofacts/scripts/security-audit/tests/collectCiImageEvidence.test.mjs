import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ciEvidenceFixture } from './helpers/ciEvidenceFixture.mjs';
import { composeCiEvidence, CI_EVIDENCE_FILES } from '../qualification/ciEvidence.mjs';
import { collectCiImageEvidence, composeCiImageEvidence, CI_IMAGE_EVIDENCE_FILE } from '../qualification/collectCiImageEvidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));

test('image consumer entry matches the exact artifact file published by the canonical CI workflow', async () => {
  const workflow = await fs.readFile(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const artifact = workflow.match(/- name: Retain separate CI image observation\r?\n([\s\S]*?)(?=\r?\n {6}- name:)/);
  assert.ok(artifact, 'canonical image artifact publication must exist');
  const publishedPath = artifact[1].match(/^\s+path: \$\{\{ runner\.temp \}\}\/([^\r\n]+)$/m);
  assert.ok(publishedPath, 'image artifact must publish one explicit regular filename');
  assert.equal(CI_IMAGE_EVIDENCE_FILE, publishedPath[1]);
});

function bindingFixture() {
  const sourceInput = ciEvidenceFixture();
  const sourceArchive = Buffer.from('synthetic source archive; native decoder injected');
  sourceInput.archiveDigestSha256 = hash(sourceArchive);
  sourceInput.archiveSizeBytes = sourceInput.artifact.size_in_bytes = sourceArchive.length;
  sourceInput.artifact.digest = `sha256:${hash(sourceArchive)}`;
  sourceInput.artifact.expires_at = '2030-01-01T00:00:00Z';
  const archiveBytes = Buffer.from('synthetic image archive; native decoder injected');
  const imageArtifact = { ...structuredClone(sourceInput.artifact), id: 201,
    name: 'image-observation-101-1', size_in_bytes: archiveBytes.length, digest: `sha256:${hash(archiveBytes)}` };
  const observation = { schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
    source: sourceInput.expectedObservation.identity,
    image: { configDigest: `sha256:${'c'.repeat(64)}`, platform: 'linux/amd64' },
    sourceEvidenceDigestSha256: hash(sourceInput.files[CI_EVIDENCE_FILES[2]]),
    ci: { repository: 'memphis-iis/MoFaCTS', commit: 'a'.repeat(40), runId: '101', runAttempt: '1' } };
  const input = { sourceInput, sourceAcquisitionBytes: Buffer.from(`${JSON.stringify(composeCiEvidence(sourceInput))}\n`),
    imageArtifact, archiveBytes, imageObservationBytes: bytes(observation) };
  return { input, sourceArchive, observation };
}

test('pure binding retains sanitized references to exact source and image bytes, always unqualified', () => {
  const { input } = bindingFixture();
  const result = composeCiImageEvidence(input);
  assert.equal(result.schema, 'CiImageEvidenceAcquisitionV1');
  assert.equal(result.state, 'acquired-unqualified');
  assert.equal(result.qualification, 'unqualified');
  assert.equal(result.sourceAcquisitionDigestSha256, hash(input.sourceAcquisitionBytes));
  assert.equal(result.artifact.files[0].digestSha256, hash(input.imageObservationBytes));
  assert.equal(result.artifact.files[0].name, CI_IMAGE_EVIDENCE_FILE);
  assert.equal(result.artifact.id, '201');
  assert.doesNotMatch(JSON.stringify(result), /sensitive|ignored_|token|password/);
});

test('binding rejects wrong image provenance, identity, source evidence, private fields and duplicate keys', () => {
  const mutations = [
    input => { input.imageArtifact.workflow_run.id++; },
    input => { input.imageArtifact.workflow_run.head_sha = 'f'.repeat(40); },
    input => { input.imageArtifact.workflow_run.repository_id++; },
    input => { input.imageArtifact.workflow_run.head_repository_id++; },
    input => { input.imageArtifact.workflow_run.head_branch = 'other'; },
    input => { input.imageArtifact.name = 'image-observation-101-2'; },
    input => { input.imageArtifact.id = 200; },
    input => { input.imageArtifact.expired = true; },
    input => { input.imageArtifact.size_in_bytes++; },
    input => { input.imageArtifact.digest = `sha256:${'0'.repeat(64)}`; },
    input => { input.archiveBytes = Buffer.alloc(65537); },
    input => { input.imageObservationBytes = Buffer.alloc(16385); },
    input => { input.sourceAcquisitionBytes = bytes({ ...JSON.parse(input.sourceAcquisitionBytes), privateKey: 'private canary' }); },
    input => { input.sourceInput.securityRun.conclusion = 'failure'; },
    input => { input.sourceInput.ciRun.run_attempt = 2; },
    input => { input.imageObservationBytes = bytes({ ...JSON.parse(input.imageObservationBytes), privateKey: 'private canary' }); },
    input => { const value = JSON.parse(input.imageObservationBytes); value.ci.runId = '102'; input.imageObservationBytes = bytes(value); },
    input => { const value = JSON.parse(input.imageObservationBytes); value.ci.runAttempt = '2'; input.imageObservationBytes = bytes(value); },
    input => { const value = JSON.parse(input.imageObservationBytes); value.source.sourceSnapshotDigestSha256 = '0'.repeat(64); input.imageObservationBytes = bytes(value); },
    input => { const value = JSON.parse(input.imageObservationBytes); value.sourceEvidenceDigestSha256 = '0'.repeat(64); input.imageObservationBytes = bytes(value); },
    input => { const value = JSON.parse(input.imageObservationBytes); value.image.platform = 'linux/arm64'; input.imageObservationBytes = bytes(value); },
    input => { input.imageObservationBytes = Buffer.from(input.imageObservationBytes.toString().replace('{', '{"privateKey":"private canary","privateKey":"discarded",')); },
  ];
  for (const change of mutations) {
    const { input } = bindingFixture();
    change(input);
    assert.throws(() => composeCiImageEvidence(input), { message: 'CI image evidence acquisition failed; no qualification was issued.' });
  }
});

async function fixture(t, change = () => {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-ci-image-test-'));
  t.after(async () => {
    if (path.dirname(root) !== await fs.realpath(os.tmpdir()) || !path.basename(root).startsWith('mofacts-ci-image-test-')) assert.fail('foreign fixture');
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
  const { input, sourceArchive } = bindingFixture();
  const testAppRoot = path.join(root, 'app');
  for (const directory of ['server', 'common', 'client', 'tests']) await fs.mkdir(path.join(testAppRoot, directory), { recursive: true });
  for (const file of [...input.sourceInput.expectedModules.server, ...input.sourceInput.expectedModules.client]) await fs.writeFile(path.join(testAppRoot, file), '');
  const expectedSourceFile = path.join(root, 'expected.json');
  await fs.writeFile(expectedSourceFile, JSON.stringify(input.sourceInput.expectedObservation));
  const outputDirectory = path.join(root, 'output');
  await fs.mkdir(outputDirectory, { mode: 0o700 });
  const options = { ciRunId: '101', securityRunId: '102', expectedSourceFile,
    testAppRoot, outputDirectory, powershell: 'synthetic-powershell' };
  const calls = [];
  let imagePhase = false;
  let finalImage = false;
  const dependencies = { environment: {}, now: () => Date.parse('2026-11-02T00:00:00Z'),
    command: async (executable, args, maximum) => {
      calls.push({ executable, args, maximum });
      let result;
      if (executable === 'synthetic-powershell') {
        const target = args[args.indexOf('-OutputDirectory') + 1];
        const image = args.includes('-Profile') && args[args.indexOf('-Profile') + 1] === 'image';
        if (image) await fs.writeFile(path.join(target, CI_IMAGE_EVIDENCE_FILE), input.imageObservationBytes);
        else for (const [name, value] of Object.entries(input.sourceInput.files)) await fs.writeFile(path.join(target, name), value);
        result = bytes({ state: 'ci-evidence-archive-read', files: image ? 1 : 3,
          archiveDigestSha256: hash(image ? input.archiveBytes : sourceArchive) });
      } else {
        assert.equal(executable, 'gh');
        assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
        const resource = args.at(-1).replace('repos/memphis-iis/MoFaCTS/', '');
        const source = input.sourceInput;
        if (resource === 'actions/artifacts/200/zip') result = sourceArchive;
        else if (resource === 'actions/artifacts/201/zip') result = input.archiveBytes;
        else {
          let value;
          if (resource === 'actions/workflows/ci.yml') value = source.ciWorkflow;
          else if (resource === 'actions/workflows/security.yml') value = source.securityWorkflow;
          else if (resource === 'actions/runs/101') value = source.ciRun;
          else if (resource === 'actions/runs/102') value = source.securityRun;
          else if (resource.startsWith('actions/runs/101/attempts/')) value = source.ciJobs;
          else if (resource.startsWith('actions/runs/102/attempts/')) value = source.securityJobs;
          else if (resource.includes('/artifacts?name=source-observation')) value = { total_count: 1, artifacts: [source.artifact] };
          else if (resource.includes('/artifacts?name=image-observation')) {
            imagePhase = true;
            value = { total_count: 1, artifacts: [input.imageArtifact] };
          } else if (resource === 'actions/artifacts/200') value = source.artifact;
          else if (resource === 'actions/artifacts/201') { finalImage = true; value = input.imageArtifact; }
          else assert.fail(`unexpected synthetic resource ${resource}`);
          result = bytes(value);
        }
      }
      return await change({ executable, args, result, input, imagePhase, finalImage }) || result;
    } };
  return { options, dependencies, calls, input, root };
}

test('image acquisition preserves independent immutable source/image bundles and repeats without overwriting', async t => {
  const { options, dependencies, calls } = await fixture(t);
  const first = await collectCiImageEvidence(options, dependencies);
  assert.equal(first.state, 'acquired-unqualified');
  assert.equal(first.qualification, 'unqualified');
  assert.equal(first.digestSha256, hash(await fs.readFile(path.join(first.directory, 'acquisition.json'))));
  assert.equal(first.ciImageObservationDigestSha256, hash(await fs.readFile(path.join(first.directory, CI_IMAGE_EVIDENCE_FILE))));
  assert.notEqual(first.sourceAcquisitionDigestSha256, first.digestSha256);
  assert.deepEqual((await fs.readdir(options.outputDirectory)).sort(), [first.digestSha256, first.sourceAcquisitionDigestSha256].sort());
  const sourceDirectory = path.join(options.outputDirectory, first.sourceAcquisitionDigestSha256);
  assert.equal((await fs.readdir(sourceDirectory)).length, 5);
  assert.deepEqual(await collectCiImageEvidence(options, dependencies), first);
  assert.ok(calls.filter(call => call.executable === 'gh').every(call => !call.args.includes('--method')));
  assert.equal(calls.find(call => call.args.at(-1).endsWith('/201/zip')).maximum, 65536);
  assert.ok(calls.some(call => call.executable === 'synthetic-powershell' && call.args.includes('image')));
});

test('image binding/native decode failures retain accepted source evidence only and clean their own temporary output', async t => {
  for (const mode of ['digest', 'file', 'alias', 'source', 'ci', 'native']) {
    const { options, dependencies } = await fixture(t, async ({ executable, args, result, input }) => {
      if (mode === 'digest' && executable === 'gh' && args.at(-1).includes('name=image-observation')) {
        const value = JSON.parse(result); value.artifacts[0].digest = `sha256:${'0'.repeat(64)}`; return bytes(value);
      }
      if (executable === 'synthetic-powershell' && args.includes('image')) {
        const target = args[args.indexOf('-OutputDirectory') + 1];
        if (mode === 'native') return bytes({ state: 'ci-evidence-archive-read', files: 3, archiveDigestSha256: hash(input.archiveBytes) });
        if (mode === 'file') await fs.writeFile(path.join(target, 'extra.json'), '{}');
        if (mode === 'alias') await fs.rename(path.join(target, CI_IMAGE_EVIDENCE_FILE), path.join(target, 'image-observation.json'));
        if (mode === 'source' || mode === 'ci') {
          const value = JSON.parse(input.imageObservationBytes);
          if (mode === 'source') value.sourceEvidenceDigestSha256 = '0'.repeat(64);
          else value.ci.runAttempt = '2';
          await fs.writeFile(path.join(target, CI_IMAGE_EVIDENCE_FILE), bytes(value));
        }
      }
    });
    await assert.rejects(collectCiImageEvidence(options, dependencies), /CI image evidence acquisition failed/);
    const entries = await fs.readdir(options.outputDirectory);
    assert.equal(entries.length, 1);
    assert.equal(JSON.parse(await fs.readFile(path.join(options.outputDirectory, entries[0], 'acquisition.json'))).schema, 'CiEvidenceAcquisitionV1');
  }
});

test('final image or source metadata changes and expired timestamps fail before image publication', async t => {
  for (const mode of ['image-id', 'expiry', 'ci-attempt', 'security', 'source-expiry']) {
    const { options, dependencies } = await fixture(t, ({ executable, args, result, finalImage }) => {
      if (executable !== 'gh' || !finalImage || args.at(-1).endsWith('/zip')) return;
      const resource = args.at(-1);
      const value = JSON.parse(result);
      if (mode === 'image-id' && resource.endsWith('artifacts/201')) value.id++;
      else if (mode === 'expiry' && resource.endsWith('artifacts/201')) value.expires_at = '2000-01-01T00:00:00Z';
      else if (mode === 'ci-attempt' && resource.endsWith('runs/101')) value.run_attempt++;
      else if (mode === 'security' && resource.endsWith('runs/102')) value.conclusion = 'failure';
      else if (mode === 'source-expiry' && resource.endsWith('artifacts/200')) value.expired = true;
      return bytes(value);
    });
    await assert.rejects(collectCiImageEvidence(options, dependencies));
    assert.equal((await fs.readdir(options.outputDirectory)).length, 1);
  }
});

test('image bundle collision preserves changed bytes and the accepted source bundle', async t => {
  const { options, dependencies } = await fixture(t);
  const first = await collectCiImageEvidence(options, dependencies);
  const archive = path.join(first.directory, 'artifact.zip');
  await fs.chmod(archive, 0o600);
  await fs.writeFile(archive, 'preserve unrelated changed bytes');
  await fs.chmod(archive, 0o400);
  await assert.rejects(collectCiImageEvidence(options, dependencies));
  assert.equal(await fs.readFile(archive, 'utf8'), 'preserve unrelated changed bytes');
  assert.equal((await fs.readdir(options.outputDirectory)).length, 2);
});

test('token overrides fail at the existing source boundary before any network call', async t => {
  const { options, dependencies, calls } = await fixture(t);
  await assert.rejects(collectCiImageEvidence(options, { ...dependencies, environment: { GH_TOKEN: 'private canary' } }),
    error => error.message === 'CI image evidence acquisition failed; no qualification was issued.');
  assert.equal(calls.length, 0);
  assert.deepEqual(await fs.readdir(options.outputDirectory), []);
});

test('Linux image acquisition preserves the source collector output-owner boundary', { skip: process.platform === 'win32' }, async t => {
  const { options, dependencies, calls } = await fixture(t);
  await fs.chmod(options.outputDirectory, 0o777);
  await assert.rejects(collectCiImageEvidence(options, dependencies));
  assert.equal(calls.length, 0);
});
