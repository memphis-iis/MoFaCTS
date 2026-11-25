import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { composeNativeVerificationBundle, writeCapturedVerificationBundle } from '../qualification/composeVerificationBundle.mjs';
import { digestVerificationCatalog } from '../qualification/verificationCatalogProof.mjs';
import { bindNativeCaseEvidence } from '../qualification/nativeCaseEvidence.mjs';
import { carryImageVerificationBundle, validateBuildVerificationBundle } from '../qualification/imageVerificationBundle.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
const buildIdentity = { schema: 'BuildIdentityV1', baseCommit: '1'.repeat(40),
  includedUncommittedLocalChanges: false, sourceSnapshotDigestSha256: '2'.repeat(64) };
const expectedTestInputs = { state: 'test-inputs-verified-unqualified', identity: buildIdentity,
  testInputContractDigestSha256: '3'.repeat(64), supplementalDigestSha256: '4'.repeat(64) };
const expectedModules = { server: ['server/fixture.test.ts'], client: ['client/fixture.test.ts'] };
const expectedRegistry = { profile: { mode: 'production', meteorRelease: 'METEOR@3.5' }, inventorySha256: '5'.repeat(64) };
const declared = AUDIT_VERIFICATIONS.filter(row => row.kind === 'integrationTest' && row.lane === 'meteor');

function fixture({ omitCase = false, amendReceipt = () => {} } = {}) {
  const caseIds = [...new Set(declared.flatMap(({ suite, cases }) =>
    cases.map(name => hash(JSON.stringify(['server', JSON.stringify([suite, name]), 0])))))];
  if (omitCase) caseIds.pop();
  const environments = ['server', 'client'].map(side => {
    const ids = side === 'server' ? caseIds : [hash(side)];
    return { schema: 'MeteorEnvironmentEvidenceV1', side, modules: expectedModules[side],
      tests: ids.map(id => ({ id, outcome: 'passed' })), counts: { passed: ids.length, failed: 0, pending: 0 }, hookFailures: 0 };
  });
  const runBytes = bytes({ schema: 'MeteorTestRunEvidenceV1', exitStatus: 0, environments });
  const receipt = {
    schema: 'NativeMeteorVerificationV1', qualification: 'unqualified', provider: 'operator-linux-docker',
    sourceObservation: structuredClone(expectedTestInputs),
    toolImageId: 'sha256:' + 'a'.repeat(64), mongoImageId: 'sha256:' + 'b'.repeat(64),
    runEvidenceDigestSha256: hash(runBytes), toolSourceManifestDigestSha256: 'c'.repeat(64),
    startedAt: '2026-11-24T00:00:00Z', finishedAt: '2026-11-24T00:05:00Z',
    environments: environments.map(({ side, modules, counts, hookFailures }) =>
      ({ side, moduleCount: modules.length, counts, hookFailures })),
    limits: { workerMemoryMiB: 6144, mongoMemoryMiB: 384, workerCpus: 2, mongoCpus: 0.25 },
    isolation: { schema: 'NativeIntegrationIsolationV1', dockerSocketAbsent: true, workerUid: 2000,
      effectiveCapabilitiesZero: true, readOnlyMountsVerified: 2, readOnlyFileOperationsRefused: 4, testCopyWritable: true },
  };
  amendReceipt(receipt);
  const receiptBytes = bytes(receipt);
  return { nativeEvidence: { receiptBytes, runBytes, expectedReceiptSha256: hash(receiptBytes), expectedTestInputs, expectedModules },
    buildIdentity, variant: 'source-evidence', expectedRegistry };
}

test('composes only exact passing native cases for a separate declared registry profile', async () => {
  const input = fixture();
  const bundle = await composeNativeVerificationBundle(input);
  assert.deepEqual(bundle.profile, expectedRegistry.profile);
  assert.equal(bundle.profileSha256, await auditDigest(expectedRegistry.profile));
  assert.equal(bundle.expectedRegistrySha256, expectedRegistry.inventorySha256);
  assert.equal(bundle.verificationCatalogSha256, await digestVerificationCatalog());
  assert.deepEqual(bundle.executions.map(row => row.verificationId), declared.map(row => row.verificationId).sort());
  assert.ok(bundle.executions.every(row => row.outcome === 'PASS' && row.lane === 'isolated-meteor'
    && row.runEvidenceSha256 === hash(input.nativeEvidence.runBytes)));
});

test('requires the exact captured source and complete passing case set', async () => {
  await assert.rejects(composeNativeVerificationBundle(fixture({ omitCase: true })), /cover every required/);
  await assert.rejects(composeNativeVerificationBundle({ ...fixture(),
    buildIdentity: { ...buildIdentity, sourceSnapshotDigestSha256: 'e'.repeat(64) } }), /differs from the captured/);
  await assert.rejects(composeNativeVerificationBundle({ ...fixture(),
    buildIdentity: { ...buildIdentity, includedUncommittedLocalChanges: true } }), /differs from the captured/);
});

