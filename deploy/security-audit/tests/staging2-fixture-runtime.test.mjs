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
