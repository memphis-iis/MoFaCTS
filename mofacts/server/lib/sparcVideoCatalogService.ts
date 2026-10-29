import { createHash } from 'crypto';
import { SPARC_EMBEDDING_MODEL } from '../../common/lib/sparcEmbeddingModel';
import { supportsSparcVideoCatalog } from '../../common/lib/sparcVideoCatalog';
import { normalizeSparcFigureEmbedding } from '../../common/lib/sparcFigureLibrary';
import { parseSparcVideoSegment, sparcVideoPassages, SPARC_VIDEO_EMBEDDING_VERSION,
  type SparcVideoCaption, type SparcVideoRange } from '../../../learning-components/runtime/sparcVideo';
import { SparcVideoUnavailable, type searchSparcVideo, type fetchSparcVideoCaptions } from './sparcVideoProviders';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type CatalogTarget = { id: string; tdfId: string; pageId: string; targetId: string; targetKind: string; text: string; topic: string; language: string };
export type VideoSource = { _id: string; videoId: string; title: string; channel: string; language: string; captions?: SparcVideoCaption[];
  jobId?: string; ranges?: SparcVideoRange[]; complete?: boolean };
export type VideoTargetState = CatalogTarget & { _id: string; sourceId?: string };
export type VideoCatalogEntry = { _id: string; kind: 'video'; version: string; embeddingVersion: string; embeddingModel: string;
  contentUseKeys?: string[];
  embedding: number[]; content: { text: string; video: import('../../../learning-components/runtime/sparcVideo').SparcVideoSegment };
  createdAt: Date; requirements: string; move: string; target: string };
export interface VideoCatalogStore {
  target(id: string): Promise<VideoTargetState | undefined>; source(id: string): Promise<VideoSource | undefined>;
  insertTarget(value: VideoTargetState): Promise<void>; insertSource(value: VideoSource): Promise<void>;
  updateSource(id: string, value: Partial<VideoSource>): Promise<void>;
  segmentIds(ids: string[]): Promise<string[]>; insertSegments(entries: VideoCatalogEntry[]): Promise<void>;
  associate(ids: string[], target: CatalogTarget): Promise<void>;
  withLock<T>(work: () => Promise<T>, key: string): Promise<T>; invalidate(): Promise<void>;
}

export function sparcVideoCatalogTargets(tdfId: string, tdf: Record<string, any>): CatalogTarget[] {
  if (!supportsSparcVideoCatalog(tdf)) throw new Error('Video catalogs are available only for SPARC AutoTutor systems');
  const settings = tdf?.content?.tdfs?.tutor?.setspec;
  const language = settings?.contentLanguage;
  if (typeof language !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) throw new Error('Set the package contentLanguage before building its video catalog');
  const topic = settings?.lessonname;
  if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) throw new Error('Video catalog requires the authored lesson topic');
  const pages = tdf.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(pages)) throw new Error('This package has no SPARC targets');
  const targets: CatalogTarget[] = [];
  for (const page of pages) {
    const authored = page?.display?.autoTutorTargets;
    if (!authored) continue;
    for (const [targetKind, rows, identity] of [['expectation', authored.expectations, 'clusterKC'], ['misconception', authored.misconceptions, 'id']] as const) {
      if (!Array.isArray(rows)) throw new Error('Invalid authored SPARC targets');
      for (const row of rows) {
        const targetId = row?.[identity], text = row?.text, pageId = page.pageId;
        if (typeof targetId !== 'string' || !targetId || typeof text !== 'string' || !text.trim() || text.length > 2048 || typeof pageId !== 'string' || !pageId) throw new Error('Invalid video-catalog target');
        targets.push({ id: digest([tdfId, pageId, targetKind, targetId, text, topic, language]), tdfId, pageId, targetId, targetKind, text, topic, language });
      }
    }
  }
  if (!targets.length || targets.length > 1000) throw new Error('Video preparation requires 1 to 1000 authored targets');
  return targets;
}

