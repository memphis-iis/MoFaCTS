import { parseSparcVideoSegment, SPARC_VIDEO_EMBEDDING_VERSION, type SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import { resolveSparcReadingLevel } from '../../../learning-components/runtime/sparcReadingLevel';
import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../learning-components/runtime/sparcAdministrativeRemoval';
import { createHash } from 'crypto';
import { parseSparcPromptFigure } from '../../common/lib/sparcPromptImage';
import type { SparcRetrievalSelection } from '../../common/lib/sparcRetrieval';
import { parseSparcQuestionChoices } from '../../../learning-components/runtime/sparcQuestionChoiceContract';
import { isSparcChoiceFormat, validateSparcClozeQuestion, SPARC_QUESTION_RESPONSE_FORMATS } from '../../../learning-components/runtime/sparcTargetCategories';
import { SPARC_MOVE_LIBRARY_VERSION, stableMoveJson, type SparcPrimitiveContent,
  type SparcPrimitiveTicket, type SparcPrimitiveContext, type SparcPrimitiveLookup, type SparcPrimitiveQuery, type SparcPrimitiveReference } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, SPARC_LIBRARY_SIMILARITY, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';

export const moveDigest = (value: unknown) => createHash('sha256').update(stableMoveJson(value)).digest('hex');
export type MoveEntry = {
  _id: string; version: string; context: SparcPrimitiveContext; kind: string; embeddingModel: string;
  embedding: number[]; content: SparcPrimitiveContent;
  embeddingVersion?: string;
  createdAt: Date; requirements: string; move: string; target: string;
};
export type MoveRequest = { _id: string; userId: string; query: SparcPrimitiveQuery; embedding: number[];
  embeddingVersion?: string;
  entryId?: string; source?: 'retrieved' | 'generated'; similarity?: number | null };
export interface MoveStore {
  request(id: string): Promise<MoveRequest | undefined>;
  saveRequest(value: MoveRequest): Promise<MoveRequest>;
  entry(id: string): Promise<MoveEntry | undefined>;
  saveEntry(entry: MoveEntry): Promise<void>;
  list(kind?: string, after?: string): Promise<MoveEntry[]>;
  removed(id: string): Promise<boolean>;
  revise(entry: MoveEntry): Promise<void>;
}

function bounded(value: unknown, label: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
}
export function validatePrimitiveContent(value: SparcPrimitiveContent, context: SparcPrimitiveContext): SparcPrimitiveContent {
  if (typeof value?.text !== 'string' || !value.text.trim()) throw new Error('Invalid primitive text');
  if (Object.keys(value).some(k => !['text', 'figure', 'video', 'choices', 'supportHeading'].includes(k))) throw new Error('Unexpected primitive field');
  if (context.supportKind === 'visual' && !value.video && !value.figure) throw new Error('The visual move requires a video or image');
  if (context.supportKind === 'written' && (value.video || value.figure)) throw new Error('The written move cannot select visual support');
  if (/<\s*(script|iframe|input|button|style)|\bon\w+\s*=|javascript:/i.test(value.text)) throw new Error('Unsafe instructional markup');
  if (value.video) { if (context.kind !== 'richContent' || value.figure || value.supportHeading || value.text !== value.video.transcript) throw new Error('Video requires standalone rich support'); parseSparcVideoSegment(value.video); }
  if (value.figure) { if (context.kind !== 'richContent') throw new Error('Figure requires rich support'); parseSparcPromptFigure(value.figure); }
  if (value.supportHeading) { if (typeof value.supportHeading !== 'string' || !value.supportHeading.trim()) throw new Error('Invalid support heading'); if (context.kind !== 'richContent' || value.figure) throw new Error('Invalid support heading'); }
  if (context.kind === 'question') {
    if (!SPARC_QUESTION_RESPONSE_FORMATS.some(format => format === context.responseFormat)) throw new Error('Invalid question response format');
    if (isSparcChoiceFormat(context.responseFormat)) parseSparcQuestionChoices(value.choices, context.responseFormat);
    else if (value.choices) throw new Error('Unexpected question choices');
    if (context.responseFormat === 'cloze') validateSparcClozeQuestion(value.text);
  } else if (value.choices) throw new Error('Unexpected question metadata');
  return value;
}

export function createMoveLibraryService(deps: { store: MoveStore; embeddingModel: string;
  verifyFigure?(assetId: string): Promise<void>;
  videoReuseStatus?(videos: readonly SparcVideoSegment[]): Promise<Map<string, boolean>>;
}) {
  const { store } = deps;
  const reference = (request: MoveRequest): SparcPrimitiveReference => ({ entryId: request.entryId!, version: SPARC_MOVE_LIBRARY_VERSION,
    source: request.source!, similarity: request.similarity ?? null });
  const assignedContent = (request: MoveRequest, content: SparcPrimitiveContent): SparcPrimitiveContent => {
    if (!content.choices) return content;
    if (request.query.context.responseFormat === 'true-false') return { ...content, choices: parseSparcQuestionChoices(content.choices, 'true-false') };
    return { ...content, choices: parseSparcQuestionChoices(content.choices).map(choice => ({ choice, rank: moveDigest([request._id, choice.id]) }))
      .sort((a, b) => a.rank.localeCompare(b.rank) || a.choice.id.localeCompare(b.choice.id)).map(({ choice }) => choice) };
  };
  const acceptedContent = async (request: MoveRequest): Promise<SparcPrimitiveContent> => {
    const entry = await store.entry(request.entryId!);
    if (!entry) {
      if (await store.removed(request.entryId!)) return { text: SPARC_ADMINISTRATIVE_REMOVAL_TEXT, administrativeRemoval: true };
      throw new Error('Saved primitive is missing');
    }
    return assignedContent(request, entry.content);
  };
  const existing = async (request: MoveRequest, selected?: MoveEntry): Promise<SparcPrimitiveLookup> => request.entryId
    ? { status: 'hit', content: selected?._id === request.entryId ? assignedContent(request, selected.content) : await acceptedContent(request), reference: reference(request) }
    : { status: 'generate', ticket: { query: request.query, embedding: request.embedding }, previousQuestions: request.query.previousQuestions };
  const verifyContent = async (content: SparcPrimitiveContent, context: SparcPrimitiveContext) => {
    validatePrimitiveContent(content, context);
    if (content.video && (!deps.videoReuseStatus || (await deps.videoReuseStatus([content.video])).get(content.video.segmentId) !== true)) {
      throw new Error('The selected video is unavailable');
    }
    if (content.figure) {
      if (!deps.verifyFigure) throw new Error('Figure verification unavailable');
      await deps.verifyFigure(content.figure.assetId);
    }
  };
  const validateQuery = (query: SparcPrimitiveQuery, embedding: number[]) => {
      bounded(query?.tdfId, 'lesson identity', 200); bounded(query.sessionId, 'session identity', 200); bounded(query.eventId, 'event identity', 500);
      bounded(query.queryText, 'instructional context', 30000);
      if (query.context?.version !== SPARC_MOVE_LIBRARY_VERSION || !['feedback', 'explanation', 'richContent', 'question'].includes(query.context.kind)
        || (query.context.supportKind !== undefined && (query.context.kind !== 'richContent' || !['written', 'visual'].includes(query.context.supportKind)))
        || !Number.isFinite(query.context.assistance) || stableMoveJson(query.context).length > 60000
        || !Array.isArray(query.context.components) || query.context.components.length > 3 || !query.context.components.includes(query.context.kind)
        || new Set(query.context.components).size !== query.context.components.length
        || query.context.components.some(kind => !['feedback', 'explanation', 'richContent', 'question'].includes(kind))
        || !Array.isArray(query.previousQuestions) || query.previousQuestions.length > 1000) throw new Error('Invalid primitive request');
      for (const question of query.previousQuestions) if (typeof question?.text !== 'string' || !question.text.trim()) throw new Error('Invalid previous question');
      for (const key of ['target', 'move', 'responseFormat', 'requirements', 'focus', 'dependencies', 'specification'] as const) bounded(query.context[key], 'context ' + key, 30000);
      resolveSparcReadingLevel(query.context.readingLevel);
      if (!Array.isArray(embedding) || (!embedding.length && query.context.supportKind !== 'visual') || embedding.length > 8192 || embedding.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Invalid query embedding');
      if (query.context.supportKind === 'visual' && embedding.length) throw new Error('Visual primitives do not use retrieval embeddings');
      if (sparcInstructionalNeedText(JSON.parse(query.queryText)) !== query.queryText) throw new Error('Noncanonical instructional need');
  };
  return {
    async lookup(userId: string, query: SparcPrimitiveQuery, selection: SparcRetrievalSelection, embedding: number[]): Promise<SparcPrimitiveLookup> {
      validateQuery(query, embedding);
      if (selection !== null && (!selection || typeof selection.entryId !== 'string' || !selection.entryId || selection.entryId.length > 200 || !Number.isFinite(selection.similarity)
        || selection.similarity < SPARC_LIBRARY_SIMILARITY.minimumSimilarity || selection.similarity > 1)) throw new Error('Invalid local retrieval selection');
      const id = moveDigest([userId, query.tdfId, query.sessionId, query.eventId, query.context.kind]);
      const saved = await store.request(id);
      if (saved) { if (saved.userId !== userId) throw new Error('Primitive request ownership mismatch'); return existing(saved); }
      if (!selection) return { status: 'generate', ticket: { query, embedding }, previousQuestions: query.previousQuestions };
      let selected: MoveEntry | undefined;
      if (selection) {
        const entry = await store.entry(selection.entryId);
        if (!entry) throw new Error('The locally selected component was removed; refresh its cache');
        if (entry.kind !== query.context.kind || entry.version !== SPARC_MOVE_LIBRARY_VERSION
          || entry.embeddingModel !== deps.embeddingModel || entry.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION
          || resolveSparcReadingLevel(entry.context.readingLevel) !== resolveSparcReadingLevel(query.context.readingLevel)
          || (entry.kind === 'question' && entry.context.responseFormat !== query.context.responseFormat)
          || (query.context.supportKind === 'written' && (entry.content.video || entry.content.figure))) throw new Error('Local selection is outside the requested category');
        selected = entry;
      }
      const request: MoveRequest = { _id: id, userId, query, embedding, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
        ...(selection ? { entryId: selection.entryId, source: 'retrieved', similarity: selection.similarity } : {}) };
      return existing(await store.saveRequest(request), selected);
    },
    async publish(userId: string, ticket: SparcPrimitiveTicket, content: SparcPrimitiveContent) {
      const { query, embedding } = ticket;
      validateQuery(query, embedding);
      const requestId = moveDigest([userId, query.tdfId, query.sessionId, query.eventId, query.context.kind]);
      const request = await store.request(requestId) ?? { _id: requestId, userId, query, embedding, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION };
      if (request.userId !== userId) throw new Error('Primitive request ownership mismatch');
      if (request.entryId) return { accepted: true as const, content: await acceptedContent(request), reference: reference(request) };
      if (request.query.context.supportKind !== 'visual' && request.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Pending primitive embedding requires reindexing');
      await verifyContent(content, request.query.context);
      if (request.query.context.supportKind === 'visual') {
        // The selected media already owns its vector. No second provider request is needed.
        const resource = await store.entry(content.video?.segmentId ?? content.figure!.assetId);
        if (!resource?.embedding?.length || resource.embeddingVersion !== (content.video ? SPARC_VIDEO_EMBEDDING_VERSION : SPARC_INSTRUCTIONAL_NEED_VERSION) || resource.embeddingModel !== deps.embeddingModel) throw new Error('Visual resource has no valid embedding');
        request.embedding = resource.embedding;
        request.embeddingVersion = resource.embeddingVersion;
      }
      const id = moveDigest([SPARC_MOVE_LIBRARY_VERSION, request._id, content]);
      await store.saveEntry({ _id: id, version: SPARC_MOVE_LIBRARY_VERSION, context: request.query.context, kind: request.query.context.kind,
        embeddingModel: deps.embeddingModel, embeddingVersion: request.embeddingVersion!, embedding: request.embedding, content,
        requirements: request.query.context.requirements, target: request.query.context.target, move: request.query.context.move, createdAt: new Date() });
      Object.assign(request, { entryId: id, source: 'generated', similarity: null });
      const accepted = await store.saveRequest(request);
      return { accepted: true as const, content: accepted.entryId === id ? assignedContent(accepted, content) : await acceptedContent(accepted), reference: reference(accepted) };
    },
    async revise(userId: string, id: string, content: SparcPrimitiveContent) {
      const previous = await store.entry(id);
      if (!previous) throw new Error('Move-library entry not found');
      await verifyContent(content, previous.context);
      if (stableMoveJson(content) !== stableMoveJson(previous.content)) await store.revise({ ...previous, content });
      return id;
    },
  };
}
