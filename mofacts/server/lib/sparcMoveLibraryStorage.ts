import { Mongo } from 'meteor/mongo';
import type { ClientSession } from 'mongodb';
import { moveExposuresFromHistory } from './sparcMoveExposureProjection';
import { collectionMongoName } from '../../common/collectionOwnership';
import { moveDigest, type MoveEntry, type MoveRequest, type MoveExposure, type MoveStore } from './sparcMoveLibraryService';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { isSparcAdministrativeRemoval, SparcInstructionalRemovals } from './sparcLibraryCurationStorage';

// Typed primitive adapter to the single instructional component collection.
export const SparcMoveLibrary = SparcInstructionalLibrary as unknown as Mongo.Collection<MoveEntry>;
const Requests = new Mongo.Collection<MoveRequest>(collectionMongoName('SparcMoveRequests'));
const Exposures = new Mongo.Collection<MoveExposure>(collectionMongoName('SparcMoveExposures'));
const Manifests = new Mongo.Collection<{ _id: string; move: string; entries: string[] }>(collectionMongoName('SparcMoveManifests'));
const Leases = new Mongo.Collection<{ _id: string; token: string; expiresAt: Date }>(collectionMongoName('SparcMoveLeases'));

const Migrations = new Mongo.Collection<{ _id: string; userId: string; tdfId: string; after: string; complete: boolean }>(collectionMongoName('SparcMoveMigrations'));

async function saveMoveManifest(value: MoveExposure, session?: ClientSession, rebuilding = false) {
  if (value.kind !== 'question' && !rebuilding) return;
  const options = session ? { session } : {};
  const questionId = moveDigest([value.userId, value.tdfId, value.sessionId, value.eventId, 'question']);
  const request = await Requests.rawCollection().findOne({ _id: questionId }, options);
  if (!request) return; // Historical questions predate the shared move contract.
  const expected = request.query.context.components;
  const event = await Exposures.rawCollection().find({ userId: value.userId, tdfId: value.tdfId, sessionId: value.sessionId, eventId: value.eventId }, options).toArray();
  const entries = expected.map(kind => event.find(e => e.kind === kind)?.entryId);
  if (entries.some(id => !id)) {
    // Backfill reads by history ID, not presentation order. The last component completes the manifest.
    if (rebuilding) return;
    throw new Error('A completed move is missing a primitive presentation');
  }
  const manifest = { move: request.query.context.move, entries: entries as string[] };
  if (await SparcInstructionalRemovals.rawCollection().findOne({ _id: { $in: manifest.entries } }, options)) return;
  await Manifests.rawCollection().updateOne({ _id: moveDigest(manifest) }, { $setOnInsert: manifest }, { upsert: true, ...options });
}

export async function projectSparcMoveHistory(records: readonly Record<string, unknown>[], session?: ClientSession, rebuilding = false) {
  for (const row of records) for (const exposure of moveExposuresFromHistory(row)) {
    const entry = await SparcMoveLibrary.rawCollection().findOne({ _id: exposure.entryId }, session ? { session } : {});
    // Question vectors describe the stem; an assignment's option order does not change it.
    if (entry?.questionEmbedding?.text === exposure.content.text) exposure.questionEmbedding = entry.questionEmbedding;
    await Exposures.rawCollection().updateOne({ _id: exposure._id }, { $setOnInsert: exposure }, { upsert: true, ...(session ? { session } : {}) });
    await saveMoveManifest(exposure, session, rebuilding);
  }
}

export async function removeSparcMoveUserRecords(userId: string) {
  await Requests.removeAsync({ userId });
  await Exposures.removeAsync({ userId });
  await Migrations.removeAsync({ userId });
}

export async function ensureSparcMoveLibraryIndexes() {
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, embeddingModel: 1, _id: 1 });
  await Manifests.rawCollection().createIndex({ entries: 1 });
  await Exposures.rawCollection().createIndex({ userId: 1, tdfId: 1 });
  await Requests.rawCollection().createIndex({ userId: 1, 'query.tdfId': 1, 'query.context.kind': 1, entryId: 1 });
  await Leases.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
