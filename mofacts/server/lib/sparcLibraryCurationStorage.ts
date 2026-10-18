import { Mongo, MongoInternals } from 'meteor/mongo';
import type { ClientSession } from 'mongodb';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';

type Removal = { _id: string; removedAt: Date; removeAsset?: true; cleanupKind?: string };
/** IDs only, not an archive: distinguishes deliberate deletion from corruption or storage failure. */
export const SparcInstructionalRemovals = new Mongo.Collection<Removal>(collectionMongoName('SparcInstructionalRemovals'));
const mongoManifestCollection = () => MongoInternals.defaultRemoteCollectionDriver().mongo.db.collection(collectionMongoName('SparcMoveManifests'));
export const isSparcAdministrativeRemoval = async (id: string) => Boolean(await SparcInstructionalRemovals.findOneAsync(id, { fields: { _id: 1 } }));
export async function readSparcAdministrativeRemovals(ids: string[]) {
  return (await SparcInstructionalRemovals.find({ _id: { $in: ids } }, { fields: { _id: 1 }, limit: 100 }).fetchAsync()).map(row => row._id);
}

/** Called in the same transaction as a revision, or from the deletion owner below. */
export async function deleteSparcInstructionalEntries(ids: string[], session: ClientSession) {
  if (!ids.length || ids.length > 100) throw new Error('Invalid instructional deletion batch');
  await SparcInstructionalRemovals.rawCollection().bulkWrite(ids.map(_id => ({ updateOne: {
    filter: { _id }, update: { $setOnInsert: { removedAt: new Date() } }, upsert: true,
  } })), { session });
  await SparcInstructionalLibrary.rawCollection().deleteMany({ _id: { $in: ids } }, { session });
  // Manifests are shared retrieval metadata, not learner history or accepted decisions.
  await mongoManifestCollection().deleteMany({ entries: { $in: ids } }, { session });
}