test('binds the independently retained receipt, its environment, and raw evidence', async () => {
  const accept = input => bindNativeCaseEvidence(input.nativeEvidence, [declared[0].verificationId]);
  for (const [change, error] of [
    [row => { row.sourceObservation.supplementalDigestSha256 = 'e'.repeat(64); }, /inputs differ/],
    [row => { row.isolation.dockerSocketAbsent = false; }, /approved execution environment/],
    [row => { row.limits.workerMemoryMiB = 8192; }, /approved execution environment/],
    [row => { row.environments[0].moduleCount++; }, /outcome differs/],
    [row => { row.runEvidenceDigestSha256 = 'f'.repeat(64); }, /retained run bytes/],
  ]) await assert.rejects(accept(fixture({ amendReceipt: change })), error);
  const input = fixture();
  input.nativeEvidence.expectedReceiptSha256 = 'f'.repeat(64);
  await assert.rejects(accept(input), /receipt identity/);
});

test('keeps composed test fixtures ineligible for release', async () => {
  const input = fixture();
  await assert.rejects(composeNativeVerificationBundle({ ...input, variant: 'test-fixture' }), /requires a test profile/);
  const bundle = await composeNativeVerificationBundle({ ...input, variant: 'test-fixture',
    expectedRegistry: { ...expectedRegistry, profile: { ...expectedRegistry.profile, mode: 'test' } } });
  assert.equal(bundle.variant, 'test-fixture');
  await assert.rejects(requireMatchingSourceVerification(bundle, { ...bundle, sourceVerificationIds: new Set() }), /identity mismatch/);
  await assert.rejects(validateBuildVerificationBundle(Buffer.from(canonicalAuditJson(bundle)), buildIdentity, 'METEOR@3.5'), /identity mismatch/);
});

test('carries a canonical source bundle into a build only for the captured revision and pinned profile', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-proof-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, 'source.json');
  const releaseFile = path.join(root, 'release');
  const inputFile = path.join(root, 'bundle.json');
  const outputDirectory = path.join(root, 'artifacts');
  const bundle = await composeNativeVerificationBundle(fixture());
  const bundleBytes = Buffer.from(canonicalAuditJson(bundle));
  const request = { sourceFile, releaseFile, inputFile };
  await carryImageVerificationBundle({ ...request, outputDirectory: path.join(root, 'ordinary'), expectedHash: '' });
  assert.deepEqual(await fs.readdir(path.join(root, 'ordinary')), []);
  await assert.rejects(carryImageVerificationBundle({ ...request, outputDirectory,
    expectedHash: hash(bundleBytes) }), /supplied together/);
  await fs.writeFile(sourceFile, bytes({ schema: 'MoFaCTSImageSourceObservationV1', state: 'source-matched-unqualified', identity: buildIdentity }));
  await fs.writeFile(releaseFile, 'METEOR@3.5\n');
  await fs.writeFile(inputFile, bundleBytes);
  await assert.rejects(carryImageVerificationBundle({ ...request, outputDirectory, expectedHash: '0'.repeat(64) }), /digest mismatch/);
  await assert.rejects(validateBuildVerificationBundle(bundleBytes, buildIdentity, 'METEOR@3.6'), /identity mismatch/);
  await assert.rejects(validateBuildVerificationBundle(bundleBytes, { ...buildIdentity,
    baseCommit: '0'.repeat(40) }, 'METEOR@3.5'), /identity mismatch/);
  await assert.rejects(validateBuildVerificationBundle(bytes(bundle), buildIdentity, 'METEOR@3.5'), /canonical/);
  await carryImageVerificationBundle({ ...request, outputDirectory, expectedHash: hash(bundleBytes) });
  assert.deepEqual(await fs.readFile(path.join(outputDirectory, 'mofacts-verification-bundle.json')), bundleBytes);
});

test('writes the proof once from retained inputs and the separately declared registry', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-proof-prepare-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { nativeEvidence } = fixture();
  const app = path.join(root, 'test-context/mofacts');
  for (const name of ['common', 'tests', 'server', 'client', '.meteor']) {
    await fs.mkdir(path.join(app, name), { recursive: true });
  }
  for (const paths of Object.values(expectedModules)) {
    for (const name of paths) await fs.writeFile(path.join(app, name), '');
  }
  await fs.writeFile(path.join(app, '.meteor/release'), 'METEOR@3.5\n');
  await fs.writeFile(path.join(root, 'native-verification.json'), nativeEvidence.receiptBytes);
  await fs.writeFile(path.join(root, 'meteor-run.json'), nativeEvidence.runBytes);
  const registryFile = path.join(root, 'registry.json');
  await fs.writeFile(registryFile, bytes(expectedRegistry));
  const options = { root, expectedTestInputs, resultsDirectory: root, registryFile,
    expectedReceiptSha256: nativeEvidence.expectedReceiptSha256 };
  const result = await writeCapturedVerificationBundle(options);
  assert.equal(result.state, 'source-proof-prepared-unqualified');
  assert.equal(result.bundleDigestSha256, hash(await fs.readFile(result.bundleFile)));
  await assert.rejects(writeCapturedVerificationBundle(options), { code: 'EEXIST' });
});
