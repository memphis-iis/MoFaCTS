import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalAuditJson } from '../../../mofacts/common/securityAudit/canonicalReport.ts';
import { runStagingFixtureStorageActionV2 } from '../staging2-fixture-runtime.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
function fixture() {
  const calls = [], expectedRuntime = { state: 'staging2-fixture-runtime-metadata', rootOrigin: 'https://staging2.optimallearning.org',
    databaseName: 'fixture-db', expectedDatabaseName: 'fixture-db', hosts: [{ host: 'mongodb', port: 27017 }], replicaSet: 'fixture-rs', requireEmailVerification: true };
  const runtime = { database: { databaseName: 'fixture-db', collection(name) { assert.equal(name, 'users'); return {
    async findOne(query, options) { calls.push({ query, options }); return { _id: 'KnownOperator' }; },
  }; } }, mongoOptions: { dbName: 'fixture-db', hosts: [{ host: 'mongodb', port: 27017 }], replicaSet: 'fixture-rs' },
  environment: { ROOT_URL: 'https://staging2.optimallearning.org', EXPECTED_MONGO_DB_NAME: 'fixture-db' } };
  return { runtime, calls, payload: { namespace, expectedRuntime, username: 'ExistingOperator@localhost.invalid' } };
}

test('reset cleanup observes only its exact account and token selectors and never reads a token document', async () => {
  const f = fixture(), queries = [];
  const recipient = `operator+${namespace}-reset@gmail.com`;
  f.runtime.database.collection = name => ({ async countDocuments(selector) { queries.push({ name, selector }); return 0; } });
  const { username, ...base } = f.payload; void username;
  const payload = { ...base, recipient, userId: 'OwnedFixture', startedAt: 1000, deadlineMs: 2000 };
  const result = await runStagingFixtureStorageActionV2('reset-observe', payload, f.runtime);
  assert.equal(result.accountAbsent, true); assert.equal(result.resetStateAbsent, true);
  assert.deepEqual(queries.at(-1), { name: 'passwordResetTokens', selector: { $or: [{ userId: 'OwnedFixture' }, { email: recipient }] } });
  assert.equal(JSON.stringify(result).includes(recipient), false);
  queries.length = 0;
  await assert.rejects(runStagingFixtureStorageActionV2('reset-observe', { ...payload, recipient: 'existing@gmail.com' }, f.runtime));
  assert.equal(queries.length, 0);
});

test('reset account observation checks the returned identity, creation window and verified address without reading services', async () => {
  const f = fixture(), recipient = `operator+${namespace}-reset@gmail.com`, { username, ...base } = f.payload; void username;
  let row = { _id: 'OwnedFixture', createdAt: new Date(1500), profile: { experiment: false }, emails: [{ address: recipient, verified: true }] };
  f.runtime.database.collection = name => {
    assert.equal(name, 'users');
    return { async countDocuments() { return 1; }, async findOne(selector, options) {
      assert.deepEqual(selector, { _id: 'OwnedFixture', username: recipient });
      assert.equal(Object.keys(options.projection).includes('services'), false); return row;
    } };
  };
  const payload = { ...base, recipient, userId: 'OwnedFixture', startedAt: 1000, deadlineMs: 2000 };
  assert.equal((await runStagingFixtureStorageActionV2('reset-observe', payload, f.runtime)).emailVerified, true);
  row = { ...row, createdAt: new Date(999) };
  await assert.rejects(runStagingFixtureStorageActionV2('reset-observe', payload, f.runtime));
  await assert.rejects(runStagingFixtureStorageActionV2('reset-observe', { ...payload, userId: null }, f.runtime));
});
test('operator identity lookup reads only the exact canonical credential identifier and returns no account document', async () => {
  const value = fixture(), result = await runStagingFixtureStorageActionV2('operator', value.payload, value.runtime);
  assert.equal(result.state, 'fixture-operator-identity-observed'); assert.equal(result.userId, 'KnownOperator');
  assert(Number.isSafeInteger(result.startedAt));
  assert.deepEqual(value.calls, [{ query: { username: 'existingoperator@localhost.invalid' }, options: { projection: { _id: 1 } } }]);
  assert(!JSON.stringify(result).includes('localhost.invalid'));
});
test('unknown actions, extra credential fields, wrong namespaces and runtime overrides are rejected before any query', async () => {
  const value = fixture();
  await assert.rejects(runStagingFixtureStorageActionV2('delete-any-user', value.payload, value.runtime));
  await assert.rejects(runStagingFixtureStorageActionV2('operator', { ...value.payload, password: 'must-not-be-stored' }, value.runtime));
  await assert.rejects(runStagingFixtureStorageActionV2('operator', { ...value.payload, namespace: 'existing' }, value.runtime));
  await assert.rejects(runStagingFixtureStorageActionV2('operator', value.payload, { ...value.runtime, adminUserId: 'Override' }));
  assert.equal(value.calls.length, 0);
});
test('subprocess failure emits only a fixed rejection and never raw payload, connection or credential diagnostics', () => {
  const script = fileURLToPath(new URL('../staging2-fixture-runtime.mjs', import.meta.url));
  const input = canonicalAuditJson({ secret: 'must-not-appear-in-diagnostics' }) + '\n';
  for (const args of [[], ['operator', 'extra'], ['unrecognized'], ['operator']]) {
    const result = spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), '{"state":"fixture-storage-rejected"}');
  }
});
