const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const app = path.resolve(__dirname, '../../mofacts');
const { discoverTestModules } = require(path.join(app, 'scripts/meteorTestEvidence.cjs'));
const commit = 'a'.repeat(40);
const observation = () => ({
  state: 'test-inputs-verified-unqualified',
  identity: { schema: 'BuildIdentityV1', baseCommit: commit, includedUncommittedLocalChanges: false, sourceSnapshotDigestSha256: 'b'.repeat(64) },
  testInputContractDigestSha256: 'c'.repeat(64), supplementalDigestSha256: 'd'.repeat(64),
});
function fixture(changes = () => {}) {
  const modules = discoverTestModules(app);
  const run = { schema: 'MeteorTestRunEvidenceV1', exitStatus: 0, environments: ['server', 'client'].map(side => ({
    schema: 'MeteorEnvironmentEvidenceV1', side, modules: modules[side],
    tests: [{ id: '1'.repeat(64), outcome: 'passed' }, { id: '2'.repeat(64), outcome: 'pending' }],
    hookFailures: 0, counts: { passed: 1, failed: 0, pending: 1 },
  })) };
  const records = { 'source-before.json': observation(), 'source-after.json': observation(),
    'meteor-run.json': run, 'test-state.json': { Running: false, OOMKilled: false, ExitCode: 0 },
    'resource-limits.json': {
      worker: { memoryBytes: 6144 * 1024 ** 2, memorySwapBytes: 6144 * 1024 ** 2, nanoCpus: 2e9 },
      mongo: { memoryBytes: 384 * 1024 ** 2, memorySwapBytes: 384 * 1024 ** 2, nanoCpus: 0.25e9 },
    },
    'isolation.json': { schema: 'NativeIntegrationIsolationV1', dockerSocketAbsent: true,
      workerUid: 2000, effectiveCapabilitiesZero: true, readOnlyMountsVerified: 2, readOnlyFileOperationsRefused: 4, testCopyWritable: true } };
  changes(records);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-native-receipt-fixture-'));
  try {
    for (const [name, value] of Object.entries(records)) fs.writeFileSync(path.join(root, name), JSON.stringify(value));
    for (const name of ['tool-image-id', 'mongo-image-id']) fs.writeFileSync(path.join(root, name), 'sha256:' + '3'.repeat(64));
    for (const name of ['started-at', 'finished-at']) fs.writeFileSync(path.join(root, name), '2026-11-06T00:00:00Z');
    fs.writeFileSync(path.join(root, 'tool-source-run-sha256'), 'synthetic tool source manifest');
    const invoke = () => spawnSync(process.execPath, [path.join(__dirname, 'record-native.cjs'), root, app, commit], { encoding: 'utf8' });
    const result = invoke();
    const file = path.join(root, 'native-verification.json');
    return { result, receipt: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : undefined,
      repeatedStatus: result.status === 0 ? invoke().status : undefined };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('native receipt preserves pending outcomes and cannot overwrite evidence', () => {
  const { result, receipt, repeatedStatus } = fixture();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(receipt.qualification, 'unqualified');
  assert.equal(receipt.environments[1].counts.pending, 1);
  assert.equal(Object.hasOwn(receipt, 'ci'), false);
  assert.equal(receipt.toolImageId, 'sha256:' + '3'.repeat(64));
  assert.equal(receipt.mongoImageId, 'sha256:' + '3'.repeat(64));
  assert.equal(Object.hasOwn(receipt, 'toolImageConfig'), false);
  assert.equal(Object.hasOwn(receipt, 'mongoImageConfig'), false);
  assert.deepEqual(receipt.limits, { workerMemoryMiB: 6144, mongoMemoryMiB: 384, workerCpus: 2, mongoCpus: 0.25 });
  assert.notEqual(repeatedStatus, 0);
});

test('native receipt rejects missing, contradictory or excessive Docker resource limits', () => {
  for (const mutate of [
    records => { delete records['resource-limits.json']; },
    records => { records['resource-limits.json'].worker.memoryBytes = 4096 * 1024 ** 2; },
    records => { records['resource-limits.json'].worker.memorySwapBytes = 8192 * 1024 ** 2; },
    records => { records['resource-limits.json'].worker.nanoCpus = 3e9; },
    records => { records['resource-limits.json'].mongo.memoryBytes = 512 * 1024 ** 2; },
  ]) {
    const { result, receipt } = fixture(mutate);
    assert.notEqual(result.status, 0); assert.equal(receipt, undefined);
  }
});
test('native receipt rejects source changes, dirty identity and malformed source digests', () => {
  for (const mutate of [
    records => { records['source-after.json'].supplementalDigestSha256 = 'e'.repeat(64); },
    records => { for (const name of ['source-before.json', 'source-after.json']) records[name].identity.includedUncommittedLocalChanges = true; },
    records => { for (const name of ['source-before.json', 'source-after.json']) records[name].identity.sourceSnapshotDigestSha256 = 'invalid'; },
  ]) {
    const { result, receipt } = fixture(mutate);
    assert.notEqual(result.status, 0);
    assert.equal(receipt, undefined);
  }
});
test('native receipt rejects missing modules, failures and out-of-memory execution', () => {
  for (const mutate of [
    records => { records['meteor-run.json'].environments[0].modules.pop(); },
    records => { records['meteor-run.json'].environments[0].tests[0].outcome = 'failed'; },
    records => { records['test-state.json'].OOMKilled = true; },
    records => { records['isolation.json'].dockerSocketAbsent = false; },
  ]) {
    const { result, receipt } = fixture(mutate);
    assert.notEqual(result.status, 0);
    assert.equal(receipt, undefined);
  }
});
