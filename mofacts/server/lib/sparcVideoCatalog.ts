import { stableMoveJson } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { withSparcFigureLibraryLock } from './sparcFigureLibraryStorage';
import { selectSparcLibraryVideo } from './sparcVideoLibraryService';
import { SPARC_EMBEDDING_MODEL } from '../../common/lib/sparcEmbeddingModel';
import { parseSparcVideoSegment, SPARC_VIDEO_EMBEDDING_VERSION, type SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import { searchSparcVideo, fetchSparcVideoCaptions } from './sparcVideoProviders';
import { createSparcVideoCatalog, type VideoSource, type VideoTargetState, type VideoCatalogStore } from './sparcVideoCatalogService';
import { isSparcAdministrativeRemoval, readSparcAdministrativeRemovals } from './sparcLibraryCurationStorage';
export { sparcVideoCatalogTargets } from './sparcVideoCatalogService';
const Sources = new Mongo.Collection<VideoSource>(collectionMongoName('SparcVideoTranscripts'));
const Targets = new Mongo.Collection<VideoTargetState>(collectionMongoName('SparcVideoCatalogTargets'));

/** Preparation artifacts are separate from the single shared instructional content collection. */
export async function ensureSparcVideoCatalogIndexes() {
  await Targets.rawCollection().createIndex({ tdfId: 1, pageId: 1, targetId: 1 });
  await SparcInstructionalLibrary.rawCollection().createIndex({ kind: 1, embeddingVersion: 1, embeddingModel: 1, 'content.video.language': 1, _id: 1 });
}
export function createMongoSparcVideoCatalog(deps: Pick<Parameters<typeof createSparcVideoCatalog>[0], 'credentials' | 'embed'>) {
  const store: VideoCatalogStore = {
    target: async id => await Targets.findOneAsync(id) ?? undefined,
    source: async id => await Sources.findOneAsync(id) ?? undefined,
    async insertTarget(value) { await Targets.rawCollection().updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true }); },
    async insertSource(value) { await Sources.rawCollection().updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true }); },
    async updateSource(id, value) { await Sources.updateAsync(id, { $set: value }); },
    async segmentIds(ids) { return ids.length ? [...(await SparcInstructionalLibrary.find({ _id: { $in: ids } }, { fields: { _id: 1 } }).fetchAsync()).map(row => row._id), ...await readSparcAdministrativeRemovals(ids)] : []; },
    async insertSegments(entries) { if (entries.length) await SparcInstructionalLibrary.rawCollection().bulkWrite(entries.map(entry => ({ updateOne: { filter: { _id: entry._id }, update: { $setOnInsert: entry }, upsert: true } }))); },
    async associate(ids, target) {
      if (ids.length) await SparcInstructionalLibrary.rawCollection().updateMany({ _id: { $in: ids } },
        { $addToSet: { origins: { tdfId: target.tdfId, pageId: target.pageId, targetId: target.targetId, targetKind: target.targetKind, text: target.text } } });
    },
    withLock: withSparcFigureLibraryLock, invalidate: invalidateSparcFigureBrowse,
  };
  return createSparcVideoCatalog({ ...deps, store, search: searchSparcVideo, captions: fetchSparcVideoCaptions,
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)) });
}

/** Video retrieval owns selection; the text model never receives a catalog-ID menu. */
export async function findSparcLibraryVideo(vector: number[], language: string, minimumSimilarity: number) {
  return selectSparcLibraryVideo({ vector, language, minimumSimilarity, page: async after =>
    await SparcInstructionalLibrary.find({ kind: 'video', embeddingVersion: SPARC_VIDEO_EMBEDDING_VERSION,
      embeddingModel: SPARC_EMBEDDING_MODEL, 'content.video.language': language, _id: { $gt: after } },
      { fields: { _id: 1, embedding: 1, 'content.video': 1 }, sort: { _id: 1 }, limit: 100 }).fetchAsync()
      .then(rows => rows.map(row => ({ _id: row._id, embedding: row.embedding,
        content: { video: parseSparcVideoSegment('content' in row ? row.content.video : null) } }))) });
}
/** One indexed batch per candidate page; deliberately removed sources cannot be selected. */
export async function sparcVideoReuseStatus(videos: readonly SparcVideoSegment[]): Promise<Map<string, boolean>> {
  for (const video of videos) parseSparcVideoSegment(video);
  const rows = videos.length ? await SparcInstructionalLibrary.find({ kind: 'video', _id: { $in: videos.map(video => video.segmentId) } },
    { fields: { _id: 1, 'content.video': 1 } }).fetchAsync() : [];
  const byId = new Map(rows.map(row => [row._id, row]));
  const result = new Map<string, boolean>();
  for (const video of videos) {
    const entry = byId.get(video.segmentId);
    if (!entry && await isSparcAdministrativeRemoval(video.segmentId)) { result.set(video.segmentId, false); continue; }
    if (!entry || !('content' in entry) || stableMoveJson(entry.content.video) !== stableMoveJson(video)) throw new Error('Saved video catalog passage is missing or changed');
    result.set(video.segmentId, true);
  }
  return result;
}
