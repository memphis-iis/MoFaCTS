// Native execution receipt; deliberately not SourceMeteorTestEvidenceV1, whose
// owner requires genuine GitHub coordinates. Reuse the exact outcome validator.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const [results, app, commit] = process.argv.slice(2);
if (process.argv.length !== 5 || !path.isAbsolute(results) || !path.isAbsolute(app)
  || !/^[0-9a-f]{40}$/.test(commit)) throw Error('Invalid native verification arguments');
const { discoverTestModules, validateRun, MAX_BYTES } = require(path.join(app, 'scripts/meteorTestEvidence.cjs'));
const { parseBuildIdentity } = require(path.join(app, 'common/securityAudit/buildIdentity.ts'));
const { proofRecord, contentDigest } = require(path.join(app, 'common/securityAudit/proofFields.ts'));
const read = name => {
  const file = path.join(results, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES * 2) throw Error('Invalid native evidence file');
  return fs.readFileSync(file);
};
const before = JSON.parse(read('source-before.json'));
const after = JSON.parse(read('source-after.json'));
proofRecord(after, ['state', 'identity', 'testInputContractDigestSha256', 'supplementalDigestSha256']);
parseBuildIdentity(after.identity);
contentDigest(after.testInputContractDigestSha256);
contentDigest(after.supplementalDigestSha256);
if (!isDeepStrictEqual(before, after) || after.state !== 'test-inputs-verified-unqualified'
  || after.identity.baseCommit !== commit || after.identity.includedUncommittedLocalChanges !== false) {
  throw Error('Native source identity changed or is not clean');
}
const raw = read('meteor-run.json');
const run = validateRun(JSON.parse(raw), discoverTestModules(app));
const state = JSON.parse(read('test-state.json'));
if (state.Running || state.OOMKilled || state.ExitCode !== 0) throw Error('Native test container failed');
const isolation = JSON.parse(read('isolation.json'));
if (!isDeepStrictEqual(isolation, { schema: 'NativeIntegrationIsolationV1', dockerSocketAbsent: true,
  workerUid: 2000, effectiveCapabilitiesZero: true, readOnlyMountsVerified: 2, readOnlyFileOperationsRefused: 4, testCopyWritable: true })) {
  throw Error('Native integration isolation was not verified');
}
const imageId = name => {
  const value = read(name).toString('utf8').trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw Error('Invalid native image identity');
  return value;
};
// Limits are observations from Docker, not a repeated statement of intended
// command-line values. Independently require the reviewed lane's exact caps.
const resources = proofRecord(JSON.parse(read('resource-limits.json')), ['worker', 'mongo']);
const resourceLimit = (value, memoryMiB, nanoCpus) => {
  const row = proofRecord(value, ['memoryBytes', 'memorySwapBytes', 'nanoCpus']);
  if (row.memoryBytes !== memoryMiB * 1024 ** 2 || row.memorySwapBytes !== row.memoryBytes || row.nanoCpus !== nanoCpus) {
    throw Error('Native integration resource limits differ from the approved lane');
  }
  return { memoryMiB: row.memoryBytes / 1024 ** 2, cpus: row.nanoCpus / 1e9 };
};
const workerLimits = resourceLimit(resources.worker, 6144, 2e9);
const mongoLimits = resourceLimit(resources.mongo, 384, 0.25e9);
const receipt = {
  schema: 'NativeMeteorVerificationV1', qualification: 'unqualified', provider: 'operator-linux-docker',
  sourceObservation: after,
  // Docker's native image ID may identify an index with the containerd store;
  // it is not necessarily an OCI config digest or release qualification.
  toolImageId: imageId('tool-image-id'),
  mongoImageId: imageId('mongo-image-id'),
  runEvidenceDigestSha256: createHash('sha256').update(raw).digest('hex'),
  toolSourceManifestDigestSha256: createHash('sha256').update(read('tool-source-run-sha256')).digest('hex'),
  isolation,
  startedAt: read('started-at').toString('utf8').trim(),
  finishedAt: read('finished-at').toString('utf8').trim(),
  environments: run.environments.map(({ side, modules, counts, hookFailures }) => ({ side, moduleCount: modules.length, counts, hookFailures })),
  limits: { workerMemoryMiB: workerLimits.memoryMiB, mongoMemoryMiB: mongoLimits.memoryMiB,
    workerCpus: workerLimits.cpus, mongoCpus: mongoLimits.cpus },
};
fs.writeFileSync(path.join(results, 'native-verification.json'), JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(receipt));
