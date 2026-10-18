import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_INSTRUCTIONAL_COMPONENT_KINDS, isSparcInstructionalComponentKind } from '../../common/lib/sparcInstructionalLibrary';
import type { InstructionalLibraryEntry } from './sparcInstructionalLibraryStorage';
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
export function createSparcFigureBrowseStore(library: Mongo.Collection<InstructionalLibraryEntry>,
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
      const rows = await library.rawCollection().find({ _id: { $gt: afterId }, $or: [
        { kind: 'image', ready: true }, { kind: { $in: SPARC_INSTRUCTIONAL_COMPONENT_KINDS.filter(kind => kind !== 'image') } },
      ] }, { projection: { _id: 1, kind: 1, version: 1, embeddingVersion: 1, embeddingModel: 1, dimensions: 1, embedding: 1, situation: 1, requirements: 1 } })
        .sort({ _id: 1 }).limit(SPARC_FIGURE_LIBRARY_SETTINGS.batchSize).toArray();
      return rows.map(row => {
        // Storage-specific source fields serve display labels only, never a second embedding.
        const target = 'situation' in row ? JSON.parse(row.situation).target : JSON.parse(row.requirements);
        const authored = target.selectedMisconception ?? target;
        const targetTexts = row.kind === 'image' ? target.texts : Array.isArray(authored) ? authored : [authored.text];
        return { _id: row._id, kind: row.kind, version: row.version, embeddingVersion: row.embeddingVersion, embeddingModel: row.embeddingModel,
          dimensions: row.embedding.length, embedding: row.embedding, targetTexts };
      }) as BrowseSource[];
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
      // Read the existing component type from its owner. Cached membership keeps
      // only semantic assignment; changing display order needs no re-clustering.
      const rows = await SparcFigureBrowse.rawCollection().aggregate<BrowseMember & Pick<BrowseSource, 'kind'>>([
        { $match: { kind: 'member', snapshotId, clusterId } },
        { $lookup: { from: collectionMongoName('SparcInstructionalLibrary'), localField: 'assetId', foreignField: '_id',
          pipeline: [{ $project: { _id: 0, kind: 1 } }], as: 'component' } },
        { $unwind: { path: '$component', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, snapshotId: 1, clusterId: 1, assetId: 1, similarity: 1, kind: '$component.kind' } },
        ...(cursor ? [{ $match: { $or: [
          { kind: { $gt: cursor.kind } },
          { kind: cursor.kind, similarity: { $lt: cursor.similarity } },
          { kind: cursor.kind, similarity: cursor.similarity, assetId: { $gt: cursor.assetId } },
        ] } }] : []),
        { $sort: { kind: 1, similarity: -1, assetId: 1 } },
        { $limit: SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1 },
      ]).toArray();
      if (rows.some(row => !isSparcInstructionalComponentKind(row.kind))) {
        throw new Error('Grouped instructional component is missing or has an invalid type');
      }
      return rows;
    },
  };
}
