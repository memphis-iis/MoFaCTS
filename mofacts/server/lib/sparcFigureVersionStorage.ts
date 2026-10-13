import { Mongo, MongoInternals } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { currentSparcFigureAssetId } from './sparcFigureLibraryService';
import { SparcFigureLibrary } from './sparcFigureLibraryStorage';
import type { SparcFigureVersion, SparcFigureVersionStore } from './sparcFigureVersions';

// Immutable admitted versions. Pending uploads are private assets, never history or candidates.
export const SparcFigureVersions = new Mongo.Collection<SparcFigureVersion>(collectionMongoName('SparcFigureVersions'));
export async function ensureSparcFigureVersionIndexes() {
  await SparcFigureVersions.rawCollection().createIndex({ libraryId: 1, revision: -1 }, { unique: true });
}
/** Called only by the existing explicit administrative asset purge, never by replacement. */
export async function removeSparcFigureVersionMetadata(assetId: string) {
  await SparcFigureVersions.removeAsync({ $or: [{ _id: assetId }, { libraryId: assetId }] });
}
export function createSparcFigureVersionStore(): SparcFigureVersionStore {
  return {
    async find(assetId) { return await SparcFigureVersions.findOneAsync(assetId) ?? undefined; },
    async history(libraryId, beforeRevision) {
      return await SparcFigureVersions.find({ libraryId, revision: { $lt: beforeRevision } },
        { sort: { revision: -1 }, limit: SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1 }).fetchAsync();
    },
    async publish(params) {
      const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          const library = SparcFigureLibrary.rawCollection(); const versions = SparcFigureVersions.rawCollection();
          const entry = await library.findOne({ _id: params.libraryId, ready: true }, { session });
          if (!entry) throw new Meteor.Error(404, 'Completed library image not found');
          const existing = await versions.findOne({ _id: params.assetId }, { session });
          if (existing) {
            if (existing.libraryId !== params.libraryId || existing.replacementIdentity !== params.identity) throw new Meteor.Error(409, 'Replacement identity collision');
            // A retry does not rewind a newer replacement.
            result = entry; return;
          }
          if (currentSparcFigureAssetId(entry) !== params.expectedAssetId) throw new Meteor.Error(409, 'This image has changed. Reload the library before replacing it.');
          const revision = (entry.revision ?? 0) + 1;
          if (revision === 1) await versions.insertOne({ _id: entry._id, libraryId: entry._id, revision: 0, createdAt: entry.createdAt }, { session });
          await versions.insertOne({ _id: params.assetId, libraryId: entry._id, revision, previousAssetId: params.expectedAssetId,
            createdAt: new Date(), createdBy: params.userId, replacementIdentity: params.identity }, { session });
          // Snapshot transaction conflicts prevent concurrent editors from losing either history or pointer.
          await library.updateOne({ _id: entry._id, ready: true }, { $set: { currentAssetId: params.assetId, revision } }, { session });
          result = { ...entry, currentAssetId: params.assetId, revision };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        return result!;
      } finally { await session.endSession(); }
    },
  };
}
