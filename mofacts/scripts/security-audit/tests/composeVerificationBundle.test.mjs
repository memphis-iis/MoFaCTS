import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_CATALOG_V2, AUDIT_SECTION_IDS, AUTHENTICATION_QUALIFICATION_CATALOG, profileControls } from '../../../common/securityAudit/catalogRegistry.ts';
import { finalizeAuditReport } from '../../../common/securityAudit/reportV2.ts';
import { requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { composeNativeVerificationBundle, writeCapturedVerificationBundle } from '../qualification/composeVerificationBundle.mjs';
import { digestVerificationCatalog } from '../qualification/verificationCatalogProof.mjs';
import { bindNativeCaseEvidence } from '../qualification/nativeCaseEvidence.mjs';
import { carryImageVerificationBundle, validateBuildVerificationBundle } from '../qualification/imageVerificationBundle.mjs';
import { compareRuntimeVerification } from '../qualification/compareRuntimeVerification.mjs';
import { projectExpectedRegistry } from '../qualification/registryProjection.mjs';
import { observeStaging2Registry } from '../qualification/observeStaging2Registry.mjs';
import { assembleStaging2FullReport, bindStaging2ReleaseRegistry, bindStaging2ReportReadback } from '../qualification/bindStaging2ReleaseRegistry.mjs';
import { projectReleaseReceiptV2 } from '../qualification/releaseRecordStore.mjs';
import { writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { retainPinnedAuditArchiveV2 } from '../core/reportFilesV2.mjs';
import { envelope } from './fixtures/v2Fixtures.mjs';

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

test('binds the verified registry and report readback to the staged image and exact workstation receipt', async t => {
  const { observation, expected } = await runtimeObservation();
  const registry = await compareRuntimeVerification(observation, expected);
  const publication = { kind: 'index', digest: 'sha256:' + 'a'.repeat(64),
    configDigest: 'sha256:' + 'b'.repeat(64), platformManifestDigest: 'sha256:' + 'c'.repeat(64), platform: 'linux/amd64' };
  const tag = 'fixture-phase3';
  const authorityBytes = Buffer.from(JSON.stringify({
    deployedAtUtc: '2026-11-24T10:00:00.000Z', baseCommit: buildIdentity.baseCommit,
    includedUncommittedLocalChanges: false, image: 'ppavlikmemphis/mofacts-staging2:' + tag,
    tag, digest: publication.digest, imageId: publication.configDigest,
    acceptance: 'operator-confirmed readiness and participant smoke checks',
  }));
  const receipt = projectReleaseReceiptV2(authorityBytes, publication);
  const input = {
    authorityBytes, publication, runningImage: { baseCommit: buildIdentity.baseCommit,
      configDigest: publication.configDigest, platform: publication.platform },
    hostReceipt: { state: 'observed', result: 'MATCH', receipt },
    bundleBytes: Buffer.from(canonicalAuditJson(observation.verificationBundle.bundle)),
    acceptance: { state: 'phase3-runtime-verified', sameLearnerAfterReload: true, ordinaryRoleVerified: true,
      sessionCleanupVerified: true, registry },
  };
  const binding = await bindStaging2ReleaseRegistry(input);
  assert.equal(binding.recordDigestSha256, hash(authorityBytes));
  assert.equal(binding.inventorySha256, registry.inventorySha256);
  assert.equal(binding.publishedImage.configDigest, publication.configDigest);
  await assert.rejects(bindStaging2ReleaseRegistry({ ...input, authorityBytes: Buffer.concat([authorityBytes, Buffer.from('\n')]) }), /do not match/);
  await assert.rejects(bindStaging2ReleaseRegistry({ ...input, runningImage: { ...input.runningImage, configDigest: publication.digest } }), /do not match/);
  await assert.rejects(bindStaging2ReleaseRegistry({ ...input, acceptance: { ...input.acceptance, sessionCleanupVerified: false } }), /incomplete/);
  await assert.rejects(bindStaging2ReleaseRegistry({ ...input, acceptance: { ...input.acceptance,
    registry: { ...registry, inventorySha256: 'f'.repeat(64) } } }), /does not match/);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-report-release-binding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const catalog = AUTHENTICATION_QUALIFICATION_CATALOG;
  const controls = profileControls(catalog, 'full');
  const sections = Object.fromEntries(AUDIT_SECTION_IDS.map(sectionId => [sectionId, {
    sectionId, status: 'ERROR', controls: controls.filter(row => row.sectionId === sectionId)
      .map(({ controlId, title, failureSeverity }) => ({ controlId, title, failureSeverity, status: 'ERROR',
        evidence: { category: 'synthetic-contract-qualification', summary: 'Synthetic report binding test.' } })),
  }]));
  const platformImage = 'ppavlikmemphis/mofacts-staging2@' + publication.platformManifestDigest;
  const payload = { ...envelope, target: binding.target, schema: 'SecurityAuditReportV2',
    startedAt: '2026-11-24T10:00:00.000Z', completedAt: '2026-11-24T10:01:00.000Z',
    catalogId: catalog.catalogId, catalogVersion: catalog.catalogVersion, catalogDigestSha256: await auditDigest(catalog),
    scannerSourceRevision: buildIdentity.baseCommit, deployedApplicationRevision: { state: 'observed', value: buildIdentity.baseCommit },
    deployedImageDigest: { state: 'observed', value: platformImage }, sections,
    executionErrors: ['synthetic-contract-qualification'] };
  async function pair(name, writer, receiver = writer) {
    const reportPath = path.join(directory, name + '-report.json');
    const readbackPath = path.join(directory, name + '-receiver.json');
    await writeAuditFileV2(reportPath, await finalizeAuditReport(writer));
    await writeAuditFileV2(readbackPath, await finalizeAuditReport(receiver));
    return { releaseEvidence: input, reportPath, readbackPath };
  }
  const matched = await pair('matched', payload);
  const reportBinding = await bindStaging2ReportReadback(matched);
  assert.equal(reportBinding.platformImage, platformImage);
  assert.equal(reportBinding.recordDigestSha256, binding.recordDigestSha256);
  assert.equal(reportBinding.inventorySha256, registry.inventorySha256);
  assert.equal(reportBinding.executionComplete, false);
  assert.equal(Object.hasOwn(reportBinding, 'archive'), false);
  await assert.rejects(bindStaging2ReportReadback(await pair('different-readback', payload,
    { ...payload, reportId: 'synthetic-different-report' })), /readback does not match/);
  for (const [name, completedAt] of [
    ['earlier-deployment', '2026-11-24T09:59:59.000Z'],
    ['crosses-deployment', '2026-11-24T10:01:00.000Z'],
  ]) {
    const files = await pair(name, { ...payload, startedAt: '2026-11-24T09:59:00.000Z', completedAt });
    await assert.rejects(bindStaging2ReportReadback(files), /started before the accepted staging2 deployment/);
  }
  for (const [name, change] of [
    ['scanner', { scannerSourceRevision: '0'.repeat(40) }],
    ['application', { deployedApplicationRevision: { state: 'observed', value: '0'.repeat(40) } }],
    ['config-digest', { deployedImageDigest: { state: 'observed', value: 'ppavlikmemphis/mofacts-staging2@' + publication.configDigest } }],
    ['index-digest', { deployedImageDigest: { state: 'observed', value: 'ppavlikmemphis/mofacts-staging2@' + publication.digest } }],
  ]) {
    await assert.rejects(bindStaging2ReportReadback(await pair(name, { ...payload, ...change })), /release identity do not match/);
  }

  const reportToolRevision = 'd'.repeat(40);
  const toolRoot = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
  const applicationCheckout = path.join(directory, 'deployed-application');
  const appProof = path.join(applicationCheckout, 'mofacts/scripts/security-audit/qualification/verificationCatalogProof.mjs');
  const historicalDigest = '8'.repeat(64);
  const historicalBundle = { ...observation.verificationBundle.bundle, verificationCatalogSha256: historicalDigest,
    executions: observation.verificationBundle.bundle.executions.slice(1) };
  const historicalBundleBytes = Buffer.from(canonicalAuditJson(historicalBundle));
  const deployedInput = { ...input, bundleBytes: historicalBundleBytes, acceptance: {
    ...input.acceptance, registry: { ...registry, bundleDigestSha256: hash(historicalBundleBytes),
      verificationCatalogSha256: historicalDigest, verificationCount: historicalBundle.executions.length },
  } };
  await fs.mkdir(path.dirname(appProof), { recursive: true });
  await fs.writeFile(appProof, `export const digestVerificationCatalog = () => '${historicalDigest}';
    export const requiredMeteorVerificationIds = ${JSON.stringify(historicalBundle.executions.map(row => row.verificationId))};`);
  function sourceOptions(revision = reportToolRevision, status = '', top = toolRoot, appRevision = buildIdentity.baseCommit) {
    return {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_DIR: 'foreign',
        AUDIT_REPORT_INGEST_SECRET: 'test-only signing value' },
      command: async (program, args, _maximum, environment) => {
        assert.equal(program, 'git');
        assert.deepEqual(args.slice(0, 2), ['--no-optional-locks', '-C']);
        assert.ok(args[2] === toolRoot || args[2] === applicationCheckout);
        const deployed = args[2] === applicationCheckout;
        assert.equal(environment.GIT_DIR, undefined);
        assert.equal(environment.AUDIT_REPORT_INGEST_SECRET, undefined);
        const verb = args.slice(3).join(' ');
        if (verb === 'rev-parse --show-toplevel') return Buffer.from((deployed ? applicationCheckout : top) + '\n');
        if (verb === 'rev-parse --verify HEAD') return Buffer.from((deployed ? appRevision : revision) + '\n');
        assert.equal(verb, 'status --porcelain=v1 --untracked-files=all');
        return Buffer.from(deployed ? '' : status);
      },
    };
  }

  const metadataPath = path.join(directory, 'metadata.json');
  const artifactDirectory = path.join(directory, 'producers');
  const stageReportPath = path.join(directory, 'staging2-full.json');
  await fs.mkdir(artifactDirectory);
  const metadata = Object.fromEntries(['reportId', 'reportType', 'startedAt', 'completedAt',
    'deployedApplicationRevision', 'deployedImageDigest', 'toolVersions'].map(key => [key, payload[key]]));
  await writeAuditFileV2(metadataPath, metadata);
  const producer = {
    artifactSchema: 'MoFaCTSSecurityAuditProducerArtifactV1', producerId: 'repository', sectionId: 'repository',
    controls: sections.repository.controls.map(({ controlId, status, evidence }) =>
      controlId === 'repository.dependencies-application-runtime.low'
        ? { controlId, status: 'FAIL', evidence: { summary: 'Synthetic retained finding.',
          metrics: { evaluatedCount: 1, findingCount: 1 } } }
        : { controlId, status, evidence }),
  };
  await writeAuditFileV2(path.join(artifactDirectory, 'repository.json'), producer);
  const stageInputs = { releaseEvidence: deployedInput, metadataPath, artifactDirectory, reportToolRevision,
    applicationCheckout, outputPath: stageReportPath };
  for (const invalidSource of [
    sourceOptions('e'.repeat(40)), sourceOptions(reportToolRevision, ' M mofacts/scripts/security-audit/work.mjs\n'),
    sourceOptions(reportToolRevision, '? local-source.mjs\n'), sourceOptions(reportToolRevision, '', directory),
    sourceOptions(reportToolRevision, '', toolRoot, reportToolRevision),
  ]) {
    await assert.rejects(assembleStaging2FullReport(stageInputs, invalidSource), /reviewed clean checkout/);
    await assert.rejects(fs.stat(stageReportPath), { code: 'ENOENT' });
  }
  let observations = 0;
  const clean = sourceOptions();
  const changed = sourceOptions('e'.repeat(40));
  await assert.rejects(assembleStaging2FullReport(stageInputs, { ...clean, command: (...args) => {
    if (args[1][2] === toolRoot) observations++;
    return (observations <= 3 ? clean : changed).command(...args);
  } }), /reviewed clean checkout/);
  await assert.rejects(fs.stat(stageReportPath), { code: 'ENOENT' });

  for (const [name, invalidMetadata, message] of [
    ['external target', { ...metadata, target: 'https://audit.example' }, /unexpected or missing fields/],
    ['unverified scanner', { ...metadata, scannerSourceRevision: reportToolRevision }, /unexpected or missing fields/],
    ['wrong application', { ...metadata, deployedApplicationRevision: { state: 'observed', value: reportToolRevision } },
      /release identity do not match/],
    ['wrong platform image', { ...metadata, deployedImageDigest: { state: 'observed',
      value: 'ppavlikmemphis/mofacts-staging2@' + publication.digest } }, /release identity do not match/],
    ['earlier run', { ...metadata, startedAt: '2026-11-24T09:59:59.000Z' }, /started before the accepted staging2 deployment/],
    ['exposure', { ...metadata, reportType: 'exposure' }, /release identity do not match/],
  ]) {
    const badMetadata = path.join(directory, name + '.json');
    await writeAuditFileV2(badMetadata, invalidMetadata);
    await assert.rejects(assembleStaging2FullReport({ ...stageInputs, metadataPath: badMetadata }, clean), message);
    await assert.rejects(fs.stat(stageReportPath), { code: 'ENOENT' });
  }

  await assert.rejects(assembleStaging2FullReport({ ...stageInputs, releaseEvidence: input }, clean), /bundle identity mismatch/);
  await assert.rejects(fs.stat(stageReportPath), { code: 'ENOENT' });
  const staged = await assembleStaging2FullReport(stageInputs, clean);
  assert.equal(staged.catalogVersion, 2);
  assert.equal(staged.catalogDigestSha256, AUDIT_CATALOG_V2.catalogDigestSha256);
  assert.equal(staged.scannerSourceRevision, reportToolRevision);
  assert.equal(staged.deployedApplicationRevision.value, buildIdentity.baseCommit);
  assert.equal(staged.deployedImageDigest.value, platformImage);
  assert.equal(staged.counts.fail, 1);
  assert.equal(staged.counts.error, 69);
  await assert.rejects(assembleStaging2FullReport(stageInputs, clean), { code: 'EEXIST' });

  const stagedCopy = path.join(directory, 'staging2-full-receiver.json');
  await fs.copyFile(stageReportPath, stagedCopy);
  const stagedReadback = { releaseEvidence: deployedInput, reportPath: stageReportPath, readbackPath: stagedCopy };
  await assert.rejects(bindStaging2ReportReadback(stagedReadback), /bundle identity mismatch/);
  await assert.rejects(bindStaging2ReportReadback({ ...stagedReadback, reportToolRevision }, clean), /supplied together/);
  const pinnedReadback = { ...stagedReadback, reportToolRevision, applicationCheckout };
  await assert.rejects(bindStaging2ReportReadback(pinnedReadback, sourceOptions('e'.repeat(40))), /reviewed clean checkout/);
  await assert.rejects(bindStaging2ReportReadback({ ...pinnedReadback, reportPath: matched.reportPath, readbackPath: matched.readbackPath }, clean),
    /release identity do not match/);
  const stagedBinding = await bindStaging2ReportReadback(pinnedReadback, clean);
  assert.equal(stagedBinding.scannerSourceRevision, reportToolRevision);
  assert.equal(stagedBinding.recordDigestSha256, binding.recordDigestSha256);
  assert.equal(stagedBinding.executionComplete, false);

  const keyPair = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const expectedPublicKeySha256 = hash(keyPair.publicKey.export({ type: 'spki', format: 'der' }));
  const privateKeyPath = path.join(directory, 'synthetic-key.pem');
  const encryptedPath = path.join(directory, 'report-encrypted.json');
  await fs.writeFile(privateKeyPath, keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const env = { AUDIT_TARGET: binding.target, AUDIT_REPORT_ENCRYPTION_PUBLIC_KEY: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const archiveReceipt = await retainPinnedAuditArchiveV2({
    reportPath: matched.reportPath, encryptedPath, expectedPublicKeySha256, env,
  });
  const archiveEvidence = { archiveReceipt, encryptedPath, privateKeyPath, expectedPublicKeySha256 };
  const boundArchive = await bindStaging2ReportReadback({ ...matched, archiveEvidence });
  assert.deepEqual(boundArchive, {
    ...reportBinding, archive: { publicKeySha256: expectedPublicKeySha256,
      encryptedBytesSha256: archiveReceipt.encryptedBytesSha256,
      reportBytesSha256: hash(await fs.readFile(matched.reportPath)), savedArchiveDecrypted: true },
  });
  await assert.rejects(bindStaging2ReportReadback({ ...matched, archiveEvidence: {
    ...archiveEvidence, expectedPublicKeySha256: '0'.repeat(64),
  } }), /retention preconditions/);
  const unrelatedArchive = path.join(directory, 'other-report-encrypted.json');
  const unrelatedPair = await pair('other-archive', { ...payload, reportId: 'synthetic-other-archive' });
  const unrelatedReceipt = await retainPinnedAuditArchiveV2({
    reportPath: unrelatedPair.reportPath, encryptedPath: unrelatedArchive, expectedPublicKeySha256, env,
  });
  await assert.rejects(bindStaging2ReportReadback({ ...matched, archiveEvidence: {
    ...archiveEvidence, encryptedPath: unrelatedArchive,
    archiveReceipt: { ...archiveReceipt, encryptedBytesSha256: unrelatedReceipt.encryptedBytesSha256 },
  } }), /decrypted to different report bytes/);

  const keptFiles = { 'accepted.json': bytes(input.acceptance), 'publication.json': bytes(publication),
    'running-image.json': bytes(input.runningImage), 'host-receipt.json': bytes(input.hostReceipt),
    'verification-bundle.json': input.bundleBytes, 'authority.json': authorityBytes,
    'archive-receipt.json': bytes(archiveReceipt), 'key-pin.json': bytes({ publicKeySha256: expectedPublicKeySha256 }) };
  await Promise.all(Object.entries(keptFiles).map(([name, data]) => fs.writeFile(path.join(directory, name), data)));
  await fs.copyFile(matched.reportPath, path.join(directory, 'report.json'));
  await fs.copyFile(matched.readbackPath, path.join(directory, 'receiver-readback.json'));
  const resultPath = path.join(directory, 'archive-binding.json');
  const command = fileURLToPath(new URL('../qualification/bindStaging2ReleaseRegistry.mjs', import.meta.url));
  execFileSync(process.execPath, [command, directory, path.join(directory, 'authority.json'), resultPath,
    '--report-archive', path.join(directory, 'key-pin.json'), privateKeyPath], { stdio: 'pipe' });
  assert.deepEqual(JSON.parse(await fs.readFile(resultPath, 'utf8')), boundArchive);
  assert.deepEqual(await fs.readFile(path.join(directory, 'report.json')), await fs.readFile(matched.reportPath));
  assert.deepEqual(await fs.readFile(path.join(directory, 'receiver-readback.json')), await fs.readFile(matched.readbackPath));
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

test('rejects a registry with incomplete classifications or missing or repeated verification IDs even when its bytes match', async () => {
  for (const [update, reason] of [
    [inventory => { inventory.surfaces.pop(); }, /missing required verification/],
    [inventory => { inventory.surfaces[0].verificationIds.push(inventory.surfaces[0].verificationIds[0]); }, /repeated ID/],
    [inventory => { inventory.surfaces[0].policy = null; }, /classification is incomplete/],
    [inventory => { inventory.surfaces[0].dataEgress = {}; }, /classification is incomplete/],
  ]) {
    const { observation, expected } = await runtimeObservation(update);
    await assert.rejects(compareRuntimeVerification(observation, expected), reason);
  }
});
