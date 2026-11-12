import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import { createFixtureHistoryV2, fixtureNamespaceV2, parseFixtureActorV2, STAGING_FIXTURE_ACTORS_V2 } from './stagingFixturesV2.mjs';

const invalid = () => { throw new Error('Staging fixture storage ownership failed'); };
export function parseStagingFixtureRuntimeMetadataV2(value) {
  const row = proofRecord(value, ['state', 'rootOrigin', 'databaseName', 'expectedDatabaseName', 'hosts', 'replicaSet', 'requireEmailVerification']);
  if (row.state !== 'staging2-fixture-runtime-metadata' || row.rootOrigin !== 'https://staging2.optimallearning.org'
    || row.databaseName !== row.expectedDatabaseName || typeof row.requireEmailVerification !== 'boolean'
    || !Array.isArray(row.hosts) || row.hosts.length !== 1) invalid();
  proofString(row.databaseName, /^[A-Za-z0-9_.-]+$/, 128); proofString(row.replicaSet, /^[A-Za-z0-9_.-]+$/, 128);
  const host = proofRecord(row.hosts[0], ['host', 'port']); if (host.host !== 'mongodb' || host.port !== 27017) invalid();
  return structuredClone(row);
}
export function requireStagingFixtureRuntimeV2({ database, mongoOptions, environment, expectedRuntime }) {
  expectedRuntime = parseStagingFixtureRuntimeMetadataV2(expectedRuntime);
  if (expectedRuntime?.state !== 'staging2-fixture-runtime-metadata'
    || expectedRuntime.rootOrigin !== 'https://staging2.optimallearning.org'
    || auditTargetOrigin(environment.ROOT_URL) !== expectedRuntime.rootOrigin
    || !environment.EXPECTED_MONGO_DB_NAME || database.databaseName !== environment.EXPECTED_MONGO_DB_NAME
    || mongoOptions.dbName !== database.databaseName || expectedRuntime.databaseName !== database.databaseName
    || expectedRuntime.expectedDatabaseName !== database.databaseName || mongoOptions.replicaSet !== expectedRuntime.replicaSet
    || !Array.isArray(mongoOptions.hosts) || mongoOptions.hosts.length !== 1
    || mongoOptions.hosts[0].host !== 'mongodb' || mongoOptions.hosts[0].port !== 27017
    || expectedRuntime.hosts?.length !== 1 || expectedRuntime.hosts[0].host !== 'mongodb' || expectedRuntime.hosts[0].port !== 27017) invalid();
}
function requireScope(input) {
  requireStagingFixtureRuntimeV2(input); fixtureNamespaceV2(input.namespace);
  if (STAGING_FIXTURE_ACTORS_V2.length !== 4 || STAGING_FIXTURE_ACTORS_V2.filter(alias => alias.startsWith('teacher')).length !== 2
    || typeof input.adminUserId !== 'string' || !input.adminUserId || !Number.isSafeInteger(input.startedAt) || input.startedAt < 0) invalid();
}
export async function requireUnusedFixtureNamesV2(input) {
  requireScope(input);
  const names = STAGING_FIXTURE_ACTORS_V2.map(alias => `${input.namespace}-${alias.toLowerCase()}@localhost.invalid`);
  if (await input.database.collection('users').countDocuments({ username: { $in: names } }) !== 0) invalid();
}

// Native creation can insert its account before a connection/login error is
// observed. Recover that exact owner/name/time-bound result instead of retrying
// creation or resetting any account. No raw account record leaves this helper.
export async function findOwnedFixtureActorsV2(input) {
  requireScope(input); const found = [];
  for (const alias of STAGING_FIXTURE_ACTORS_V2) {
    const username = `${input.namespace}-${alias.toLowerCase()}@localhost.invalid`;
    const user = await input.database.collection('users').findOne({ username }, { projection: { _id: 1 } });
    if (!user) continue;
    const actor = parseFixtureActorV2({ alias, userId: user._id, username }, input.namespace);
    if (!await requireOwnedFixtureActorV2(input, actor)) invalid(); found.push(actor);
  }
  return found;
}
export async function requireOwnedFixtureActorV2(input, value) {
  requireScope(input); const actor = parseFixtureActorV2(value, input.namespace);
  if (actor.userId === input.adminUserId) invalid();
  const user = await input.database.collection('users').findOne({ _id: actor.userId }, { projection: {
    _id: 1, username: 1, createdAt: 1, 'profile.createdBy': 1, 'profile.experiment': 1, emails: 1,
  } });
  if (!user) return false;
  if (user.username !== actor.username || user.profile?.createdBy !== input.adminUserId || user.profile.experiment !== false
    || !(user.createdAt instanceof Date) || user.createdAt.getTime() < input.startedAt
    || user.createdAt.getTime() > input.startedAt + 3600000 || !Array.isArray(user.emails) || user.emails.length !== 1
    || user.emails[0].address !== actor.username) invalid();
  return true;
}
function actors(input, complete) {
  if (!Array.isArray(input.actors) || input.actors.length > 4 || complete && input.actors.length !== 4) invalid();
  const parsed = input.actors.map(value => parseFixtureActorV2(value, input.namespace));
  for (const field of ['alias', 'userId', 'username']) if (new Set(parsed.map(row => row[field])).size !== parsed.length) invalid();
  if (complete && STAGING_FIXTURE_ACTORS_V2.some(alias => !parsed.some(row => row.alias === alias))) invalid();
  if (parsed.some(row => row.userId === input.adminUserId)) invalid(); return parsed;
}
const setting = namespace => ({ _id: `${namespace}-setting`, key: `${namespace}-canary`, value: `${namespace}-settings-snapshot` });

