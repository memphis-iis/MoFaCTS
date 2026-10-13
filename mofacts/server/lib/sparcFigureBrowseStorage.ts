import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import type { SparcFigureLibraryEntry } from './sparcFigureLibraryService';
import type { BrowseMember, BrowseSnapshot, BrowseSource, SparcFigureBrowseStore } from './sparcFigureBrowseService';

type BrowseDoc = { _id: string; kind: 'state' | 'snapshot' | 'member'; revision?: number; current?: string;
  snapshotId?: string; clusterId?: string; assetId?: string; similarity?: number; snapshot?: BrowseSnapshot; expiresAt?: Date };
export const SparcFigureBrowse = new Mongo.Collection<BrowseDoc>(collectionMongoName('SparcFigureBrowse'));
export async function ensureSparcFigureBrowseIndexes() {
  await SparcFigureBrowse.rawCollection().createIndex({ kind: 1, snapshotId: 1, clusterId: 1, similarity: -1, assetId: 1 });
  await SparcFigureBrowse.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
export async function invalidateSparcFigureBrowse() {
  await SparcFigureBrowse.rawCollection().updateOne({ _id: 'state' },
    { $inc: { revision: 1 }, $setOnInsert: { kind: 'state' } }, { upsert: true });
}
export function createSparcFigureBrowseStore(library: Mongo.Collection<SparcFigureLibraryEntry>,
  withLock: SparcFigureBrowseStore['withLock']): SparcFigureBrowseStore {
  return {
    withLock,
    async state() {
      await SparcFigureBrowse.rawCollection().updateOne({ _id: 'state' }, { $setOnInsert: { kind: 'state', revision: 0 } }, { upsert: true });
      const state = await SparcFigureBrowse.findOneAsync('state');
      if (!state || !Number.isSafeInteger(state.revision) || state.revision! < 0) throw new Error('Invalid figure browsing revision state');
      return { revision: state.revision!, ...(state.current ? { current: state.current } : {}) };
    },
    async snapshot(id) { return (await SparcFigureBrowse.findOneAsync({ _id: id, kind: 'snapshot' }))?.snapshot; },
    async sourcePage(afterId) {
      return await library.find({ ready: true, _id: { $gt: afterId } }, { sort: { _id: 1 }, limit: SPARC_FIGURE_LIBRARY_SETTINGS.batchSize,
        fields: { _id: 1, version: 1, embeddingModel: 1, dimensions: 1, embedding: 1, situation: 1 } }).fetchAsync() as BrowseSource[];
    },
    async addMembers(members) {
      await SparcFigureBrowse.rawCollection().insertMany(members.map(member => ({ ...member, kind: 'member' as const,
        _id: `${member.snapshotId}-${member.assetId}`, expiresAt: new Date(Date.now() + 86400000) })));
    },
    async publish(snapshot) {
      await SparcFigureBrowse.insertAsync({ _id: snapshot.snapshotId, kind: 'snapshot', snapshot,
        snapshotId: snapshot.snapshotId, expiresAt: new Date(Date.now() + 86400000) });
      const prior = await SparcFigureBrowse.findOneAsync('state');
      await SparcFigureBrowse.rawCollection().updateMany({ snapshotId: snapshot.snapshotId }, { $unset: { expiresAt: '' } });
      const result = await SparcFigureBrowse.rawCollection().updateOne({ _id: 'state', revision: snapshot.sourceRevision },
        { $set: { current: snapshot.snapshotId } });
      if (result.matchedCount !== 1) return false;
      if (prior?.current) await SparcFigureBrowse.rawCollection().updateMany({ snapshotId: prior.current },
        { $set: { expiresAt: new Date(Date.now() + 1800000) } });
      return true;
    },
    async discard(snapshotId) {
      if ((await SparcFigureBrowse.findOneAsync('state'))?.current !== snapshotId) await SparcFigureBrowse.removeAsync({ snapshotId });
    },
    async members(snapshotId, clusterId, cursor) {
      const selector = { kind: 'member' as const, snapshotId, clusterId,
        ...(cursor ? { $or: [{ similarity: { $lt: cursor.similarity } }, { similarity: cursor.similarity, assetId: { $gt: cursor.assetId } }] } : {}) };
      const rows = await SparcFigureBrowse.find(selector, { sort: { similarity: -1, assetId: 1 },
        limit: SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1,
        fields: { _id: 0, snapshotId: 1, clusterId: 1, assetId: 1, similarity: 1 } }).fetchAsync();
      return rows as BrowseMember[];
    },
  };
}
