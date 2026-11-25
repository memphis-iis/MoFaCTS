import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { composeNativeVerificationBundle, writeCapturedVerificationBundle } from '../qualification/composeVerificationBundle.mjs';
import { digestVerificationCatalog } from '../qualification/verificationCatalogProof.mjs';
import { bindNativeCaseEvidence } from '../qualification/nativeCaseEvidence.mjs';
import { carryImageVerificationBundle, validateBuildVerificationBundle } from '../qualification/imageVerificationBundle.mjs';
import { compareRuntimeVerification } from '../qualification/compareRuntimeVerification.mjs';
import { projectExpectedRegistry } from '../qualification/registryProjection.mjs';
import { observeStaging2Registry } from '../qualification/observeStaging2Registry.mjs';

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
  const registry = fixtureInventory();
  const testRegistry = Buffer.from(canonicalAuditJson({ ...registry, profile: { ...registry.profile, mode: 'test' } }));
  const { nativeEvidence } = fixture({ amendReceipt(receipt) { receipt.startupRegistryDigestSha256 = hash(testRegistry); } });
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
  await fs.writeFile(path.join(root, 'startup-registry.json'), testRegistry);
  const declaration = { schema: 'RegistryProjectionDeclarationV1', profile: expectedRegistry.profile,
    registrationProjection: 'same-reviewed-owner-descriptors' };
  await fs.writeFile(registryFile, bytes(declaration));
  const options = { root, expectedTestInputs, resultsDirectory: root, registryFile,
    expectedReceiptSha256: nativeEvidence.expectedReceiptSha256 };
  await fs.writeFile(path.join(root, 'startup-registry.json'), canonicalAuditJson({
    ...JSON.parse(testRegistry), surfaces: [...registry.surfaces].reverse(),
  }));
  await assert.rejects(writeCapturedVerificationBundle(options), /does not match the retained receipt/);
  await fs.writeFile(path.join(root, 'startup-registry.json'), testRegistry);
  await fs.writeFile(registryFile, bytes({ ...declaration, registrationProjection: 'unreviewed' }));
  await assert.rejects(writeCapturedVerificationBundle(options), /Unsupported registry projection/);
  await fs.writeFile(registryFile, bytes(declaration));
  const result = await writeCapturedVerificationBundle(options);
  assert.equal(result.state, 'source-proof-prepared-unqualified');
  assert.equal(result.bundleDigestSha256, hash(await fs.readFile(result.bundleFile)));
  assert.equal(result.inventorySha256, (await projectExpectedRegistry(registry)).inventorySha256);
  await assert.rejects(writeCapturedVerificationBundle(options), { code: 'EEXIST' });
});

function fixtureInventory() {
  const inventory = {
    schema: 'StartupSurfaceInventoryV1', profile: expectedRegistry.profile,
    surfaces: declared.map(({ surfaceId, verificationId }) => ({
      surfaceId, owner: 'fixture-owner', policy: 'fixture-policy', dataEgress: 'none', verificationIds: [verificationId],
    })),
  };
  // Give intentionally grouped fixture cases a single transport owner.
  const rows = new Map();
  for (const row of inventory.surfaces) {
    const owned = rows.get(row.surfaceId);
    if (owned) owned.verificationIds.push(...row.verificationIds);
    else rows.set(row.surfaceId, row);
  }
  inventory.surfaces = [...rows.values()];
  return inventory;
}

test('projects the reviewed production registry deterministically with exact HTTP case ownership', async () => {
  const inventory = fixtureInventory();
  const surface = inventory.surfaces.find(row => row.surfaceId === 'http:get:/health');
  surface.owner = 'http';
  surface.transport = { verifiedSurfaces: [surface.surfaceId] };
  surface.surfaceId = 'middleware:health-get-test';
  const expected = await projectExpectedRegistry(inventory);
  const reversed = { ...inventory, surfaces: [...inventory.surfaces].reverse() };
  assert.deepEqual(await projectExpectedRegistry(reversed), expected);
  await assert.rejects(projectExpectedRegistry({ ...inventory, profile: { ...inventory.profile, mode: 'test' } }), /not production/);
  surface.transport.verifiedSurfaces[0] = 'http:head:/health';
  await assert.rejects(projectExpectedRegistry(inventory), /different surface/);
});

