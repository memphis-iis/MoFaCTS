import { Mongo } from 'meteor/mongo';
import { randomBytes } from 'crypto';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import type { SparcVisualDecision, SparcFigureLibraryEntry, SparcFigureLibraryStore } from './sparcFigureLibraryService';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { isSparcAdministrativeRemoval } from './sparcLibraryCurationStorage';

// Server-only. No embeddings, situation records, or learner decision ledger are published.
// Typed image adapter; this does not create another collection or repository.
export const SparcFigureLibrary = SparcInstructionalLibrary as unknown as Mongo.Collection<SparcFigureLibraryEntry>;
type LibraryLease = { _id: string; kind: 'lease'; owner: string; expiresAt: Date };
export const SparcFigureRequests = new Mongo.Collection<SparcVisualDecision | LibraryLease>(collectionMongoName('SparcFigureRequests'));

export async function ensureSparcFigureLibraryIndexes() {
  await SparcFigureLibrary.rawCollection().createIndex({ version: 1, imageModel: 1, embeddingModel: 1, dimensions: 1, ready: 1, _id: 1 });
  await SparcFigureLibrary.rawCollection().createIndex({ ready: 1, _id: 1 });
  await SparcFigureRequests.rawCollection().createIndex({ kind: 1, userId: 1, assetId: 1 });
  await SparcFigureRequests.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { kind: 'lease' } });
}

export async function removeSparcFigureAssetMetadata(assetId: string): Promise<void> {
  const removed = await SparcFigureLibrary.removeAsync({ _id: assetId });
  if (removed) await invalidateSparcFigureBrowse();
  await SparcFigureRequests.removeAsync({ kind: 'decision', assetId });
}

export async function removeSparcFigureUserDecisions(userId: string): Promise<void> {
  await SparcFigureRequests.removeAsync({ kind: 'decision', userId });
}

/** Serialize discovery plus generation across replicas so concurrent first encounters share an entry. */
export async function withSparcFigureLibraryLock<T>(work: () => Promise<T>, scope: string = 'generation'): Promise<T> {
  const raw = SparcFigureRequests.rawCollection();
  const lockId = scope !== 'browse' ? `lease:${SPARC_FIGURE_LIBRARY_SETTINGS.version}:${scope}` : 'lease:sparc-figure-browse';
  const owner = randomBytes(16).toString('hex');
  const deadline = Date.now() + 180000;
  for (;;) {
    try {
      const now = new Date();
      const acquired = await raw.updateOne({ _id: lockId, kind: 'lease', expiresAt: { $lte: now } },
        { $set: { kind: 'lease', owner, expiresAt: new Date(Date.now() + 900000) } },
        { upsert: true });
      if (acquired.matchedCount === 1 || acquired.upsertedCount === 1) break;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000) throw error;
    }
    if (Date.now() >= deadline) throw new Error('SPARC figure library generation is busy; retry the saved move');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  try { return await work(); }
  finally { await raw.deleteOne({ _id: lockId, kind: 'lease', owner }); }
}

export function createSparcFigureLibraryStore(): SparcFigureLibraryStore {
  return {
    async inspectEntries(assetIds) {
      if (assetIds.length > SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize) throw new Error('Too many figure inspection identities');
      return await SparcFigureLibrary.find({ ready: true, _id: { $in: assetIds } },
        { fields: { _id: 1, version: 1, imageModel: 1, createdAt: 1 } }).fetchAsync();
    },
    async inspectPage(afterId) {
      return await SparcFigureLibrary.find({ ready: true, _id: { $gt: afterId } },
        { sort: { _id: 1 }, limit: SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1,
          fields: { _id: 1, version: 1, imageModel: 1, createdAt: 1 } }).fetchAsync();
    },
    async findDecision(identity, userId) {
      const decision = await SparcFigureRequests.findOneAsync({ _id: identity, kind: 'decision', userId });
      return decision?.kind === 'decision' ? decision : undefined;
    },
    async saveDecision(decision) {
      await SparcFigureRequests.rawCollection().updateOne({ _id: decision._id }, { $setOnInsert: decision }, { upsert: true });
    },
    async findEntry(assetId) { return await SparcFigureLibrary.findOneAsync(assetId) ?? undefined; },
    async saveEntry(entry) {
      if (await isSparcAdministrativeRemoval(entry._id)) throw new Error('Cannot restore administratively removed content');
      await SparcFigureLibrary.rawCollection().replaceOne({ _id: entry._id }, { ...entry, kind: 'image' } as SparcFigureLibraryEntry, { upsert: true });
      if (entry.ready) await invalidateSparcFigureBrowse();
    },
    async candidates(query) {
      return await SparcFigureLibrary.find({ version: query.version, imageModel: query.imageModel,
        embeddingModel: query.embeddingModel, dimensions: query.dimensions, ready: true,
        _id: { $gt: query.afterId } }, { sort: { _id: 1 }, limit: SPARC_FIGURE_LIBRARY_SETTINGS.batchSize,
        fields: { _id: 1, version: 1, imageModel: 1, embeddingModel: 1, embeddingVersion: 1, dimensions: 1, embedding: 1, ready: 1 } }).fetchAsync();
    },
    withLock: (work, scope) => withSparcFigureLibraryLock(work, scope),
  };
}
