import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { requireStagingFixtureRuntimeV2, requireOwnedFixtureActorV2, requireUnusedFixtureNamesV2,
  findOwnedFixtureActorsV2, seedStagingFixtureDataV2, removeStagingFixtureDataV2 } from '../authentication/fixtureStorageV2.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab', startedAt = 1794430000000;
function fixture(options = {}) {
  const actors = ['learnerA', 'learnerB', 'teacherA', 'teacherB'].map(alias => ({ alias, userId: 'FixtureActor' + alias,
    username: `${namespace}-${alias.toLowerCase()}@localhost.invalid` }));
  const rows = new Map(), mutations = [];
  const data = name => { if (!rows.has(name)) rows.set(name, new Map()); return rows.get(name); };
  const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const matches = (row, query) => Object.entries(query).every(([key, value]) => value && typeof value === 'object' && '$in' in value
    ? value.$in.includes(get(row, key)) : get(row, key) === value);
  let inserts = 0;
  const database = { databaseName: 'staging-fixture-db', collection(name) { return {
    async findOne(query) { return structuredClone([...data(name).values()].find(row => matches(row, query)) ?? null); },
    async countDocuments(query) { return [...data(name).values()].filter(row => matches(row, query)).length; },
    async updateOne(query, change) {
      const row = [...data(name).values()].find(row => matches(row, query)); if (!row) return { matchedCount: 0 };
      for (const [key, value] of Object.entries(change.$set)) { const parts = key.split('.'), field = parts.pop();
        parts.reduce((node, part) => node[part], row)[field] = value; }
      mutations.push({ name, action: 'update', id: row._id }); return { matchedCount: 1 };
    },
    async insertOne(row) {
      if (++inserts === options.failInsertAt) throw new Error('Synthetic insertion interruption');
      if (data(name).has(row._id)) throw new Error('Synthetic duplicate ID');
      data(name).set(row._id, structuredClone(row)); mutations.push({ name, action: 'insert', id: row._id }); return { insertedId: row._id };
    },
    async deleteOne(query) { const row = [...data(name).values()].find(row => matches(row, query));
      if (!row) return { deletedCount: 0 }; data(name).delete(row._id); mutations.push({ name, action: 'delete', id: row._id }); return { deletedCount: 1 }; },
  }; } };
  for (const actor of actors) data('users').set(actor.userId, { _id: actor.userId, username: actor.username,
    profile: { createdBy: 'ExistingAdmin', experiment: false }, emails: [{ address: actor.username, verified: false }], createdAt: new Date(startedAt + 1000) });
  data('users').set('ExistingLearner', { _id: 'ExistingLearner', username: 'existing@example.invalid', emails: [{ verified: false }] });
  data(collectionMongoName('Histories')).set('existing-history', { _id: 'existing-history', userId: 'ExistingLearner', time: 1 });
  const input = { namespace, actors, adminUserId: 'ExistingAdmin', startedAt, historyNow: startedAt + 1000, database,
    mongoOptions: { dbName: database.databaseName, replicaSet: 'staging-rs', hosts: [{ host: 'mongodb', port: 27017 }] },
    environment: { ROOT_URL: 'https://staging2.optimallearning.org', EXPECTED_MONGO_DB_NAME: database.databaseName },
    expectedRuntime: { state: 'staging2-fixture-runtime-metadata', rootOrigin: 'https://staging2.optimallearning.org', databaseName: database.databaseName,
      expectedDatabaseName: database.databaseName, replicaSet: 'staging-rs', hosts: [{ host: 'mongodb', port: 27017 }], requireEmailVerification: true } };
  return { input, actors, data, mutations };
}
test('fixture datastore is bound to saved staging2 native driver metadata and rejects other targets before writes', () => {
  for (const change of [value => { value.environment.ROOT_URL = 'https://production.invalid'; },
    value => { value.mongoOptions.hosts[0].host = 'remote-db.invalid'; }, value => { value.mongoOptions.dbName = 'other'; },
    value => { value.mongoOptions.replicaSet = 'other'; }, value => { value.expectedRuntime.databaseName = 'other'; },
    value => { value.environment.EXPECTED_MONGO_DB_NAME = ''; }]) {
    const value = fixture(); change(value.input); assert.throws(() => requireStagingFixtureRuntimeV2(value.input)); assert.equal(value.mutations.length, 0);
  }
});
test('native ownership discovery is bounded and never recovers or mutates a foreign or old account', async () => {
  const value = fixture(); assert.equal((await findOwnedFixtureActorsV2(value.input)).length, 4);
  await assert.rejects(requireUnusedFixtureNamesV2(value.input));
  const target = value.data('users').get(value.actors[0].userId); target.profile.createdBy = 'OtherAdmin';
  await assert.rejects(findOwnedFixtureActorsV2(value.input)); assert.equal(value.mutations.length, 0);
  target.profile.createdBy = 'ExistingAdmin'; target.createdAt = new Date(startedAt - 1);
  await assert.rejects(requireOwnedFixtureActorV2(value.input, value.actors[0]));
  value.data('users').delete(value.actors[0].userId);
  assert.equal(await requireOwnedFixtureActorV2(value.input, value.actors[0]), false);
});
test('seeding and idempotent data cleanup touch exactly seven new records and the four owned email-verification flags', async () => {
  const value = fixture(), before = structuredClone(value.data('users').get('ExistingLearner'));
  const seeded = await seedStagingFixtureDataV2(value.input);
  assert.deepEqual(seeded.values['performance.learnerB'], { numCorrect: 1, numIncorrect: 0, stimsIntroduced: 1, practiceDuration: 750, totalStimCount: 0 });
  assert.equal(value.mutations.filter(row => row.action === 'update').length, 4);
  assert.equal(value.mutations.filter(row => row.action === 'insert').length, 7);
  assert.deepEqual(await removeStagingFixtureDataV2(value.input), { removedFixtureRecordCount: 7 });
  assert.deepEqual(await removeStagingFixtureDataV2(value.input), { removedFixtureRecordCount: 0 });
  assert.deepEqual(value.data('users').get('ExistingLearner'), before);
  assert.equal(value.data(collectionMongoName('Histories')).get('existing-history').userId, 'ExistingLearner');
  assert(value.actors.every(actor => value.data('users').get(actor.userId).emails[0].verified === true));
});
test('collisions and swapped identities fail before verification or data changes; cleanup preserves foreign collided rows', async () => {
  const value = fixture(), progress = value.data(collectionMongoName('GlobalExperimentStates'));
  const foreign = { _id: `${namespace}-progress-learnerA`, userId: 'ExistingLearner', TDFId: 'existing-lesson' }; progress.set(foreign._id, foreign);
  await assert.rejects(seedStagingFixtureDataV2(value.input)); assert.equal(value.mutations.length, 0);
  await assert.rejects(removeStagingFixtureDataV2(value.input)); assert.deepEqual(progress.get(foreign._id), foreign);
  const swapped = fixture(); swapped.input.actors[0] = { ...swapped.actors[0], userId: 'ExistingLearner' };
  await assert.rejects(seedStagingFixtureDataV2(swapped.input)); assert.equal(swapped.mutations.length, 0);
});
test('partial insertion failure retains the same owner manifest and can remove only its actually inserted rows', async () => {
  const value = fixture({ failInsertAt: 3 }); await assert.rejects(seedStagingFixtureDataV2(value.input));
  assert.deepEqual(await removeStagingFixtureDataV2(value.input), { removedFixtureRecordCount: 2 });
  assert(value.data('users').has('ExistingLearner'));
  assert(value.data(collectionMongoName('Histories')).has('existing-history'));
});
