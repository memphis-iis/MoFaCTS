import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import { type MoveEntry, type MoveRequest, type MoveStore } from './sparcMoveLibraryService';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { isSparcAdministrativeRemoval } from './sparcLibraryCurationStorage';
import { sparcCatalogUseKeys } from './sparcContentUse';
import { getSparcContentUseStorage } from './sparcContentUseMongo';

// Typed primitive adapter to the single instructional component collection.
export const SparcMoveLibrary = SparcInstructionalLibrary as unknown as Mongo.Collection<MoveEntry>;
export const SparcMoveRequests = new Mongo.Collection<MoveRequest | Record<string, unknown>>(collectionMongoName('SparcMoveRequests'));
// Retired projections are only accessed by the explicit user-data deletion owner.
const Exposures = new Mongo.Collection<Record<string, unknown>>(collectionMongoName('SparcMoveExposures'));
const Migrations = new Mongo.Collection<Record<string, unknown>>(collectionMongoName('SparcMoveMigrations'));

export async function removeSparcMoveUserRecords(userId: string) {
  await SparcMoveRequests.removeAsync({ userId });
  await Exposures.removeAsync({ userId });
  await Migrations.removeAsync({ userId });
}

export async function ensureSparcMoveLibraryIndexes() {
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, embeddingModel: 1, _id: 1 });
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, embeddingModel: 1, embeddingVersion: 1, 'context.readingLevel': 1, 'context.responseFormat': 1, _id: 1 });
  await SparcMoveLibrary.rawCollection().createIndex({ kind: 1, version: 1, embeddingModel: 1, embeddingVersion: 1, 'context.readingLevel': 1, 'context.supportKind': 1, _id: 1 });
  await SparcMoveLibrary.rawCollection().createIndex({ contentUseKeys: 1, _id: 1 });
  await SparcMoveRequests.rawCollection().createIndex({ userId: 1, 'query.tdfId': 1, 'query.context.kind': 1, entryId: 1 });
  await SparcMoveRequests.rawCollection().createIndex({ userId: 1, contentUseKeys: 1, _id: 1 });
  await SparcMoveRequests.rawCollection().createIndex({ userId: 1, _id: 1 });
}
export async function ensureSparcContentUseForUser(userId: string): Promise<void> { await getSparcContentUseStorage().ensureUser(userId); }
export function createSparcMoveStore(): MoveStore {
  return {
    async request(id) {
      const saved = await SparcMoveRequests.findOneAsync(id);
      if (!saved) return undefined;
      if (typeof saved.userId !== 'string' || !saved.userId.trim() || !saved.query) throw new Error('Saved primitive request is invalid');
      if (saved.entryId && (!Array.isArray(saved.contentUseKeys)
        || !saved.contentUseKeys.some(key => typeof key === 'string' && key.startsWith('payload:')))) {
        // Exact-event reads can precede a vector subscription, especially visual
        // primitives. Initialize from saved evidence before validating restoration.
        await ensureSparcContentUseForUser(saved.userId);
        return (await SparcMoveRequests.findOneAsync(id) ?? undefined) as MoveRequest | undefined;
      }
      return saved as MoveRequest;
    },
    saveRequest: value => getSparcContentUseStorage().saveRequest(value),
    entry: async id => await SparcMoveLibrary.findOneAsync(id) ?? undefined,
    async saveEntry(entry) {
      if (await isSparcAdministrativeRemoval(entry._id)) throw new Error('Cannot restore administratively removed content');
      const saved = await SparcMoveLibrary.rawCollection().updateOne({ _id: entry._id }, { $setOnInsert: { ...entry, contentUseKeys: sparcCatalogUseKeys(entry) } }, { upsert: true });
      if (saved.upsertedCount) await invalidateSparcFigureBrowse();
    },
    list: async (kind, after = '') => SparcMoveLibrary.find({ _id: { $gt: after }, kind: kind ?? { $in: ['instruction', 'feedback', 'explanation', 'richContent', 'question'] } }, { sort: { _id: 1 }, limit: 25 }).fetchAsync(),
    removed: isSparcAdministrativeRemoval,
    async revise(entry) {
      const result = await SparcMoveLibrary.rawCollection().replaceOne({ _id: entry._id }, { ...entry, contentUseKeys: sparcCatalogUseKeys(entry) });
      if (!result.matchedCount) throw new Error('This component was deleted. Reload the library.');
      await invalidateSparcFigureBrowse();
    },
  };
}
