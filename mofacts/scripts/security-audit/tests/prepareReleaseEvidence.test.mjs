import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ciEvidenceFixture } from './helpers/ciEvidenceFixture.mjs';
import { composeCiEvidence, CI_EVIDENCE_FILES } from '../qualification/ciEvidence.mjs';
import { composeCiImageEvidence, CI_IMAGE_EVIDENCE_FILE } from '../qualification/collectCiImageEvidence.mjs';
import { prepareReleaseEvidence } from '../qualification/prepareReleaseEvidence.mjs';
import { classifyReleaseRecordProof, evaluateReleaseIdentity } from '../../../common/securityAudit/releaseQualification.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const failure = { message: 'Release evidence preparation failed; no qualification was issued.' };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-release-prepare-'));
  t.after(async () => {
    if (path.dirname(root) !== await fs.realpath(os.tmpdir())
      || !path.basename(root).startsWith('mofacts-release-prepare-')) assert.fail('foreign fixture');
    await fs.rm(root, { recursive: true });
  });
  const input = ciEvidenceFixture();
  const sourceRecord = composeCiEvidence(input);
  const sourceBytes = bytes(sourceRecord);
  const observation = { schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
    source: structuredClone(sourceRecord.source), image: { configDigest: `sha256:${'c'.repeat(64)}`, platform: 'linux/amd64' },
    sourceEvidenceDigestSha256: hash(input.files[CI_EVIDENCE_FILES[2]]),
    ci: { repository: 'memphis-iis/MoFaCTS', commit: sourceRecord.source.baseCommit, runId: '101', runAttempt: '1' } };
  const archive = Buffer.from('synthetic image archive; acquisition is a trusted injected operation');
  const imageArtifact = { ...structuredClone(input.artifact), id: 201, name: 'image-observation-101-1',
    digest: `sha256:${hash(archive)}`, size_in_bytes: archive.length };
  const imageRecord = composeCiImageEvidence({ sourceInput: input, sourceAcquisitionBytes: sourceBytes,
    imageArtifact, archiveBytes: archive, imageObservationBytes: bytes(observation) });
  const candidate = { deployedAtUtc: '2026-01-01T00:00:00.1234567Z', baseCommit: sourceRecord.source.baseCommit,
    includedUncommittedLocalChanges: false, image: 'registry.example.test/mofacts:prod-synthetic',
    tag: 'prod-synthetic', digest: `sha256:${'d'.repeat(64)}` };
  const options = { ciRunId: '101', securityRunId: '102', candidateFile: path.join(root, 'candidate.json'),
    expectedSourceFile: path.join(root, 'expected.json'), testAppRoot: path.join(root, 'app'),
    outputDirectory: path.join(root, 'evidence'), powershell: 'trusted-fixture-powershell' };
  await fs.mkdir(options.outputDirectory);
  await fs.mkdir(options.testAppRoot);
  await fs.writeFile(options.candidateFile, bytes(candidate));
  await fs.writeFile(options.expectedSourceFile, bytes(input.expectedObservation));
  const state = { candidate, input, sourceRecord, imageRecord, observation, calls: 0,
    afterPublish: async () => {}, resultOverrides: {} };
  const dependencies = { collectCiImageEvidence: async passed => {
    state.calls++;
    const { candidateFile: _candidate, ...acquisitionOptions } = options;
    assert.deepEqual(passed, acquisitionOptions);
    const sourceRecordBytes = state.sourceBytes || bytes(state.sourceRecord);
    const imageRecordBytes = state.imageBytes || bytes(state.imageRecord);
    const observationBytes = state.observationBytes || bytes(state.observation);
    const sourceDigest = hash(sourceRecordBytes);
    const imageDigest = hash(imageRecordBytes);
    const sourceDirectory = path.join(options.outputDirectory, sourceDigest);
    const imageDirectory = path.join(options.outputDirectory, imageDigest);
    await fs.mkdir(sourceDirectory);
    await fs.mkdir(imageDirectory);
    await fs.writeFile(path.join(sourceDirectory, 'acquisition.json'), sourceRecordBytes);
    await fs.writeFile(path.join(sourceDirectory, CI_EVIDENCE_FILES[2]), input.files[CI_EVIDENCE_FILES[2]]);
    await fs.writeFile(path.join(imageDirectory, 'acquisition.json'), imageRecordBytes);
    await fs.writeFile(path.join(imageDirectory, CI_IMAGE_EVIDENCE_FILE), observationBytes);
    const result = { state: 'acquired-unqualified', qualification: 'unqualified',
      directory: imageDirectory, digestSha256: imageDigest, sourceAcquisitionDigestSha256: sourceDigest,
      ciImageObservationDigestSha256: hash(observationBytes), ...state.resultOverrides };
    await state.afterPublish({ sourceDirectory, imageDirectory, result });
    return result;
  } };
  return { options, dependencies, state };
}

