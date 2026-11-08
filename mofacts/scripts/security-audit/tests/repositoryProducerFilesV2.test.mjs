import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeRepositoryProducerFileV2 } from '../repository/producerFilesV2.mjs';
import { acquireRepositoryToolObservationsV2 } from '../repository/acquireV2.mjs';
import { acquireRepositorySourceObservationsV2, REPOSITORY_SOURCE_CONTROLS_V2 } from '../repository/sourceV2.mjs';
import { runRepositoryCommandV2 } from '../repository/commandV2.mjs';
import { parseAuditFileV2, readAuditFileV2 } from '../core/producerFilesV2.mjs';
import { assembleAuditReportV2 } from '../core/assembleV2.mjs';
import { parseSecurityAuditReportV2 } from '../../../common/securityAudit/reportV2.ts';
import { envelope, errorArtifacts, ingestionContext, platformImage, revision } from './fixtures/v2Fixtures.mjs';

const encode = value => Buffer.from(JSON.stringify(value));
const zeroNpm = { vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };
const cleanImage = { state: 'observed', value: { evaluatedCount: 2, findingCount: 0 } };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-repository-emitter-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'mofacts'), scripts = path.join(app, 'scripts', 'security-audit');
  for (const directory of [scripts, path.join(app, 'server'), path.join(root, 'mofacts-mcp-sidecar', 'services', 'mongo-mcp'), path.join(root, 'artifacts')]) await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(app, 'server', 'module.ts'), 'console.log("a safe literal");');
  await fs.writeFile(path.join(scripts, 'development-dependency-exposure.json'), JSON.stringify({ schema: 'DevelopmentDependencyExposurePolicyV1', confirmedBuildExposures: [] }));
  await fs.writeFile(path.join(scripts, 'source-security-v2.test.mjs'), "import test from 'node:test'; test('fixture one',()=>{});test('fixture two',()=>{});");
  const options = { profile: 'full', artifactDirectory: path.join(root, 'artifacts'), repositoryDirectory: root,
    environment: { PATH: process.env.PATH, NODE_OPTIONS: '' }, canaries: ['SYNTHETIC-PRIVATE-CANARY'],
    imageContext: { AUDIT_RUNTIME_IMAGE: platformImage.value, deployedApplicationRevision: structuredClone(revision), deployedImageDigest: structuredClone(platformImage) } };
  const calls = [], images = [], components = [];
  const run = async spec => {
    calls.push(spec);
    if (spec.command === process.execPath) {
      if (spec.args[0] === '--test') return runRepositoryCommandV2(spec);
      if (spec.args.includes('--discover')) return { exitCode: 0, stdout: encode({ methods: ['fixture-method'], publications: [], httpRoutes: [], exports: [], managementRoutes: [] }) };
      return { exitCode: 0, stdout: Buffer.from('Security surface contract covers 1 surfaces.\n') };
    }
    if (spec.command === 'npm') return { exitCode: 0, stdout: encode(zeroNpm) };
    const report = spec.args[spec.args.indexOf(spec.command === 'gitleaks' ? '--report-path' : '--output') + 1];
    await fs.writeFile(report, JSON.stringify(spec.command === 'gitleaks' ? []
      : { ArtifactName: platformImage.value, Results: [{ Target: 'fixture-os', Class: 'os-pkgs', Vulnerabilities: [] }] }));
    return { exitCode: 0, stdout: Buffer.alloc(0) };
  };
  const dependencies = {
    tools: async input => { components.push('tools'); assert.equal(Object.hasOwn(input, 'canaries'), false); return acquireRepositoryToolObservationsV2(input, { run }); },
    source: async input => { components.push('source'); assert.equal(Object.hasOwn(input, 'canaries'), false); return acquireRepositorySourceObservationsV2(input, { run }); },
    image: async input => { components.push('image'); images.push(input); return cleanImage; },
  };
  return { root, options, calls, images, dependencies, components, output: path.join(options.artifactDirectory, 'repository.json') };
}

test('V2 repository emitter collects raw tool/source protocols, writes all 25 rows and passes independent full-report assembly', async t => {
  const f = await fixture(t), artifact = await writeRepositoryProducerFileV2(f.options, f.dependencies);
  assert.equal(artifact.controls.length, 25); assert.ok(artifact.controls.every(row => row.status === 'PASS'));
  assert.deepEqual(parseAuditFileV2(await readAuditFileV2(f.output)), artifact);
  assert.equal(Number((await fs.stat(f.output)).mode) & 0o777, 0o600);
  assert.deepEqual(f.components, ['tools', 'source', 'image']); assert.equal(f.images.length, 1);
  assert.equal(artifact.controls.find(row => row.controlId === REPOSITORY_SOURCE_CONTROLS_V2.tests).evidence.metrics.expectedCaseCount, 2);
  assert.equal(JSON.stringify(artifact).includes('PRIVATE'), false);
  const artifacts = await errorArtifacts(); artifacts.find(slot => slot.producerId === 'repository').artifact = artifact;
  const report = await assembleAuditReportV2({ ...envelope, artifacts, deployedApplicationRevision: revision, deployedImageDigest: platformImage });
  assert.equal(report.counts.pass, 25); assert.equal(report.counts.error, 45);
  await parseSecurityAuditReportV2(report, { ...ingestionContext, receiverRevision: revision, receiverImage: platformImage });
});