export function createSparcLibraryCuration(removeAsset: (id: string) => Promise<void>) {
  const cleanupAssets = async () => {
    for (;;) {
      const rows = await SparcInstructionalRemovals.find({ removeAsset: true }, { limit: 100 }).fetchAsync();
      for (const row of rows) {
        await removeAsset(row._id);
        await SparcInstructionalRemovals.updateAsync(row._id, { $unset: { removeAsset: '' } });
      }
      if (rows.length < 100) return;
    }
  };
  const remove = async (id: string) => {
    const entry = await SparcInstructionalLibrary.findOneAsync(id);
    const receipt = await SparcInstructionalRemovals.findOneAsync(id);
    if (!entry && !receipt) throw new Error('Instructional component not found');
    const mongo = MongoInternals.defaultRemoteCollectionDriver().mongo;
    const transaction = async (work: (session: ClientSession) => Promise<void>) => {
      const session = mongo.client.startSession();
      try { await session.withTransaction(() => work(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
      finally { await session.endSession(); }
    };
    const kind = entry?.kind ?? receipt?.cleanupKind;
    if (entry) await transaction(async session => {
      await deleteSparcInstructionalEntries([id], session);
      await SparcInstructionalRemovals.rawCollection().updateOne({ _id: id }, { $set: { cleanupKind: entry.kind } }, { session });
    });
    const removeDependents = async (selector: Record<string, unknown>) => {
      for (;;) {
        let count = 0;
        await transaction(async session => {
          const rows = await SparcInstructionalLibrary.rawCollection().find(selector, { session, projection: { _id: 1 } }).limit(100).toArray();
          count = rows.length;
          if (count) await deleteSparcInstructionalEntries(rows.map(row => row._id), session);
        });
        if (count < 100) return;
      }
    };
    if (kind === 'video') await removeDependents({ 'content.video.segmentId': id });
    if (kind === 'image') {
      await removeDependents({ 'content.figure.assetId': id });
      await SparcInstructionalRemovals.updateAsync(id, { $set: { removeAsset: true } });
    }
    await invalidateSparcFigureBrowse();
    await cleanupAssets();
    await SparcInstructionalRemovals.updateAsync(id, { $unset: { cleanupKind: '' } });
  };
  return {
    remove,
    /** Forward migration: delete false, unset the retired flag on survivors. Restartable, bounded pages. */
    async migrateExclusions(progress: (deleted: number) => void) {
      const raw = SparcInstructionalLibrary.rawCollection();
      await raw.createIndex({ reusable: 1, _id: 1 });
      await raw.createIndex({ 'content.figure.assetId': 1, _id: 1 });
      await raw.createIndex({ 'content.video.segmentId': 1, _id: 1 });
      await SparcInstructionalRemovals.rawCollection().createIndex({ cleanupKind: 1, _id: 1 });
      await SparcInstructionalRemovals.rawCollection().createIndex({ removeAsset: 1, _id: 1 });
      await mongoManifestCollection().createIndex({ entries: 1 });
      for (;;) {
        const pending = await SparcInstructionalRemovals.find({ cleanupKind: { $exists: true } }, { limit: 100 }).fetchAsync();
        for (const receipt of pending) await remove(receipt._id);
        if (pending.length < 100) break;
      }
      let deleted = 0;
      for (;;) {
        const rows = await raw.find({ reusable: false }, { projection: { _id: 1 } }).limit(100).toArray();
        for (const row of rows) { await remove(row._id); deleted++; progress(deleted); }
        if (rows.length < 100) break;
      }
      // Retire the old image revision layout, retaining only each current image as a
      // standalone item. This is a one-time forward data transformation, not a read path.
      const mongo = MongoInternals.defaultRemoteCollectionDriver().mongo;
      for (;;) {
        const rows = await raw.find({ kind: 'image', currentAssetId: { $exists: true } }).limit(100).toArray();
        for (const old of rows) {
          const current = String((old as unknown as { currentAssetId: string }).currentAssetId);
          if (!/^[a-zA-Z0-9]{1,20}$/.test(current)) throw new Error('Invalid current image in retired revision data');
          const entry = { ...old, _id: current } as unknown as Record<string, unknown>;
          for (const key of ['currentAssetId', 'revision', 'reusable', 'previousEntryId']) delete entry[key];
          const session = mongo.client.startSession();
          try { await session.withTransaction(async () => {
            if (current !== old._id) {
              if (await raw.findOne({ _id: current }, { session })) throw new Error('Image revision retirement identity conflict');
              await raw.insertOne(entry as typeof old, { session });
              await deleteSparcInstructionalEntries([old._id], session);
              await SparcInstructionalRemovals.rawCollection().updateOne({ _id: old._id }, { $set: { cleanupKind: 'image' } }, { session });
            } else await raw.replaceOne({ _id: old._id }, entry as typeof old, { session });
          }); } finally { await session.endSession(); }
          if (current !== old._id) await remove(old._id);
        }
        if (rows.length < 100) break;
      }
      const retired = mongo.db.collection<{ _id: string }>('sparc_figure_versions');
      for (;;) {
        const rows = await retired.find({}, { projection: { _id: 1 } }).limit(100).toArray();
        if (!rows.length) break;
        const current = new Set((await raw.find({ kind: 'image', _id: { $in: rows.map(row => row._id) } }, { projection: { _id: 1 } }).toArray()).map(row => row._id));
        const obsolete = rows.filter(row => !current.has(row._id));
        const session = mongo.client.startSession();
        try { await session.withTransaction(async () => {
          if (obsolete.length) await SparcInstructionalRemovals.rawCollection().bulkWrite(obsolete.map(row => ({ updateOne: {
            filter: { _id: row._id }, update: { $setOnInsert: { removedAt: new Date() }, $set: { cleanupKind: 'image' } }, upsert: true,
          } })), { session });
          await retired.deleteMany({ _id: { $in: rows.map(row => row._id) } }, { session });
        }); } finally { await session.endSession(); }
        for (const row of obsolete) await remove(row._id);
      }
      for (;;) {
        const rows = await raw.find({ $or: [{ reusable: { $exists: true } }, { previousEntryId: { $exists: true } }, { revision: { $exists: true } }] }, { projection: { _id: 1 } }).limit(100).toArray();
        if (rows.length) await raw.updateMany({ _id: { $in: rows.map(row => row._id) } }, { $unset: { reusable: '', previousEntryId: '', revision: '' } });
        if (rows.length < 100) break;
      }
      await cleanupAssets();
      return deleted;
    },
  };
}