export function createSparcMoveStore(readHistory: (userId: string, tdfId: string, after: string) => Promise<Record<string, unknown>[]>): MoveStore {
  return {
    request: async id => await Requests.findOneAsync(id) ?? undefined,
    async saveRequest(value) {
      // Once accepted, a decision cannot be replaced by a concurrent tab or uncertain retry.
      await Requests.rawCollection().updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true });
      if (value.entryId) await Requests.rawCollection().updateOne({ _id: value._id, userId: value.userId, entryId: { $exists: false } },
        { $set: { entryId: value.entryId, source: value.source!, similarity: value.similarity ?? null } });
      const saved = await Requests.findOneAsync(value._id);
      if (!saved || saved.userId !== value.userId) throw new Error('Primitive decision ownership mismatch');
      return saved;
    },
    entry: async id => await SparcMoveLibrary.findOneAsync(id) ?? undefined,
    async saveEntry(entry) {
      if (await isSparcAdministrativeRemoval(entry._id)) throw new Error('Cannot restore administratively removed content');
      const saved = await SparcMoveLibrary.rawCollection().updateOne({ _id: entry._id }, { $setOnInsert: entry }, { upsert: true });
      if (saved.upsertedCount) await invalidateSparcFigureBrowse();
    },
    candidates: async (kind, embeddingModel, after) => SparcMoveLibrary.find({ kind, embeddingModel, _id: { $gt: after } }, { sort: { _id: 1 }, limit: 100 }).fetchAsync(),
    async reservedQuestions(userId, tdfId) {
      // Accepted questions reserve their task even if presentation is interrupted in another tab.
      return Requests.rawCollection().aggregate<MoveExposure>([
        { $match: { userId, 'query.tdfId': tdfId, 'query.context.kind': 'question', entryId: { $exists: true } } },
        { $lookup: { from: collectionMongoName('SparcInstructionalLibrary'), localField: 'entryId', foreignField: '_id', as: 'entry' } },
        { $unwind: '$entry' },
        { $project: { _id: 1, userId: 1, tdfId: '$query.tdfId', sessionId: '$query.sessionId', eventId: '$query.eventId',
          kind: { $literal: 'question' }, nodeId: { $concat: ['$query.eventId', ':question'] }, entryId: 1, content: '$entry.content', questionEmbedding: '$entry.questionEmbedding' } },
      ]).toArray();
    },
    async exposures(userId, tdfId) {
      // Existing rows migrate once in bounded, restartable pages. New journal writes project atomically.
      const id = moveDigest([userId, tdfId]);
      let checkpoint = await Migrations.findOneAsync(id);
      while (!checkpoint?.complete) {
        const rows = await readHistory(userId, tdfId, checkpoint?.after ?? '');
        await projectSparcMoveHistory(rows, undefined, true);
        const after = rows.length ? String(rows.at(-1)!._id) : checkpoint?.after ?? '';
        const complete = rows.length < 100;
        await Migrations.rawCollection().updateOne({ _id: id }, { $setOnInsert: { userId, tdfId }, $max: { after, complete } }, { upsert: true });
        checkpoint = await Migrations.findOneAsync(id);
      }
      return Exposures.find({ userId, tdfId }).fetchAsync();
    },
    async expose(value) {
      await Exposures.rawCollection().updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true });
      await saveMoveManifest(value);
    },
    async acquire(key, token) {
      try {
        const result = await Leases.rawCollection().updateOne({ _id: key, $or: [{ token }, { expiresAt: { $lte: new Date() } }] },
          { $set: { token, expiresAt: new Date(Date.now() + 900000) } }, { upsert: true });
        return result.matchedCount === 1 || result.upsertedCount === 1;
      } catch (error) { if ((error as { code?: number }).code === 11000) return false; throw error; }
    },
    async release(key, token) { await Leases.removeAsync({ _id: key, token }); },
    list: async (kind, after = '') => SparcMoveLibrary.find({ _id: { $gt: after }, kind: kind ?? { $in: ['feedback', 'explanation', 'richContent', 'question'] } }, { sort: { _id: 1 }, limit: 25 }).fetchAsync(),
    removed: isSparcAdministrativeRemoval,
    async saveQuestionEmbedding(id, questionEmbedding, location) {
      if (location === 'entry') await SparcMoveLibrary.rawCollection().updateOne({ _id: id }, { $set: { questionEmbedding } });
      else await Exposures.rawCollection().updateOne({ _id: id }, { $set: { questionEmbedding } });
    },
    async revise(entry) {
      const result = await SparcMoveLibrary.rawCollection().replaceOne({ _id: entry._id }, entry);
      if (!result.matchedCount) throw new Error('This component was deleted. Reload the library.');
      await invalidateSparcFigureBrowse();
    },
  };
}