export async function seedStagingFixtureDataV2(input) {
  requireScope(input); const owned = actors(input, true);
  if (!Number.isSafeInteger(input.historyNow) || input.historyNow < input.startedAt) invalid();
  for (const actor of owned) if (!await requireOwnedFixtureActorV2(input, actor)) invalid();
  const progress = owned.map(actor => ({ _id: `${input.namespace}-progress-${actor.alias}`, userId: actor.userId, TDFId: `${input.namespace}-lesson` }));
  const histories = owned.filter(actor => actor.alias.startsWith('learner')).map(actor => createFixtureHistoryV2({
    namespace: input.namespace, userId: actor.userId, alias: actor.alias, now: input.historyNow,
  }));
  const canary = setting(input.namespace);
  for (const [name, rows] of [[collectionMongoName('GlobalExperimentStates'), progress], [collectionMongoName('Histories'), histories], [collectionMongoName('DynamicSettings'), [canary]]]) {
    if (await input.database.collection(name).countDocuments({ _id: { $in: rows.map(row => row._id) } }) !== 0) invalid();
  }
  // Verification belongs only to the newly created fixture accounts. The global
  // email-verification policy and every existing account remain unchanged.
  for (const actor of owned) {
    const result = await input.database.collection('users').updateOne({ _id: actor.userId, username: actor.username,
      'profile.createdBy': input.adminUserId }, { $set: { 'emails.0.verified': true } });
    if (result.matchedCount !== 1) invalid();
  }
  for (const [name, rows] of [[collectionMongoName('GlobalExperimentStates'), progress], [collectionMongoName('Histories'), histories], [collectionMongoName('DynamicSettings'), [canary]]]) {
    for (const row of rows) await input.database.collection(name).insertOne(row);
  }
  return { values: { 'lesson.progress': `${input.namespace}-lesson`,
    ...Object.fromEntries(owned.map(actor => [`progress.${actor.alias}`, `${input.namespace}-progress-${actor.alias}`])),
    'performance.learnerB': { numCorrect: 1, numIncorrect: 0, stimsIntroduced: 1, practiceDuration: 750, totalStimCount: 0 },
    'settings.canary': { documentId: canary._id, key: canary.key, value: canary.value } } };
}

export async function removeStagingFixtureDataV2(input) {
  requireScope(input); const owned = actors(input, false);
  // An already removed account is an explicit idempotent cleanup state. A
  // present account with mismatched ownership is never treated as owned.
  for (const actor of owned) await requireOwnedFixtureActorV2(input, actor);
  let removed = 0;
  const remove = async (name, selector) => {
    const collection = input.database.collection(name), result = await collection.deleteOne(selector);
    removed += result.deletedCount;
    if (await collection.findOne({ _id: selector._id }, { projection: { _id: 1 } })) invalid();
  };
  for (const actor of owned) {
    await remove(collectionMongoName('GlobalExperimentStates'), { _id: `${input.namespace}-progress-${actor.alias}`, userId: actor.userId, TDFId: `${input.namespace}-lesson` });
    if (actor.alias.startsWith('learner')) await remove(collectionMongoName('Histories'), {
      _id: `${input.namespace}-history-${actor.alias}`, userId: actor.userId, TDFId: `${input.namespace}-lesson`, anonStudentId: `${input.namespace}-${actor.alias}`,
    });
  }
  await remove(collectionMongoName('DynamicSettings'), setting(input.namespace));
  return { removedFixtureRecordCount: removed };
}