test('V2 repository emitter gates image I/O on independent context and canaries while keeping unrelated observations', async t => {
  for (const mode of ['missing', 'conflicting', 'canaries']) {
    const f = await fixture(t);
    if (mode === 'missing') delete f.options.imageContext;
    if (mode === 'conflicting') f.options.imageContext.deployedImageDigest = { state: 'conflicting', reason: 'independent-observations-disagree' };
    if (mode === 'canaries') f.options.canaries = [];
    const artifact = await writeRepositoryProducerFileV2(f.options, f.dependencies);
    assert.equal(f.images.length, 0);
    assert.equal(f.calls.filter(row => row.command === 'trivy').length, mode === 'canaries' ? 1 : 0);
    assert.equal(artifact.controls.filter(row => row.status === 'ERROR').length, mode === 'canaries' ? 1 : 3);
    assert.equal(artifact.controls.find(row => row.controlId === REPOSITORY_SOURCE_CONTROLS_V2.tests).status, 'PASS');
  }
});

test('V2 repository emitter rejects stale output, excluded profiles and unsafe configuration before tool execution', async t => {
  const f = await fixture(t); await fs.writeFile(f.output, 'owned prior output');
  await assert.rejects(writeRepositoryProducerFileV2(f.options, f.dependencies), /already exists/);
  await assert.rejects(writeRepositoryProducerFileV2({ ...f.options, profile: 'exposure' }, f.dependencies));
  await assert.rejects(writeRepositoryProducerFileV2({ ...f.options, environment: { ...f.options.environment, AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' } }, f.dependencies));
  await assert.rejects(writeRepositoryProducerFileV2({ ...f.options, imageContext: { ...f.options.imageContext, secret: 'PRIVATE' } }, f.dependencies));
  assert.deepEqual(f.components, []); assert.equal(await fs.readFile(f.output, 'utf8'), 'owned prior output');
});

test('V2 repository emitter prevents component ownership overlap and malformed component replacement', async t => {
  const f = await fixture(t), dependencies = { ...f.dependencies, source: async input => ({ ...await f.dependencies.source(input),
    'repository.git-history-secrets': { state: 'observed', value: { evaluatedCount: 0, findingCount: 0 } } }) };
  await assert.rejects(writeRepositoryProducerFileV2(f.options, dependencies));
  assert.equal(f.images.length, 0); await assert.rejects(fs.stat(f.output), { code: 'ENOENT' });
  await assert.rejects(writeRepositoryProducerFileV2(f.options, { ...f.dependencies, image: undefined }));
});

test('V2 repository emitter propagates cleanup recovery errors without writing a normal artifact', async t => {
  const f = await fixture(t), error = new Error('Cleanup requires explicit recovery'); error.code = 'AUDIT_IMAGE_PROBE_CLEANUP_INCOMPLETE';
  await assert.rejects(writeRepositoryProducerFileV2(f.options, { ...f.dependencies, image: async () => { throw error; } }), thrown => thrown === error);
  await assert.rejects(fs.stat(f.output), { code: 'ENOENT' });
});

test('V2 repository emitter never overwrites a competing artifact created during acquisition', async t => {
  const f = await fixture(t);
  await assert.rejects(writeRepositoryProducerFileV2(f.options, { ...f.dependencies, image: async () => {
    await fs.writeFile(f.output, 'competing owner output'); return cleanImage;
  } }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(f.output, 'utf8'), 'competing owner output');
});

test('V2 repository emitter snapshots narrow identity/canary/environment inputs before asynchronous acquisition', async t => {
  const f = await fixture(t), original = structuredClone(f.options);
  const artifact = await writeRepositoryProducerFileV2(f.options, { ...f.dependencies, tools: async input => {
    f.options.canaries[0] = 'CHANGED-PRIVATE-CANARY'; f.options.environment.PATH = 'changed';
    f.options.imageContext.deployedImageDigest.value = 'registry.example/other@sha256:' + 'f'.repeat(64);
    return f.dependencies.tools(input);
  } });
  assert.ok(artifact.controls.every(row => row.status === 'PASS'));
  assert.deepEqual(f.images[0].canaries, original.canaries); assert.deepEqual(f.images[0].environment, original.environment);
  assert.equal(f.images[0].runtimeImage, original.imageContext.AUDIT_RUNTIME_IMAGE);
});