export function createSparcVideoCatalog(deps: { store: VideoCatalogStore; search: typeof searchSparcVideo; captions: typeof fetchSparcVideoCaptions; wait(ms: number): Promise<void>; credentials(): { youtubeApiKey: string; supadataApiKey: string };
  embed(texts: string[], tdfId: string): Promise<number[][]> }) {
  const store = deps.store;
  return {
    async prepare(target: CatalogTarget) {
      return store.withLock(async () => {
        let state = await store.target(target.id);
        if (!state) {
          try {
            const keys = deps.credentials();
            const video = await deps.search(keys.youtubeApiKey, target.text, target.language);
            const sourceId = digest([video.videoId, target.language]);
            await store.insertSource({ _id: sourceId, ...video, language: target.language });
            await store.insertTarget({ _id: target.id, ...target, sourceId });
            state = await store.target(target.id);
          } catch (error) {
            if (!(error instanceof SparcVideoUnavailable)) throw error;
            return { status: 'failed' as const, reason: error.message };
          }
        }
        if (!state?.sourceId) throw new Error('Video target has no saved source');
        return store.withLock(async () => {
          let source = await store.source(state.sourceId!);
          if (!source) throw new Error('Saved video source is missing');
          if (!source.captions) {
            try {
              const result = await store.withLock(async () => {
                try { return await deps.captions(deps.credentials().supadataApiKey, source!.videoId, target.language, source!.jobId); }
                finally { await deps.wait(1100); }
              }, 'video-caption-provider');
              if ('jobId' in result) {
                await store.updateSource(source._id, { jobId: result.jobId });
                return { status: 'pending' as const };
              }
              const captions = result.captions;
              await store.updateSource(source._id, { captions });
              source = { ...source, captions };
            } catch (error) {
              if (!(error instanceof SparcVideoUnavailable)) throw error;
              return { status: 'failed' as const, reason: error.message };
            }
          }
          return { status: source.complete ? 'complete' as const : 'segment' as const, sourceId: source._id,
            videoId: source.videoId, title: source.title, captions: source.complete ? [] : source.captions!,
            ...(source.ranges ? { ranges: source.ranges } : {}) };
        }, `video-source:${state.sourceId}`);
      }, `video-target:${target.id}`);
    },
    async save(target: CatalogTarget, ranges: SparcVideoRange[]) {
      const state = await store.target(target.id);
      if (!state?.sourceId) throw new Error('Prepare this video target before selecting passages');
      return store.withLock(async () => {
        const source = await store.source(state.sourceId!);
        if (!source?.captions) throw new Error('The selected video has no usable saved transcript');
        if (source.ranges && JSON.stringify(source.ranges) !== JSON.stringify(ranges)) throw new Error('Resume the saved video passage selection');
        const passages = sparcVideoPassages(source.captions, ranges);
        if (!passages.length) return { passages: 0 };
        await store.updateSource(source._id, { ranges });
        const videos = passages.map(passage => parseSparcVideoSegment({
          segmentId: digest([source.videoId, source.language, passage.startSeconds, passage.endSeconds, passage.transcript]),
          videoId: source.videoId, title: source.title, channel: source.channel, language: source.language, ...passage,
        }));
        const existing = new Set(await store.segmentIds(videos.map(video => video.segmentId)));
        const missing = videos.filter(video => !existing.has(video.segmentId));
        for (let offset = 0; offset < missing.length; offset += 32) {
          const batch = missing.slice(offset, offset + 32);
          const vectors = await deps.embed(batch.map(video => video.transcript), target.tdfId);
          if (vectors.length !== batch.length) throw new Error('Video embedding batch is incomplete');
          await store.insertSegments(batch.map((video, index) => ({
            _id: video.segmentId, kind: 'video', version: SPARC_VIDEO_EMBEDDING_VERSION, embeddingVersion: SPARC_VIDEO_EMBEDDING_VERSION,
            embeddingModel: SPARC_EMBEDDING_MODEL, embedding: normalizeSparcFigureEmbedding(vectors[index]!),
            content: { text: video.transcript, video }, createdAt: new Date(),
            requirements: JSON.stringify({ text: video.transcript }), move: 'catalog-video', target: target.text,
          })));
        }
        await store.associate(videos.map(video => video.segmentId), target);
        await store.updateSource(source._id, { complete: true });
        if (passages.length) await store.invalidate();
        return { passages: passages.length };
      }, `video-source:${state.sourceId}`);
    },
  };
}
