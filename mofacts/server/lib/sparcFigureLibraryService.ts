import { normalizeSparcFigureEmbedding, sparcFigureCosineSimilarity, SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import type { OpenRouterUsageSummary } from '../../common/lib/openRouterClient';
import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { parseSparcVideoSegment, type SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import type { SparcVideoMatch } from './sparcVideoLibraryService';

export type SparcFigureLibraryEntry = {
  _id: string; kind?: 'image'; version: string; imageModel: string; embeddingModel: string; dimensions: number;
  situation: string; embedding: number[]; ready: boolean; createdAt: Date;
  embeddingVersion?: string;
  generation?: { imagePrompt: string; tutorMessage: string; description: string; displayWidth: number };
};
export type SparcVisualDecision = {
  _id: string; kind: 'decision'; userId: string; tdfId: string; sessionId: string;
  /** Existing image decision key; for video this holds the catalog segment identity. */
  assetId: string; source: 'generated' | 'semantic'; similarity: number | null; createdAt: Date;
  video?: SparcVideoSegment;
};
export type SparcFigureLibraryStore = {
  inspectEntries: (assetIds: string[]) => Promise<SparcFigureInspection[]>;
  inspectPage: (afterId: string) => Promise<SparcFigureInspection[]>;
  findDecision: (identity: string, userId: string) => Promise<SparcVisualDecision | undefined>;
  saveDecision: (decision: SparcVisualDecision) => Promise<void>;
  findEntry: (assetId: string) => Promise<SparcFigureLibraryEntry | undefined>;
  saveEntry: (entry: SparcFigureLibraryEntry) => Promise<void>;
  candidates: (query: { version: string; imageModel: string; embeddingModel: string; dimensions: number; afterId: string }) => Promise<SparcFigureLibraryEntry[]>;
  withLock: <T>(work: () => Promise<T>, scope?: string) => Promise<T>;
};
export type SparcFigureInspection = Pick<SparcFigureLibraryEntry, '_id' | 'version' | 'imageModel' | 'createdAt'>;
type SparcVisualLibraryResult = { assetId: string; source: 'resume' | 'semantic' | 'generated'; similarity: number | null;
  video?: SparcVideoSegment;
  usage?: OpenRouterUsageSummary | undefined; embeddingUsage?: OpenRouterUsageSummary | undefined };

/** One exact cosine search, paged on the server; no similarity reranker or critic call. */
export async function selectSparcLibraryFigure(store: SparcFigureLibraryStore, embedding: number[], minimumSimilarity: number) {
  const query = { version: SPARC_FIGURE_LIBRARY_SETTINGS.version, imageModel: SPARC_PROMPT_IMAGE_SETTINGS.model,
    embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel, dimensions: embedding.length, afterId: '' };
  let best: { entry: SparcFigureLibraryEntry; similarity: number } | undefined;
  for (;;) {
    const page = await store.candidates(query);
    for (const entry of page) {
      if (entry._id <= query.afterId || !entry.ready || entry.dimensions !== embedding.length
        || entry.version !== query.version || entry.imageModel !== query.imageModel || entry.embeddingModel !== query.embeddingModel) {
        throw new Error('SPARC figure library returned an invalid candidate page');
      }
      if (entry.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Instructional library embeddings require reindexing');
      const similarity = sparcFigureCosineSimilarity(embedding, entry.embedding);
      if (similarity >= minimumSimilarity && (!best || similarity > best.similarity)) best = { entry, similarity };
    }
    if (page.length < SPARC_FIGURE_LIBRARY_SETTINGS.batchSize) return best;
    query.afterId = page[page.length - 1]!._id;
  }
}

export async function getOrGenerateSparcLibraryVisual(params: {
  store: SparcFigureLibraryStore; identity: string; assetId: string; userId: string; tdfId: string; sessionId: string;
  situation: string; imagePrompt: string; tutorMessage: string; description: string; displayWidth: number;
  minimumSimilarity: number;
  embed: (input: string) => Promise<{ vector: number[]; usage?: OpenRouterUsageSummary }>;
  generate: (entry: SparcFigureLibraryEntry) => Promise<{ usage?: OpenRouterUsageSummary }>;
  findVideo: (vector: number[]) => Promise<SparcVideoMatch | undefined>;
}): Promise<SparcVisualLibraryResult> {
  const { store } = params;
  const prior = await store.findDecision(params.identity, params.userId);
  const resume = (decision: SparcVisualDecision): SparcVisualLibraryResult => {
    if (decision.video && decision.assetId !== decision.video.segmentId) throw new Error('Saved visual resource identity mismatch');
    return { assetId: decision.assetId, source: 'resume', similarity: decision.similarity,
      ...(decision.video ? { video: parseSparcVideoSegment(decision.video) } : {}) };
  };
  if (prior) return resume(prior);
  let embedding: number[] | undefined;
  let embeddingUsage: OpenRouterUsageSummary | undefined;
  const acceptMatch = async (match: { entry: SparcFigureLibraryEntry; similarity: number }): Promise<SparcVisualLibraryResult> => {
    await store.saveDecision({ _id: params.identity, kind: 'decision', userId: params.userId,
      tdfId: params.tdfId, sessionId: params.sessionId, assetId: match.entry._id,
      source: 'semantic', similarity: match.similarity, createdAt: new Date() });
    const accepted = await store.findDecision(params.identity, params.userId);
    if (!accepted) throw new Error('SPARC figure library did not persist the selected figure');
    return { ...resume(accepted), source: 'semantic', embeddingUsage };
  };
  if (!await store.findEntry(params.assetId)) {
    const embedded = await params.embed(params.situation);
    embedding = normalizeSparcFigureEmbedding(embedded.vector);
    embeddingUsage = embedded.usage;
    const videoMatch = await params.findVideo(embedding);
    if (videoMatch) {
        const video = parseSparcVideoSegment(videoMatch.video);
        if (!Number.isFinite(videoMatch.similarity) || videoMatch.similarity < params.minimumSimilarity || videoMatch.similarity > 1) throw new Error('Video retrieval returned an ineligible match');
        await store.saveDecision({ _id: params.identity, kind: 'decision', userId: params.userId,
          tdfId: params.tdfId, sessionId: params.sessionId, assetId: video.segmentId, video,
          source: 'semantic', similarity: videoMatch.similarity, createdAt: new Date() });
        const accepted = await store.findDecision(params.identity, params.userId);
        if (!accepted) throw new Error('SPARC visual library did not persist the selected video');
        return { ...resume(accepted), source: 'semantic', embeddingUsage };
    }
    const match = await selectSparcLibraryFigure(store, embedding, params.minimumSimilarity);
    if (match) return await acceptMatch(match);
  }
  // Warm retrievals run concurrently. Only a miss or interrupted generation acquires the lease.
  return store.withLock(async () => {
    const resumed = await store.findDecision(params.identity, params.userId);
    if (resumed) return { ...resume(resumed), embeddingUsage };
    // A durable pending entry keeps the original situation and brief after provider/storage failure.
    let entry = await store.findEntry(params.assetId);
    if (!entry) {
      if (!embedding) throw new Error('SPARC figure library lost the new situation embedding');
      // Another first encounter may have populated this region while this request waited.
      const match = await selectSparcLibraryFigure(store, embedding, params.minimumSimilarity);
      if (match) return await acceptMatch(match);
      entry = { _id: params.assetId, version: SPARC_FIGURE_LIBRARY_SETTINGS.version, imageModel: SPARC_PROMPT_IMAGE_SETTINGS.model,
        embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel, dimensions: embedding.length,
        embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
        situation: params.situation, embedding, generation: { imagePrompt: params.imagePrompt, tutorMessage: params.tutorMessage,
          description: params.description, displayWidth: params.displayWidth }, ready: false, createdAt: new Date() };
      await store.saveEntry(entry);
    }
    if (entry.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Pending image embedding requires reindexing');
    const generated = await params.generate(entry);
    entry.ready = true;
    delete entry.generation;
    await store.saveEntry(entry);
    await store.saveDecision({ _id: params.identity, kind: 'decision', userId: params.userId,
      tdfId: params.tdfId, sessionId: params.sessionId, assetId: entry._id,
      source: 'generated', similarity: null, createdAt: new Date() });
    const accepted = await store.findDecision(params.identity, params.userId);
    if (!accepted) throw new Error('SPARC visual library did not persist the generated image decision');
    return { ...resume(accepted), source: accepted.assetId === entry._id && !accepted.video ? 'generated' : 'resume',
      usage: generated.usage, embeddingUsage };
  }, 'generation');
}
