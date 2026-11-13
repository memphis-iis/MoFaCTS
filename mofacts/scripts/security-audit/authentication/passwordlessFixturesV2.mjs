import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { fixtureNamespaceV2, parseFixtureActorV2, createFixtureHistoryV2 } from './stagingFixturesV2.mjs';
import { requireStagingFixtureRuntimeV2, requireOwnedFixtureActorV2 } from './fixtureStorageV2.mjs';

const invalid = () => { throw new Error('Passwordless fixture ownership failed'); };
export async function assertProtocolNamespaceEmptyV2(input) {
  requireStagingFixtureRuntimeV2(input); fixtureNamespaceV2(input.namespace); const n = input.namespace;
  for (const [name, ids] of [['users', [`${n}-participant`]], [collectionMongoName('Tdfs'), [`${n}-lesson`, `${n}-other-lesson`]],
    [collectionMongoName('GlobalExperimentStates'), [`${n}-passwordless-progress`, `${n}-progress-learnerB`]],
    [collectionMongoName('Histories'), [`${n}-history-learnerB`]]]) {
    for (const _id of ids) if (await input.database.collection(name).findOne({ _id }, { projection: { _id: 1 } })) invalid();
  }
  const names = ['learnera', 'learnerb', 'teachera', 'teacherb', 'lockout'].map(alias => `${n}-${alias}@localhost.invalid`);
  names.push(`AUDIT_${n.slice(-12).toUpperCase()}`);
  for (const name of names) if (await input.database.collection('users').findOne({ username: new RegExp(`^${RegExp.escape(name)}$`, 'i') }, { projection: { _id: 1 } })) invalid();
  if (await input.database.collection('users').findOne({ username: new RegExp(`^[^+@]+\\+${RegExp.escape(n)}-(reset|expiry)@gmail\\.com$`, 'i') }, { projection: { _id: 1 } })) invalid();
  return { state: 'fixture-protocol-namespace-empty' };
}
function scope(input) {
  requireStagingFixtureRuntimeV2(input); fixtureNamespaceV2(input.namespace);
  if (typeof input.adminUserId !== 'string' || !input.adminUserId || !Number.isSafeInteger(input.startedAt)
      || input.startedAt < 0 || !Number.isSafeInteger(input.historyNow) || input.historyNow < input.startedAt
      || input.historyNow > input.startedAt + 3600000) invalid();
  const actor = parseFixtureActorV2(input.foreignActor, input.namespace);
  if (actor.alias !== 'learnerB' || actor.userId === input.adminUserId) invalid();
  return actor;
}
export function passwordlessFixturePlanV2(input) {
  const actor = scope(input), n = input.namespace;
  const participant = { userId: `${n}-participant`, username: `AUDIT_${n.slice(-12).toUpperCase()}` };
  const roots = ['a', 'b'].map((side, index) => ({ _id: index === 0 ? `${n}-lesson` : `${n}-other-lesson`, ownerId: input.adminUserId,
    tdfAvailability: 'available', content: { fileName: `${n}-${side}.json`, tdfs: { tutor: {
      setspec: { lessonname: `Synthetic audit ${side}`, experimentTarget: `${n}-target-${side}`, userselect: 'false' },
      unit: [{ unitname: 'Synthetic return', instructions: 'Synthetic audit qualification' }],
    } } } }));
  const user = { _id: participant.userId, username: participant.username, createdAt: new Date(input.historyNow),
    profile: { createdBy: input.adminUserId } };
  const progress = [{ _id: `${n}-passwordless-progress`, userId: participant.userId, TDFId: roots[0]._id,
    experimentState: { currentUnitNumber: 0, lastUnitCompleted: -1, lastActionTimeStamp: input.historyNow } },
  { _id: `${n}-progress-learnerB`, userId: actor.userId, TDFId: roots[0]._id }];
  const history = createFixtureHistoryV2({ namespace: n, userId: actor.userId, alias: 'learnerB', now: input.historyNow });
  return { participant, roots, user, progress, history, foreignActor: actor };
}
function records(plan) {
  return [['users', [plan.user]], [collectionMongoName('Tdfs'), plan.roots],
    [collectionMongoName('GlobalExperimentStates'), plan.progress], [collectionMongoName('Histories'), [plan.history]]];
}
function selector(name, row) {
  if (name === 'users') return { _id: row._id, username: row.username, 'profile.createdBy': row.profile.createdBy, createdAt: row.createdAt };
  if (Object.hasOwn(row, 'ownerId')) return { _id: row._id, ownerId: row.ownerId, 'content.fileName': row.content.fileName };
  return { _id: row._id, userId: row.userId, TDFId: row.TDFId };
}
async function requireExistingOwner(input, name, row) {
  const collection = input.database.collection(name);
  if (!await collection.findOne({ _id: row._id })) return false;
  if (!await collection.findOne(selector(name, row))) invalid();
  return true;
}
export async function requireUnusedPasswordlessFixtureV2(input) {
  const plan = passwordlessFixturePlanV2(input);
  if (!await requireOwnedFixtureActorV2(input, plan.foreignActor)) invalid();
  for (const [name, rows] of records(plan)) for (const row of rows) {
    if (await input.database.collection(name).findOne({ _id: row._id })) invalid();
  }
  if (await input.database.collection('users').findOne({ username: new RegExp(`^${RegExp.escape(plan.participant.username)}$`, 'i') })) invalid();
  for (const root of plan.roots) if (await input.database.collection(collectionMongoName('Tdfs')).findOne({
    'content.tdfs.tutor.setspec.experimentTarget': root.content.tdfs.tutor.setspec.experimentTarget })) invalid();
  return plan;
}
export async function seedPasswordlessFixtureV2(input) {
  const plan = await requireUnusedPasswordlessFixtureV2(input);
  const verified = await input.database.collection('users').updateOne({ _id: plan.foreignActor.userId,
    username: plan.foreignActor.username, 'profile.createdBy': input.adminUserId }, { $set: { 'emails.0.verified': true } });
  if (verified.matchedCount !== 1) invalid();
  for (const [name, rows] of records(plan)) for (const row of rows) await input.database.collection(name).insertOne(row);
  return { state: 'fixture-passwordless-seeded', participant: plan.participant,
    values: { 'lesson.progress': plan.roots[0]._id, 'progress.learnerB': plan.progress[1]._id,
      'performance.learnerB': { numCorrect: 1, numIncorrect: 0, stimsIntroduced: 1, practiceDuration: 750, totalStimCount: 0 },
      'passwordless.experimentTarget': `${input.namespace}-target-a`, 'passwordless.otherExperimentTarget': `${input.namespace}-target-b`,
      'passwordless.participantId': plan.participant.username, 'passwordless.ownProgress': plan.progress[0]._id } };
}
export async function inspectPasswordlessFixtureV2(input) {
  const plan = passwordlessFixturePlanV2(input);
  await requireOwnedFixtureActorV2(input, plan.foreignActor);
  let present = 0;
  let participantPresent = false;
  for (const [name, rows] of records(plan)) for (const row of rows) if (await requireExistingOwner(input, name, row)) {
    present++; if (name === 'users') participantPresent = true;
  }
  return { state: 'fixture-passwordless-ownership-observed', ownedRecordCount: present, participantPresent, participant: plan.participant };
}
export async function removePasswordlessFixtureDataV2(input) {
  const plan = passwordlessFixturePlanV2(input);
  // Inspect all identities before any deletion. The existing guarded account
  // management method owns account/token removal; this helper removes data only.
  await inspectPasswordlessFixtureV2(input);
  let removed = 0;
  for (const [name, rows] of records(plan)) {
    if (name === 'users') continue;
    for (const row of rows) {
      const result = await input.database.collection(name).deleteOne(selector(name, row)); removed += result.deletedCount;
      if (await input.database.collection(name).findOne({ _id: row._id })) invalid();
    }
  }
  return { state: 'fixture-passwordless-data-removed', removedFixtureRecordCount: removed, participant: plan.participant };
}
