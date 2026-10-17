import { createHash, randomBytes } from 'crypto';
import { parseSparcPromptFigure } from '../../common/lib/sparcPromptImage';
import { normalizeSparcFigureEmbedding, sparcFigureCosineSimilarity } from '../../common/lib/sparcFigureLibrary';
import { parseSparcQuestionChoices } from '../../../learning-components/runtime/sparcQuestionChoiceContract';
import { SPARC_MOVE_LIBRARY_VERSION, stableMoveJson, type SparcPrimitiveContent,
  type SparcPrimitiveContext, type SparcPrimitiveLookup, type SparcPrimitiveQuery, type SparcPrimitiveReference } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, SPARC_LIBRARY_SIMILARITY, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';

export const moveDigest = (value: unknown) => createHash('sha256').update(stableMoveJson(value)).digest('hex');
export type QuestionEmbedding = { model: string; text: string; vector: number[] };
export type MoveEntry = {
  _id: string; version: string; context: SparcPrimitiveContext; kind: string; embeddingModel: string;
  embedding: number[]; questionEmbedding?: QuestionEmbedding; content: SparcPrimitiveContent; reusable: boolean;
  embeddingVersion?: string;
  createdAt: Date; requirements: string; move: string; target: string; previousEntryId?: string;
};
export type MoveRequest = { _id: string; userId: string; query: SparcPrimitiveQuery; embedding: number[];
  embeddingVersion?: string;
  lockKey: string; leaseToken: string; entryId?: string; source?: 'retrieved' | 'generated'; similarity?: number | null };
export type MoveExposure = { _id: string; userId: string; tdfId: string; eventId: string; sessionId: string; kind: string;
  nodeId: string; entryId: string; content: SparcPrimitiveContent; questionEmbedding?: QuestionEmbedding; priorNodeId?: string };
export interface MoveStore {
  request(id: string): Promise<MoveRequest | undefined>;
  saveRequest(value: MoveRequest): Promise<MoveRequest>;
  entry(id: string): Promise<MoveEntry | undefined>;
  saveEntry(entry: MoveEntry): Promise<void>;
  candidates(kind: string, embeddingModel: string, after: string): Promise<MoveEntry[]>;
  exposures(userId: string, tdfId: string): Promise<MoveExposure[]>;
  reservedQuestions(userId: string, tdfId: string): Promise<MoveExposure[]>;
  expose(value: MoveExposure): Promise<void>;
  acquire(key: string, token: string): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
  list(kind?: string, after?: string): Promise<MoveEntry[]>;
  setReusable(id: string, reusable: boolean): Promise<void>;
  saveQuestionEmbedding(id: string, embedding: QuestionEmbedding, location: 'entry' | 'exposure'): Promise<void>;
  revise(entry: MoveEntry, previousId: string): Promise<void>;
}

function bounded(value: unknown, label: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
}
export function validatePrimitiveContent(value: SparcPrimitiveContent, context: SparcPrimitiveContext): SparcPrimitiveContent {
  bounded(value?.text, 'primitive text', 2048);
  if (Object.keys(value).some(k => !['text', 'figure', 'choices', 'supportHeading'].includes(k))) throw new Error('Unexpected primitive field');
  if (/<\s*(script|iframe|input|button|style)|\bon\w+\s*=|javascript:/i.test(value.text)) throw new Error('Unsafe instructional markup');
  if (value.figure) { if (context.kind !== 'richContent') throw new Error('Figure requires rich support'); parseSparcPromptFigure(value.figure); }
  if (value.supportHeading) { bounded(value.supportHeading, 'support heading', 60); if (context.kind !== 'richContent' || value.figure) throw new Error('Invalid support heading'); }
  if (context.kind === 'question') {
    if (context.responseFormat === 'multiple-choice') parseSparcQuestionChoices(value.choices);
    else if (value.choices) throw new Error('Unexpected question choices');
  } else if (value.choices) throw new Error('Unexpected question metadata');
  return value;
}

