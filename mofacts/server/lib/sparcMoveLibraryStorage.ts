import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import { type MoveEntry, type MoveRequest, type MoveStore } from './sparcMoveLibraryService';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { isSparcAdministrativeRemoval } from './sparcLibraryCurationStorage';

// Typed primitive adapter to the single instructional component collection.
export const SparcMoveLibrary = SparcInstructionalLibrary as unknown as Mongo.Collection<MoveEntry>;
const Requests = new Mongo.Collection<MoveRequest>(collectionMongoName('SparcMoveRequests'));
// Retired projections are only accessed by the explicit user-data deletion owner.
const Exposures = new Mongo.Collection<Record<string, unknown>>(collectionMongoName('SparcMoveExposures'));
const Migrations = new Mongo.Collection<Record<string, unknown>>(collectionMongoName('SparcMoveMigrations'));

export async function removeSparcMoveUserRecords(userId: string) {
  await Requests.removeAsync({ userId });
  await Exposures.removeAsync({ userId });
  await Migrations.removeAsync({ userId });
}

export async function ensureSparcMoveLibraryIndexes() {
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, embeddingModel: 1, _id: 1 });
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, embeddingModel: 1, embeddingVersion: 1, 'context.readingLevel': 1, 'context.responseFormat': 1, _id: 1 });
  await Requests.rawCollection().createIndex({ userId: 1, 'query.tdfId': 1, 'query.context.kind': 1, entryId: 1 });
}
export function createSparcMoveStore(): MoveStore {
  return {
    request: async id => await Requests.findOneAsync(id) ?? undefined,
    async saveRequest(value) {
      // Once accepted, a decision cannot be replaced by a concurrent tab or uncertain retry.
      // One atomic upsert accepts the first decision; duplicate delivery reads it back.
      await Requests.rawCollection().updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true });
      // Complete an existing pending decision without replacing an accepted decision.
      const pending = await Requests.findOneAsync(value._id);
      if (value.entryId && pending && !pending.entryId) await Requests.rawCollection().updateOne(
        { _id: value._id, userId: value.userId, entryId: { $exists: false } },
        { $set: { entryId: value.entryId, source: value.source!, similarity: value.similarity ?? null } });
      const saved = value.entryId && pending && !pending.entryId ? await Requests.findOneAsync(value._id) : pending;
      if (!saved || saved.userId !== value.userId) throw new Error('Primitive decision ownership mismatch');
      return saved;
    },
    entry: async id => await SparcMoveLibrary.findOneAsync(id) ?? undefined,
    async saveEntry(entry) {
      if (await isSparcAdministrativeRemoval(entry._id)) throw new Error('Cannot restore administratively removed content');
      const saved = await SparcMoveLibrary.rawCollection().updateOne({ _id: entry._id }, { $setOnInsert: entry }, { upsert: true });
      if (saved.upsertedCount) await invalidateSparcFigureBrowse();
    },
    list: async (kind, after = '') => SparcMoveLibrary.find({ _id: { $gt: after }, kind: kind ?? { $in: ['feedback', 'explanation', 'richContent', 'question'] } }, { sort: { _id: 1 }, limit: 25 }).fetchAsync(),
    removed: isSparcAdministrativeRemoval,
    async revise(entry) {
      const result = await SparcMoveLibrary.rawCollection().replaceOne({ _id: entry._id }, entry);
      if (!result.matchedCount) throw new Error('This component was deleted. Reload the library.');
      await invalidateSparcFigureBrowse();
    },
  };
}