test('fresh six/eight-field candidates gain resolvable evidence references without changing actual release fields or files', async t => {
  for (const withAcceptance of [false, true]) {
    const { options, dependencies, state } = await fixture(t);
    if (withAcceptance) {
      state.candidate.imageId = `sha256:${'8'.repeat(64)}`;
      state.candidate.acceptance = 'operator-confirmed readiness and participant smoke checks';
      await fs.writeFile(options.candidateFile, bytes(state.candidate));
    }
    const original = await fs.readFile(options.candidateFile);
    const result = await prepareReleaseEvidence(options, dependencies);
    assert.equal(result.state, 'prepared-unqualified');
    assert.equal(result.qualification, 'unqualified');
    assert.equal(state.calls, 1);
    const { qualification, ...actual } = result.candidate;
    assert.deepEqual(actual, state.candidate);
    assert.equal(qualification.schema, 'ReleaseQualificationV2');
    assert.equal(qualification.state, 'unqualified');
    assert.equal(Object.hasOwn(qualification, 'releaseIdentity'), false);
    assert.deepEqual(qualification.buildIdentity, state.sourceRecord.source);
    const references = qualification.evidenceReferences;
    for (const reference of ['sourceAcquisitionDigestSha256', 'ciImageAcquisitionDigestSha256']) {
      const retained = await fs.readFile(path.join(options.outputDirectory, references[reference], 'acquisition.json'));
      assert.equal(hash(retained), references[reference]);
    }
    const observation = await fs.readFile(path.join(options.outputDirectory,
      references.ciImageAcquisitionDigestSha256, CI_IMAGE_EVIDENCE_FILE));
    assert.equal(hash(observation), references.ciImageObservationDigestSha256);
    assert.equal(classifyReleaseRecordProof(result.candidate), 'incomplete-unqualified');
    assert.deepEqual(evaluateReleaseIdentity(result.candidate), { status: 'ERROR', reason: 'proof-unavailable' });
    assert.deepEqual(await fs.readFile(options.candidateFile), original);
    assert.ok(Buffer.byteLength(JSON.stringify(result.candidate)) < 16384);
  }
});

test('invalid, private, duplicate, oversized and already-qualified candidates fail before acquisition and are never rewritten', async t => {
  const mutations = [
    value => bytes({ ...value, privateKey: 'private canary' }),
    value => Buffer.from(JSON.stringify(value).replace('{', '{"baseCommit":"discarded private canary",')),
    value => bytes({ ...value, baseCommit: '9'.repeat(40) }),
    value => bytes({ ...value, includedUncommittedLocalChanges: true }),
    value => bytes({ ...value, qualification: null }),
    value => bytes({ ...value, qualification: { schema: 'ReleaseQualificationV1' } }),
    value => bytes({ ...value, qualification: { schema: 'ReleaseQualificationV2' } }),
    () => Buffer.alloc(16385),
  ];
  for (const mutate of mutations) {
    const { options, dependencies, state } = await fixture(t);
    const original = mutate(state.candidate);
    await fs.writeFile(options.candidateFile, original);
    await assert.rejects(prepareReleaseEvidence(options, dependencies), failure);
    assert.equal(state.calls, 0);
    assert.deepEqual(await fs.readFile(options.candidateFile), original);
    assert.deepEqual(await fs.readdir(options.outputDirectory), []);
  }
});