async function runtimeObservation(amendInventory = () => {}) {
  const inventory = fixtureInventory();
  amendInventory(inventory);
  const profileSha256 = await auditDigest(inventory.profile);
  const inventorySha256 = await auditDigest(inventory);
  const bundle = await composeNativeVerificationBundle({ ...fixture(),
    expectedRegistry: { ...expectedRegistry, inventorySha256 } });
  const bundleDigestSha256 = await auditDigest(bundle);
  const observation = {
    buildIdentity: { state: 'observed', identity: structuredClone(buildIdentity) },
    registry: { state: 'sealed', inventory, inventorySha256, profileSha256 },
    verificationBundle: { state: 'observed', bundle, digestSha256: bundleDigestSha256 },
  };
  return { observation, expected: { buildIdentity, profile: expectedRegistry.profile, inventorySha256, bundleDigestSha256 } };
}

test('matches the runtime response to the independent proof and recomputes all hashes', async () => {
  const { observation, expected } = await runtimeObservation();
  const result = await compareRuntimeVerification(observation, expected);
  assert.equal(result.state, 'runtime-proof-matched-unqualified');
  assert.equal(result.verificationCount, declared.length);
  for (const [update, reason] of [
    [value => { value.buildIdentity.identity.baseCommit = '0'.repeat(40); }, /identity differs/],
    [value => { value.registry.inventory.profile = { ...value.registry.inventory.profile, mode: 'test' }; }, /registry or profile/],
    [value => { value.registry.inventory.surfaces.reverse(); }, /registry or profile/],
    [value => { value.verificationBundle.bundle.executions[0].resultEvidenceSha256 = '0'.repeat(64); }, /bundle differs/],
  ]) {
    const changed = structuredClone(observation);
    update(changed);
    await assert.rejects(compareRuntimeVerification(changed, expected), reason);
  }
});

test('reads the installed staging2 registry through the bound administrator and returns only hashes', async () => {
  const { observation, expected } = await runtimeObservation();
  const origin = 'https://staging2.optimallearning.org';
  const admin = 'fixture-admin';
  let actor = admin;
  let switchActor = false;
  const calls = [];
  const page = {
    url: () => origin + '/',
    evaluate: (callback, args) => runInNewContext('(' + callback.toString() + ')(args)', {
      args, location: { origin }, setTimeout, clearTimeout, TextEncoder,
      Meteor: { status: () => ({ connected: true }), userId: () => actor,
        callAsync: async (...method) => {
          calls.push(method);
          if (switchActor) actor = 'unrelated';
          return observation;
        } },
      Session: { get: key => ({ authReady: true, authRolesHydrated: true,
        authRolesSyncedUserId: admin, authRoles: { admin: true, teacher: false } })[key] },
    }),
  };
  await assert.rejects(observeStaging2Registry({ ...page, url: () => 'https://other.example/' }, admin, expected), /session did not match/);
  assert.deepEqual(calls, []);
  const result = await observeStaging2Registry(page, admin, expected);
  assert.equal(result.state, 'runtime-proof-matched-unqualified');
  assert.deepEqual(calls, [['admin.securityAudits.surfaceInventory']]);
  assert.equal(Object.hasOwn(result, 'inventory'), false);
  switchActor = true;
  await assert.rejects(observeStaging2Registry(page, admin, expected), /Invalid staging2 registry observation/);
});

test('rejects a registry with missing or repeated verification IDs even when its bytes match the expectation', async () => {
  for (const update of [
    inventory => { inventory.surfaces.pop(); },
    inventory => { inventory.surfaces[0].verificationIds.push(inventory.surfaces[0].verificationIds[0]); },
  ]) {
    const { observation, expected } = await runtimeObservation(update);
    await assert.rejects(compareRuntimeVerification(observation, expected), /missing required verification|repeated ID/);
  }
});
