import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import type { OpenRouterUsageSummary } from '../../common/lib/openRouterClient';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { parseSparcVideoSegment, type SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import type { SparcRetrievalSelection } from '../../common/lib/sparcRetrieval';
import { SPARC_VISUAL_MINIMUM_SIMILARITY } from '../../common/lib/sparcRetrieval';

export type SparcFigureLibraryEntry = {
  _id: string; kind?: 'image'; version: string; imageModel: string; embeddingModel: string; dimensions: number;
  situation: string; embedding: number[]; ready: boolean; createdAt: Date;
  embeddingVersion?: string;
  contentUseKeys?: string[];
  generation?: { imagePrompt: string; tutorMessage: string; description: string; displayWidth: number };
};
export type SparcVisualDecision = {
  _id: string; kind: 'decision'; userId: string; tdfId: string; sessionId: string;
  /** Existing image decision key; for video this holds the catalog segment identity. */
  assetId: string; source: 'generated' | 'semantic'; similarity: number | null; createdAt: Date;
  video?: SparcVideoSegment;
  contentUseKeys?: string[];
};
export type SparcFigureLibraryStore = {
  inspectEntries: (assetIds: string[]) => Promise<SparcFigureInspection[]>;
  inspectPage: (afterId: string) => Promise<SparcFigureInspection[]>;
  findDecision: (identity: string, userId: string) => Promise<SparcVisualDecision | undefined>;
  saveDecision: (decision: SparcVisualDecision) => Promise<void>;
  findEntry: (assetId: string) => Promise<SparcFigureLibraryEntry | undefined>;
  saveEntry: (entry: SparcFigureLibraryEntry) => Promise<void>;
  findVisual: (id: string, language: string) => Promise<{ video: SparcVideoSegment } | { entry: SparcFigureLibraryEntry } | undefined>;
  /** Administrative asset replacement only; practice generation does not use this operation. */
  withLock: <T>(work: () => Promise<T>, scope?: string) => Promise<T>;
};
export type SparcFigureInspection = Pick<SparcFigureLibraryEntry, '_id' | 'version' | 'imageModel' | 'createdAt'>;
type SparcVisualLibraryResult = { assetId: string; source: 'resume' | 'semantic' | 'generated'; similarity: number | null;
  video?: SparcVideoSegment;
  usage?: OpenRouterUsageSummary | undefined };

/** The browser has selected the one maximum. This owner only reads/saves the chosen resource. */
export async function getOrGenerateSparcLibraryVisual(params: {
  store: SparcFigureLibraryStore; identity: string; assetId: string; userId: string; tdfId: string; sessionId: string;
  situation: string; imagePrompt: string; tutorMessage: string; description: string; displayWidth: number;
  selection: SparcRetrievalSelection; embedding: number[]; language: string;
  generate: (entry: SparcFigureLibraryEntry) => Promise<{ usage?: OpenRouterUsageSummary }>;
}): Promise<SparcVisualLibraryResult> {
  const { store } = params;
  const resume = (decision: SparcVisualDecision): SparcVisualLibraryResult => ({ assetId: decision.assetId, source: 'resume',
    similarity: decision.similarity, ...(decision.video ? { video: parseSparcVideoSegment(decision.video) } : {}) });
  const prior = await store.findDecision(params.identity, params.userId);
  if (prior) {
    if (prior.userId !== params.userId || prior.tdfId !== params.tdfId || prior.sessionId !== params.sessionId) throw new Error('Visual decision ownership mismatch');
    return resume(prior);
  }
  if (params.selection) {
    if (!Number.isFinite(params.selection.similarity) || params.selection.similarity < SPARC_VISUAL_MINIMUM_SIMILARITY || params.selection.similarity > 1) throw new Error('Visual selection must meet the 0.95 threshold');
    const selected = await store.findVisual(params.selection.entryId, params.language);
    if (!selected) throw new Error('The locally selected visual is unavailable; refresh the vector cache');
    const video = 'video' in selected ? parseSparcVideoSegment(selected.video) : undefined;
    await store.saveDecision({ _id: params.identity, kind: 'decision', userId: params.userId, tdfId: params.tdfId,
      sessionId: params.sessionId, assetId: params.selection.entryId, ...(video ? { video } : {}),
      contentUseKeys: [video ? `video:${video.segmentId}` : `image:${params.selection.entryId}`],
      source: 'semantic', similarity: params.selection.similarity, createdAt: new Date() });
    const accepted = await store.findDecision(params.identity, params.userId);
    if (!accepted) throw new Error('Visual decision was not saved');
    return { ...resume(accepted), source: 'semantic' };
  }
  if (!Array.isArray(params.embedding) || !params.embedding.length || params.embedding.length > 8192
    || params.embedding.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Invalid visual embedding');
  const entry: SparcFigureLibraryEntry = { _id: params.assetId, kind: 'image', version: SPARC_FIGURE_LIBRARY_SETTINGS.version,
    imageModel: SPARC_PROMPT_IMAGE_SETTINGS.model, embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel,
    dimensions: params.embedding.length, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
    situation: sparcInstructionalNeedText(JSON.parse(params.situation)), embedding: params.embedding,
    ready: false, createdAt: new Date(), generation: { imagePrompt: params.imagePrompt, tutorMessage: params.tutorMessage,
      description: params.description, displayWidth: params.displayWidth } };
  await store.saveEntry(entry);
  // Independent misses generate independent copies. No global lease, polling, or second search.
  const generated = await params.generate(entry);
  entry.ready = true; delete entry.generation;
  await store.saveEntry(entry);
  await store.saveDecision({ _id: params.identity, kind: 'decision', userId: params.userId, tdfId: params.tdfId,
    sessionId: params.sessionId, assetId: entry._id, source: 'generated', similarity: null, createdAt: new Date(),
    contentUseKeys: [`image:${entry._id}`] });
  const accepted = await store.findDecision(params.identity, params.userId);
  if (!accepted) throw new Error('Generated visual decision was not saved');
  return { ...resume(accepted), source: accepted.assetId === entry._id ? 'generated' : 'resume', usage: generated.usage };
}