test('the entire expected build identity must agree with retained source and image records', async t => {
  const mutations = [
    async ({ options, state }) => {
      const expected = structuredClone(state.input.expectedObservation);
      expected.identity.sourceSnapshotDigestSha256 = '9'.repeat(64);
      await fs.writeFile(options.expectedSourceFile, bytes(expected));
    },
    async ({ state }) => { state.imageRecord.source.sourceSnapshotDigestSha256 = '9'.repeat(64); },
    async ({ state }) => { state.sourceRecord.source.includedUncommittedLocalChanges = true; },
  ];
  for (const mutate of mutations) {
    const setup = await fixture(t);
    await mutate(setup);
    await assert.rejects(prepareReleaseEvidence(setup.options, setup.dependencies), failure);
  }
});

test('acquisition record, exact observation and source-evidence references cannot be substituted', async t => {
  const mutations = [
    state => { state.resultOverrides.digestSha256 = '9'.repeat(64); },
    state => { state.resultOverrides.sourceAcquisitionDigestSha256 = '9'.repeat(64); },
    state => { state.resultOverrides.ciImageObservationDigestSha256 = '9'.repeat(64); },
    state => { state.resultOverrides.state = 'qualified'; },
    state => { state.imageRecord.sourceAcquisitionDigestSha256 = '9'.repeat(64); },
    state => { state.imageRecord.ci.runAttempt = '2'; },
    state => { state.imageRecord.security.runId = '999'; },
    state => { state.imageRecord.artifact.files[0].digestSha256 = '9'.repeat(64); },
    state => { state.imageRecord.artifact.files[0].name = 'image-observation.json'; },
    state => { state.observation.sourceEvidenceDigestSha256 = '9'.repeat(64); },
    state => { state.sourceBytes = Buffer.from(bytes(state.sourceRecord).toString().replace('{', '{"source":"discarded private canary",')); },
    state => { state.imageBytes = Buffer.from(bytes(state.imageRecord).toString().replace('{', '{"source":"discarded private canary",')); },
  ];
  for (const mutate of mutations) {
    const { options, dependencies, state } = await fixture(t);
    mutate(state);
    await assert.rejects(prepareReleaseEvidence(options, dependencies), failure);
  }
});

test('changed candidate/expected bytes and altered published evidence fail after acquisition without being repaired', async t => {
  const changes = [
    async ({ options }) => { await fs.writeFile(options.candidateFile, bytes({ ...JSON.parse(await fs.readFile(options.candidateFile)), tag: 'changed' })); },
    async ({ options }) => { await fs.appendFile(options.expectedSourceFile, ' '); },
    async ({ sourceDirectory }) => { await fs.appendFile(path.join(sourceDirectory, 'acquisition.json'), ' '); },
    async ({ imageDirectory }) => { await fs.appendFile(path.join(imageDirectory, 'acquisition.json'), ' '); },
    async ({ sourceDirectory }) => { await fs.appendFile(path.join(sourceDirectory, CI_EVIDENCE_FILES[2]), ' '); },
    async ({ imageDirectory }) => { await fs.appendFile(path.join(imageDirectory, CI_IMAGE_EVIDENCE_FILE), ' '); },
  ];
  for (const change of changes) {
    const { options, dependencies, state } = await fixture(t);
    state.afterPublish = paths => change({ ...paths, options });
    await assert.rejects(prepareReleaseEvidence(options, dependencies), failure);
    assert.equal(state.calls, 1);
  }
});

test('failed acquisition is bounded and cannot produce a candidate or replace existing proof', async t => {
  const { options } = await fixture(t);
  const before = await fs.readFile(options.candidateFile);
  await assert.rejects(prepareReleaseEvidence(options, {
    collectCiImageEvidence: async () => { throw new Error('private provider response must never escape'); },
  }), failure);
  assert.deepEqual(await fs.readFile(options.candidateFile), before);
});
