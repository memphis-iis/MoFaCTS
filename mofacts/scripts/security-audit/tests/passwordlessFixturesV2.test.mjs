import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { passwordlessFixturePlanV2 as plan, seedPasswordlessFixtureV2 as seed,
  inspectPasswordlessFixtureV2 as inspect, removePasswordlessFixtureDataV2 as remove,
  assertProtocolNamespaceEmptyV2 as empty } from '../authentication/passwordlessFixturesV2.mjs';
function fixture(failInsertAt = 0) {
  const namespace = 'mofacts_audit_fixture_0123456789ab', rows = new Map(), writes = [];
  const data = name => { if (!rows.has(name)) rows.set(name, new Map()); return rows.get(name); };
  const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const matches = (row, query) => Object.entries(query).every(([key, value]) => value instanceof RegExp ? value.test(get(row, key))
    : value instanceof Date ? get(row, key)?.getTime() === value.getTime() : get(row, key) === value);
  let inserts = 0;
  const database = { databaseName: 'synthetic-staging', collection(name) { return {
    async findOne(query) { return structuredClone([...data(name).values()].find(row => matches(row, query)) ?? null); },
    async insertOne(row) { if (++inserts === failInsertAt || data(name).has(row._id)) throw Error('Synthetic insertion interruption'); data(name).set(row._id, structuredClone(row)); writes.push(name); return { insertedId: row._id }; },
    async updateOne(query, change) { const row = [...data(name).values()].find(row => matches(row, query)); if (!row) return { matchedCount: 0 };
      for (const [key, value] of Object.entries(change.$set)) { const parts = key.split('.'), last = parts.pop(); parts.reduce((object, part) => object[part], row)[last] = value; } return { matchedCount: 1 }; },
    async deleteOne(query) { const row = [...data(name).values()].find(row => matches(row, query)); if (!row) return { deletedCount: 0 }; data(name).delete(row._id); return { deletedCount: 1 }; },
  }; } };
  const actor = { alias: 'learnerB', userId: 'owned-foreign', username: `${namespace}-learnerb@localhost.invalid` };
  data('users').set(actor.userId, { _id: actor.userId, username: actor.username, createdAt: new Date(1100),
    profile: { createdBy: 'operator', experiment: false }, emails: [{ address: actor.username, verified: false }] });
  data('users').set('existing', { _id: 'existing', username: 'existing@example.test', profile: {} });
  const input = { namespace, adminUserId: 'operator', startedAt: 1000, historyNow: 1200, foreignActor: actor, database,
    mongoOptions: { dbName: database.databaseName, replicaSet: 'staging-rs', hosts: [{ host: 'mongodb', port: 27017 }] },
    environment: { ROOT_URL: 'https://staging2.optimallearning.org', EXPECTED_MONGO_DB_NAME: database.databaseName },
    expectedRuntime: { state: 'staging2-fixture-runtime-metadata', rootOrigin: 'https://staging2.optimallearning.org', databaseName: database.databaseName,
      expectedDatabaseName: database.databaseName, replicaSet: 'staging-rs', hosts: [{ host: 'mongodb', port: 27017 }], requireEmailVerification: true } };
  return { input, data, writes };
}
test('passwordless fixture creates actual progress without a password, email or required experiment markers', async () => {
  const f = fixture(), result = await seed(f.input), p = plan(f.input), user = f.data('users').get(result.participant.userId);
  assert.equal(user.services, undefined); assert.equal(user.emails, undefined); assert.equal(user.profile.experiment, undefined); assert.equal(user.profile.experimentTarget, undefined);
  assert.equal(f.data(collectionMongoName('GlobalExperimentStates')).get(p.progress[0]._id).userId, user._id);
  assert.equal((await inspect(f.input)).ownedRecordCount, 6);
  assert.equal((await remove(f.input)).removedFixtureRecordCount, 5); assert.equal((await remove(f.input)).removedFixtureRecordCount, 0);
  assert.ok(f.data('users').has(user._id)); assert.ok(f.data('users').has('existing'));
});
test('runtime, foreign-owner and collision checks reject before any fixture insertion', async () => {
  for (const mutate of [f => { f.input.environment.ROOT_URL = 'https://production.invalid'; },
    f => { f.data('users').get('owned-foreign').profile.createdBy = 'different'; },
    f => { const p = plan(f.input); f.data('users').set('collision', { _id: 'collision', username: p.participant.username }); },
    f => { const p = plan(f.input); f.data(collectionMongoName('Tdfs')).set('other', { _id: 'other', content: p.roots[0].content }); }]) {
    const f = fixture(); mutate(f); await assert.rejects(seed(f.input)); assert.equal(f.writes.length, 0);
  }
});
test('interrupted seed is recoverable without resetting or removing another account', async () => {
  const f = fixture(4); await assert.rejects(seed(f.input)); assert.equal((await inspect(f.input)).ownedRecordCount, 3);
  assert.equal((await remove(f.input)).removedFixtureRecordCount, 2); assert.ok(f.data('users').has('existing'));
});
test('changed ownership blocks cleanup before deleting any of the remaining records', async () => {
  const f = fixture(); await seed(f.input); const p = plan(f.input);
  f.data(collectionMongoName('Tdfs')).get(p.roots[0]._id).ownerId = 'different';
  await assert.rejects(remove(f.input)); assert.equal(f.data(collectionMongoName('Histories')).size, 1);
});
test('independent empty-namespace proof checks data and account presence without inferring an owner for deletion', async () => {
  const f = fixture(); await assert.rejects(empty(f.input));
  f.data('users').delete('owned-foreign'); assert.equal((await empty(f.input)).state, 'fixture-protocol-namespace-empty');
  f.data('users').set('mail-fixture', { _id: 'mail-fixture', username: `synthetic+${f.input.namespace}-expiry@gmail.com` });
  await assert.rejects(empty(f.input)); f.data('users').delete('mail-fixture');
  const p = plan(f.input); f.data(collectionMongoName('GlobalExperimentStates')).set(p.progress[0]._id, p.progress[0]);
  await assert.rejects(empty(f.input)); assert.equal(f.data(collectionMongoName('GlobalExperimentStates')).size, 1);
});