export function createMoveLibraryService(deps: { store: MoveStore; embeddingModel: string; minimumSimilarity?: number; questionNovelty?: number;
  embed(text: string, query: SparcPrimitiveQuery): Promise<number[]>; verifyFigure?(assetId: string): Promise<void>;
  figureReusable?(assetId: string): Promise<boolean>;
  wait?(ms: number): Promise<void>; timing?(stage: string, ms: number, count?: number): void }) {
  const { store } = deps;
  const wait = deps.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const withQuestionLock = async <T>(userId: string, query: SparcPrimitiveQuery, work: () => Promise<T>): Promise<T> => {
    if (query.context.kind !== 'question') return work();
    const key = moveDigest(['question-reservation', userId, query.tdfId]), token = randomBytes(16).toString('hex');
    const start = Date.now();
    while (!await store.acquire(key, token)) {
      if (Date.now() - start >= 120000) throw new Error('Another question is being accepted for this learner. Resume this saved move shortly.');
      await wait(500);
    }
    exposures.delete(moveDigest([userId, query.tdfId]));
    try { return await work(); } finally { await store.release(key, token); }
  };
  const exposures = new Map<string, Promise<MoveExposure[]>>();
  const priorFor = (userId: string, tdfId: string) => {
    const key = moveDigest([userId, tdfId]);
    if (!exposures.has(key)) exposures.set(key, Promise.all([store.exposures(userId, tdfId), store.reservedQuestions(userId, tdfId)])
      .then(([shown, reserved]) => [...new Map([...reserved, ...shown].map(e => [e._id, e])).values()]));
    return exposures.get(key)!;
  };
  const vectors = new Map<string, Promise<number[]>>();
  const embed = (text: string, query: SparcPrimitiveQuery) => {
    if (!vectors.has(text)) vectors.set(text, (async () => {
      const start = Date.now(); const vector = normalizeSparcFigureEmbedding(await deps.embed(text, query));
      deps.timing?.('embedding', Date.now() - start); return vector;
    })());
    return vectors.get(text)!;
  };
  const minimumSimilarity = deps.minimumSimilarity ?? SPARC_LIBRARY_SIMILARITY.minimumSimilarity;
  const questionNovelty = deps.questionNovelty ?? SPARC_LIBRARY_SIMILARITY.questionNovelty;
  if ([minimumSimilarity, questionNovelty].some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Move minimum cosine similarity must be between 0 and 1');
  // The cache identifies its actual input and embedding model. Unidentified derived
  // vectors are recomputed; historical content and accepted decisions never change.
  const questionVector = async (item: { _id: string; content: SparcPrimitiveContent; questionEmbedding?: QuestionEmbedding }, query: SparcPrimitiveQuery, location: 'entry' | 'exposure') => {
    if (item.questionEmbedding?.model !== deps.embeddingModel || item.questionEmbedding.text !== item.content.text) {
      item.questionEmbedding = { model: deps.embeddingModel, text: item.content.text, vector: await embed(item.content.text, query) };
      await store.saveQuestionEmbedding(item._id, item.questionEmbedding, location);
    }
    return item.questionEmbedding.vector;
  };
  const reference = (request: MoveRequest): SparcPrimitiveReference => ({ entryId: request.entryId!, version: SPARC_MOVE_LIBRARY_VERSION,
    source: request.source!, similarity: request.similarity ?? null });
  const existing = async (request: MoveRequest): Promise<SparcPrimitiveLookup> => {
    if (!request.entryId) return { status: 'generate', ticket: request._id,
      previousQuestions: [...new Map([...request.query.previousQuestions, ...(await priorFor(request.userId, request.query.tdfId)).filter(e => e.kind === 'question').map(e => e.content)].map(q => [q.text, q])).values()] };
    const entry = await store.entry(request.entryId);
    if (!entry) throw new Error('Saved primitive is missing');
    const prior = (await priorFor(request.userId, request.query.tdfId)).find(e => e.entryId === entry._id && !e.priorNodeId && e.sessionId === request.query.sessionId && e.eventId !== request.query.eventId);
    return { status: 'hit', content: entry.content, reference: { ...reference(request),
      ...(prior && ['explanation', 'richContent'].includes(entry.kind) ? { priorNodeId: prior.nodeId } : {}) } };
  };
  const novel = async (embedding: number[], query: SparcPrimitiveQuery, userId: string) => {
    const prior = (await priorFor(userId, query.tdfId)).filter(e => e.kind === 'question' && !(e.eventId === query.eventId && e.sessionId === query.sessionId));
    for (const item of prior) {
      if (sparcFigureCosineSimilarity(embedding, await questionVector(item, query, 'exposure')) >= questionNovelty) return false;
    }
    for (const q of query.previousQuestions) {
      if (prior.some(e => e.content.text === q.text)) continue;
      if (sparcFigureCosineSimilarity(embedding, await embed(q.text, query)) >= questionNovelty) return false;
    }
    return true;
  };
  return {
    async lookup(userId: string, query: SparcPrimitiveQuery): Promise<SparcPrimitiveLookup> {
      bounded(query?.tdfId, 'lesson identity', 200); bounded(query.sessionId, 'session identity', 200); bounded(query.eventId, 'event identity', 500);
      bounded(query.queryText, 'instructional context', 30000);
      if (query.context?.version !== SPARC_MOVE_LIBRARY_VERSION || !['feedback', 'explanation', 'richContent', 'question'].includes(query.context.kind)
        || !Number.isFinite(query.context.assistance) || stableMoveJson(query.context).length > 60000
        || !Array.isArray(query.context.components) || query.context.components.length < 1 || query.context.components.length > 3
        || query.context.components.some(k => !['feedback', 'explanation', 'richContent', 'question'].includes(k))
        || new Set(query.context.components).size !== query.context.components.length || !query.context.components.includes(query.context.kind)
        || !Array.isArray(query.previousQuestions) || query.previousQuestions.length > 1000) throw new Error('Invalid primitive request');
      for (const key of ['target', 'move', 'responseFormat', 'requirements', 'focus', 'dependencies', 'specification'] as const) bounded(query.context[key], `context ${key}`, 30000);
      for (const question of query.previousQuestions) bounded(question?.text, 'previous question', 2048);
      const id = moveDigest([userId, query.tdfId, query.sessionId, query.eventId, query.context.kind]);
      const saved = await store.request(id);
      if (saved) {
        if (saved.userId !== userId) throw new Error('Primitive request ownership mismatch');
        if (!saved.entryId && saved.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Pending primitive embedding requires reindexing');
        return existing(saved);
      }
      if (sparcInstructionalNeedText(JSON.parse(query.queryText)) !== query.queryText) throw new Error('Noncanonical instructional need');
      const embedding = await embed(query.queryText, query);
      const lockKey = moveDigest([query.context.kind, query.queryText]);
      const waiting = Date.now();
      while (!await store.acquire(lockKey, id)) {
        if (Date.now() - waiting >= 120000) throw new Error('An identical primitive is still being generated. Your saved move can be resumed.');
        await wait(500);
      }
      deps.timing?.('library-wait', Date.now() - waiting);
      // Search after acquiring the lease: another learner may have completed it while we waited.
      try {
        return await withQuestionLock(userId, query, async () => {
          const searchStart = Date.now(); let candidateCount = 0;
          let best: { entry: MoveEntry; similarity: number } | undefined;
          let after = '';
          for (;;) {
            const entries = await store.candidates(query.context.kind, deps.embeddingModel, after);
            for (const entry of entries) {
              candidateCount++;
              if (entry.embeddingModel !== deps.embeddingModel || !entry.reusable || entry.version !== SPARC_MOVE_LIBRARY_VERSION) continue;
              if (entry.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Instructional library embeddings require reindexing');
              if (entry.kind !== query.context.kind || (entry.kind === 'question' && entry.context.responseFormat !== query.context.responseFormat)) continue;
              if (entry.content.figure && (!deps.figureReusable || !await deps.figureReusable(entry.content.figure.assetId))) continue;
              const similarity = sparcFigureCosineSimilarity(embedding, entry.embedding);
              if (similarity < minimumSimilarity) continue;
              if (query.context.kind === 'question' && !await novel(await questionVector(entry, query, 'entry'), query, userId)) continue;
              if (!best || similarity > best.similarity) best = { entry, similarity };
            }
            if (entries.length < 100) break;
            after = entries.at(-1)!._id;
          }
          deps.timing?.('library-search', Date.now() - searchStart, candidateCount);
          const request: MoveRequest = { _id: id, userId, query, embedding, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, lockKey, leaseToken: id };
          if (best) Object.assign(request, { entryId: best.entry._id, source: 'retrieved', similarity: best.similarity });
          const accepted = await store.saveRequest(request);
          if (best) await store.release(lockKey, id);
          return existing(accepted);
        });
      } catch (error) { await store.release(lockKey, id); throw error; }
    },
    async publish(userId: string, ticket: string, content: SparcPrimitiveContent) {
      const request = await store.request(ticket);
      if (!request || request.userId !== userId) throw new Error('Unknown primitive generation request');
      if (request.entryId) {
        const entry = await store.entry(request.entryId); if (!entry) throw new Error('Accepted content is missing');
        return { accepted: true as const, content: entry.content, reference: reference(request) };
      }
      if (request.embeddingVersion !== SPARC_INSTRUCTIONAL_NEED_VERSION) throw new Error('Pending primitive embedding requires reindexing');
      if (!await store.acquire(request.lockKey, request.leaseToken)) throw new Error('Primitive generation lease expired');
      try {
        validatePrimitiveContent(content, request.query.context);
        if (content.figure) { if (!deps.verifyFigure) throw new Error('Figure verification unavailable'); await deps.verifyFigure(content.figure.assetId); }
        const questionEmbedding = request.query.context.kind === 'question'
          ? { model: deps.embeddingModel, text: content.text, vector: await embed(content.text, request.query) } : undefined;
        return await withQuestionLock(userId, request.query, async () => {
          if (questionEmbedding && !await novel(questionEmbedding.vector, request.query, userId)) return { accepted: false as const, reason: 'Question is too similar to an earlier question. Generate a different question.' };
          const id = moveDigest([SPARC_MOVE_LIBRARY_VERSION, request.query.context.kind, deps.embeddingModel, request.embedding, content]);
          if ((await store.entry(id))?.reusable === false) throw new Error('This content was excluded from reuse; generate different content');
          await store.saveEntry({ _id: id, version: SPARC_MOVE_LIBRARY_VERSION, context: request.query.context, kind: request.query.context.kind,
            embeddingModel: deps.embeddingModel, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
            embedding: request.embedding, ...(questionEmbedding ? { questionEmbedding } : {}), content,
            requirements: request.query.context.requirements, target: request.query.context.target, move: request.query.context.move,
            reusable: true, createdAt: new Date() });
          Object.assign(request, { entryId: id, source: 'generated', similarity: null });
          const accepted = await store.saveRequest(request);
          const entry = await store.entry(accepted.entryId!); if (!entry) throw new Error('Accepted content is missing');
          return { accepted: true as const, content: entry.content, reference: reference(accepted) };
        });
      } finally { await store.release(request.lockKey, request.leaseToken); }
    },
    async revise(userId: string, id: string, content: SparcPrimitiveContent) {
      const previous = await store.entry(id);
      if (!previous) throw new Error('Move-library entry not found');
      validatePrimitiveContent(content, previous.context);
      if (stableMoveJson(content) === stableMoveJson(previous.content)) return id;
      if (content.figure) { if (!deps.verifyFigure) throw new Error('Figure verification unavailable'); await deps.verifyFigure(content.figure.assetId); }
      const questionEmbedding = previous.kind === 'question' ? { model: deps.embeddingModel, text: content.text, vector: await embed(content.text, {
        tdfId: '', sessionId: 'admin-revision', eventId: id, context: previous.context, queryText: '', previousQuestions: [],
      }) } : undefined;
      const entry: MoveEntry = { ...previous, _id: moveDigest([id, content]), previousEntryId: id, content,
        ...(questionEmbedding ? { questionEmbedding } : {}), reusable: true, createdAt: new Date() };
      await store.revise(entry, id);
      return entry._id;
    },
    async present(userId: string, query: SparcPrimitiveQuery, ref: SparcPrimitiveReference, nodeId: string) {
      const request = await store.request(moveDigest([userId, query.tdfId, query.sessionId, query.eventId, query.context.kind]));
      if (!request || request.userId !== userId || request.entryId !== ref.entryId) throw new Error('Unaccepted primitive presentation');
      bounded(nodeId, 'presentation identity', 600);
      const entry = await store.entry(ref.entryId);
      if (!entry) throw new Error('Presented primitive is missing');
      await store.expose({ _id: request._id, userId, tdfId: query.tdfId, sessionId: query.sessionId, eventId: query.eventId,
        kind: entry.kind, nodeId, entryId: entry._id, content: entry.content, ...(ref.priorNodeId ? { priorNodeId: ref.priorNodeId } : {}), ...(entry.questionEmbedding ? { questionEmbedding: entry.questionEmbedding } : {}) });
      exposures.delete(moveDigest([userId, query.tdfId]));
    },
  };
}
