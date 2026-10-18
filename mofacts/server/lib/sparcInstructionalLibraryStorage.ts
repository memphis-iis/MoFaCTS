import { Mongo, MongoInternals } from 'meteor/mongo';
import { transferInstructionalBatch } from './sparcInstructionalLibraryMigration';
import { collectionMongoName } from '../../common/collectionOwnership';
import type { MoveEntry } from './sparcMoveLibraryService';
import type { SparcFigureLibraryEntry } from './sparcFigureLibraryService';
import type { VideoCatalogEntry } from './sparcVideoCatalogService';

export type InstructionalLibraryEntry = MoveEntry | VideoCatalogEntry | (SparcFigureLibraryEntry & { kind: 'image' });
/** One content collection. Figure and primitive stores are typed adapters to this owner. */
export const SparcInstructionalLibrary = new Mongo.Collection<InstructionalLibraryEntry>(collectionMongoName('SparcInstructionalLibrary'));

/** Forward-only, transactional transfer: IDs, vectors, versions and references are unchanged.
 * A batch is removed from its old collection only after an identical destination is verified.
 * A failed batch rolls back; completed batches make restart idempotent. No old read path remains.
 */
export async function consolidateSparcInstructionalLibrary(progress: (source: string, count: number) => void) {
  const mongo = MongoInternals.defaultRemoteCollectionDriver().mongo;
  const target = SparcInstructionalLibrary.rawCollection();
  for (const name of ['sparc_figure_library', 'sparc_move_library'] as const) {
    const source = mongo.db.collection<{ _id: string; [key: string]: unknown }>(name);
    let transferred = 0;
    for (;;) {
      const session = mongo.client.startSession();
      let count = 0;
      try {
        await session.withTransaction(async () => {
          const batch = await source.find({}, { session }).sort({ _id: 1 }).limit(100).toArray();
          count = batch.length;
          await transferInstructionalBatch(name, batch, {
            async insert(entry) { await target.updateOne({ _id: String(entry._id) }, { $setOnInsert: entry as InstructionalLibraryEntry }, { upsert: true, session }); },
            async read(id) { return await target.findOne({ _id: id }, { session }); },
            async remove(id) { await source.deleteOne({ _id: id }, { session }); },
          });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } finally { await session.endSession(); }
      transferred += count;
      if (count) progress(name, transferred);
      if (count < 100) break;
    }
  }
}
