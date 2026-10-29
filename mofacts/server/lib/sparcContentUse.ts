import { createHash } from 'node:crypto';
import { sparcCatalogContentUseKeys, sparcPrimitiveContentUseKeys } from '../../../learning-components/runtime/sparcContentUseIdentity';
import type { SparcPrimitiveContent } from '../../../learning-components/runtime/sparcMoveLibraryContract';

type Row = Record<string, any>;
type Query = Record<string, unknown>;
type Operation = { updateOne: { filter: Query; update: Query; upsert?: boolean } };
export type SparcContentUseCollection = {
  find(selector: Query, options: Query): { toArray(): Promise<Row[]> };
  findOne(selector: Query, options?: Query): Promise<Row | null>;
  updateOne(selector: Query, modifier: Query, options?: Query): Promise<unknown>;
  bulkWrite(operations: Operation[], options?: Query): Promise<unknown>;
};
type Session = { withTransaction(work: () => Promise<void>, options: { readConcern: { level: 'snapshot' }; writeConcern: { w: 'majority' } }): Promise<unknown>; endSession(): Promise<void> };
type Scope = { tdfId: string; sessionId: string; eventId: string };
type Initialization = { version: 1; phase: 'requests' | 'figures' | 'history' | 'complete'; cursor: string | null; requestCount: number; figureCount: number; historyCount: number };
const PAGE_SIZE = 100;
export class SparcContentAlreadyUsedError extends Error {
  constructor() { super('This instructional content has already been used for this user'); this.name = 'SparcContentAlreadyUsedError'; }
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const sparcContentUseKeys = (content: SparcPrimitiveContent, entryId?: string) => sparcPrimitiveContentUseKeys(content, hash, entryId);
export const sparcCatalogUseKeys = (entry: { _id: string; kind: string; content?: SparcPrimitiveContent }) => sparcCatalogContentUseKeys(entry, hash);

function requireIdentity(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Content use requires a durable identity');
}
function keys(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(key => typeof key !== 'string' || !/^(entry|text|payload|image|video):.+/.test(key))) throw new Error('Accepted content has missing or invalid use identities');
  return [...new Set(value as string[])].sort();
}
function scope(value: Row): Scope {
  const result = value.kind === 'presentation-use' ? value.scope : value.query;
  if (!result) throw new Error('Accepted content has no event scope');
  for (const name of ['tdfId', 'sessionId', 'eventId']) requireIdentity(result[name]);
  return { tdfId: result.tdfId, sessionId: result.sessionId, eventId: result.eventId };
}
function sameScope(a: Scope, b: Scope): boolean { return a.tdfId === b.tdfId && a.sessionId === b.sessionId && a.eventId === b.eventId; }
function visualIdentity(userId: string, value: Scope): string { return hash(JSON.stringify([userId, value.tdfId, value.sessionId, value.eventId])); }
function mediaKey(value: string): boolean { return value.startsWith('image:') || value.startsWith('video:'); }
function initialization(value: unknown): Initialization {
  if (value === undefined) return { version: 1, phase: 'requests', cursor: null, requestCount: 0, figureCount: 0, historyCount: 0 };
  const record = value as Initialization;
  if (!record || record.version !== 1 || !['requests', 'figures', 'history', 'complete'].includes(record.phase)
    || !(record.cursor === null || typeof record.cursor === 'string')
    || !Number.isSafeInteger(record.requestCount) || record.requestCount < 0
    || !Number.isSafeInteger(record.figureCount) || record.figureCount < 0
    || !Number.isSafeInteger(record.historyCount) || record.historyCount < 0) throw new Error('Invalid content-use initialization checkpoint');
  return record;
}
/** Bounded derived catalog metadata, preserving concurrent administrator revisions. */
export async function ensureSparcContentUseCatalog(collection: SparcContentUseCollection): Promise<void> {
  let cursor: string | null = null;
  while (true) {
    const rows = await collection.find({ contentUseKeys: { $exists: false }, ...(cursor === null ? {} : { _id: { $gt: cursor } }) },
      { projection: { _id: 1, kind: 1, content: 1 }, sort: { _id: 1 }, limit: PAGE_SIZE }).toArray();
    if (!rows.length) {
      if (await collection.findOne({ contentUseKeys: { $exists: false } }, { projection: { _id: 1 } })) {
        throw new Error('Catalog content changed during eligibility initialization; reopen the lesson');
      }
      return;
    }
    await collection.bulkWrite(rows.map(row => ({ updateOne: {
      filter: { _id: row._id, kind: row.kind, contentUseKeys: { $exists: false }, ...(row.content ? { content: row.content } : {}) },
      update: { $set: { contentUseKeys: sparcCatalogUseKeys(row as { _id: string; kind: string; content?: SparcPrimitiveContent }) } },
    } })), { ordered: true });
    cursor = rows.at(-1)!._id;
    requireIdentity(cursor);
  }
}

/** Accepted request/visual decisions remain the owner; historical proofs stay in that owner. */
export function createSparcContentUseStorage(deps: {
  requests: SparcContentUseCollection; figures: SparcContentUseCollection;
  entries: SparcContentUseCollection; histories: SparcContentUseCollection; states: SparcContentUseCollection;
  startSession(): Session; log?(message: string, progress: Record<string, string | number>): void;
}) {
  async function transaction<T>(userId: string, work: (session: Session) => Promise<T>): Promise<T> {
    requireIdentity(userId);
    let duplicateRestart = false;
    while (true) {
      const session = deps.startSession();
      try {
        let result!: T;
        let completed = false;
        await session.withTransaction(async () => {
          completed = false;
          const state = await deps.states.findOne({ _id: userId }, { session });
          const revision = state?.contentUseRevision === undefined ? 0 : state.contentUseRevision;
          if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid content-use source revision');
          await deps.states.updateOne({ _id: userId }, { $inc: { contentUseRevision: 1 }, $setOnInsert: { sequence: 0, repairRevision: 0 } }, { session, upsert: true });
          result = await work(session);
          completed = true;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        if (!completed) throw new Error('Content-use transaction did not execute its work');
        return result;
      } catch (error) {
        if ((error as { code?: unknown })?.code !== 11000 || duplicateRestart) throw error;
        duplicateRestart = true;
      } finally { await session.endSession(); }
    }
  }

  async function writeChunks(collection: SparcContentUseCollection, operations: Operation[], session: Session): Promise<void> {
    for (let offset = 0; offset < operations.length; offset += PAGE_SIZE) await collection.bulkWrite(operations.slice(offset, offset + PAGE_SIZE), { session, ordered: true });
  }

  async function writeReceipts(receipts: Row[], session: Session): Promise<void> {
    if (new Set(receipts.map(row => row._id)).size !== receipts.length) throw new Error('SPARC presentations require unique output identities');
    for (let offset = 0; offset < receipts.length; offset += PAGE_SIZE) {
      const batch = receipts.slice(offset, offset + PAGE_SIZE);
      const previous = await deps.requests.find({ _id: { $in: batch.map(row => row._id) } }, {
        projection: { _id: 1, kind: 1, userId: 1, sourceHistoryId: 1, scope: 1, entryId: 1, contentUseKeys: 1 }, limit: PAGE_SIZE, session,
      }).toArray();
      const byId = new Map(previous.map(row => [row._id, row]));
      for (const receipt of batch) {
        const saved = byId.get(receipt._id);
        if (saved && (saved.kind !== receipt.kind || saved.userId !== receipt.userId || saved.sourceHistoryId !== receipt.sourceHistoryId
          || saved.entryId !== receipt.entryId || !sameScope(scope(saved), scope(receipt))
          || JSON.stringify(keys(saved.contentUseKeys)) !== JSON.stringify(keys(receipt.contentUseKeys)))) {
          throw new Error('Saved SPARC presentation identity conflicts with its durable content');
        }
      }
      await writeChunks(deps.requests, batch.map(receipt => ({ updateOne: {
        filter: { _id: receipt._id, userId: receipt.userId }, update: { $setOnInsert: receipt }, upsert: true,
      } })), session);
    }
  }

  function presentationReceipts(row: Row): Row[] {
    const transition = row.sparc?.stateTransition;
    if (!transition || !Array.isArray(transition.writes)) return [];
    const receipts: Row[] = [];
    for (const write of transition.writes) {
      const operation = write?.value;
      const node = operation?.node;
      if (!['append-node', 'insert-node'].includes(operation?.type) || !node || node.speaker !== 'tutor' || node.administrativeRemoval) continue;
      requireIdentity(row._id); requireIdentity(row.TDFId); requireIdentity(row.sessionID); requireIdentity(node.id);
      const eventId = node.turnEventId ?? transition.event?.eventId;
      requireIdentity(eventId);
      const entryId = node.primitiveReference?.entryId;
      if (entryId !== undefined) requireIdentity(entryId);
      const content: SparcPrimitiveContent = { text: node.value, ...(node.figure ? { figure: node.figure } : {}), ...(node.video ? { video: node.video } : {}),
        ...(node.choices ? { choices: node.choices } : {}), ...(node.supportHeading ? { supportHeading: node.supportHeading } : {}) };
      receipts.push({ _id: `presentation-use:${hash(JSON.stringify([row._id, node.id]))}`, kind: 'presentation-use', userId: row.userId,
        sourceHistoryId: row._id, scope: { tdfId: row.TDFId, sessionId: row.sessionID, eventId },
        ...(entryId ? { entryId } : {}), contentUseKeys: sparcContentUseKeys(content, entryId) });
    }
    return receipts;
  }

  async function ensureUser(userId: string): Promise<void> {
    requireIdentity(userId);
    while (initialization((await deps.states.findOne({ _id: userId }))?.contentUseInitialization).phase !== 'complete') {
      const progress = await transaction(userId, async session => {
        const state = initialization((await deps.states.findOne({ _id: userId }, { session }))?.contentUseInitialization);
        if (state.phase === 'complete') return state;
        const source = state.phase === 'requests' ? deps.requests : state.phase === 'figures' ? deps.figures : deps.histories;
        const selector = { userId, ...(state.cursor === null ? {} : { _id: { $gt: state.cursor } }),
          ...(state.phase === 'requests' ? { kind: { $ne: 'presentation-use' }, entryId: { $exists: true } }
            : state.phase === 'figures' ? { kind: 'decision' } : { eventType: 'sparc' }) };
        const projection = state.phase === 'requests' ? { _id: 1, entryId: 1, contentUseKeys: 1 }
          : state.phase === 'figures' ? { _id: 1, assetId: 1, video: 1, contentUseKeys: 1 }
          : { _id: 1, userId: 1, TDFId: 1, sessionID: 1, 'sparc.stateTransition.event.eventId': 1,
            'sparc.stateTransition.writes.value.type': 1, 'sparc.stateTransition.writes.value.node': 1 };
        const rows = await source.find(selector, { projection, sort: { _id: 1 }, limit: PAGE_SIZE, session }).toArray();
        let next: Initialization;
        if (!rows.length) next = { ...state, phase: state.phase === 'requests' ? 'figures' : state.phase === 'figures' ? 'history' : 'complete', cursor: null };
        else {
          const cursor = rows.at(-1)!._id; requireIdentity(cursor);
          if (state.phase === 'requests') {
            const updates = rows.filter(row => row.contentUseKeys === undefined).map(row => {
              requireIdentity(row.entryId);
              return { updateOne: { filter: { _id: row._id, userId }, update: { $set: { contentUseKeys: [`entry:${row.entryId}`] } } } };
            });
            for (const row of rows) if (row.contentUseKeys !== undefined) keys(row.contentUseKeys);
            await writeChunks(deps.requests, updates, session);
          } else if (state.phase === 'figures') {
            await writeChunks(deps.figures, rows.filter(row => row.contentUseKeys === undefined).map(row => {
              requireIdentity(row.assetId);
              if (row.video) requireIdentity(row.video.segmentId);
              return { updateOne: { filter: { _id: row._id, userId }, update: { $set: {
                contentUseKeys: [row.video ? `video:${row.video.segmentId}` : `image:${row.assetId}`],
              } } } };
            }), session);
            for (const row of rows) if (row.contentUseKeys !== undefined) keys(row.contentUseKeys);
          } else {
            const receipts = rows.flatMap(presentationReceipts);
            await writeReceipts(receipts, session);
            const updates: Operation[] = [];
            for (const receipt of receipts) {
              if (!receipt.entryId) continue;
              updates.push({ updateOne: {
                filter: { userId, entryId: receipt.entryId, kind: { $ne: 'presentation-use' },
                  'query.tdfId': receipt.scope.tdfId, 'query.sessionId': receipt.scope.sessionId, 'query.eventId': receipt.scope.eventId },
                update: { $addToSet: { contentUseKeys: { $each: receipt.contentUseKeys } } },
              } });
            }
            await writeChunks(deps.requests, updates, session);
          }
          next = { ...state, cursor, requestCount: state.requestCount + (state.phase === 'requests' ? rows.length : 0),
            figureCount: state.figureCount + (state.phase === 'figures' ? rows.length : 0),
            historyCount: state.historyCount + (state.phase === 'history' ? rows.length : 0) };
        }
        await deps.states.updateOne({ _id: userId }, { $set: { contentUseInitialization: next } }, { session });
        return next;
      });
      deps.log?.('[SPARC content-use initialization]', { phase: progress.phase, requests: progress.requestCount, figures: progress.figureCount, histories: progress.historyCount });
    }
  }

  async function assertUnused(userId: string, candidate: string[], requestScope: Scope | undefined, requestId: string, session: Session, presentedEntryId?: string): Promise<void> {
    let cursor: string | null = null;
    while (true) {
      const rows = await deps.requests.find({ userId, contentUseKeys: { $in: candidate }, ...(cursor === null ? {} : { _id: { $gt: cursor } }) },
        { projection: { _id: 1, kind: 1, scope: 1, 'query.tdfId': 1, 'query.sessionId': 1, 'query.eventId': 1, entryId: 1, contentUseKeys: 1 }, sort: { _id: 1 }, limit: PAGE_SIZE, session }).toArray();
      for (const row of rows) {
        if (row._id === requestId) continue;
        const previousScope = scope(row);
        const sameEvent = requestScope ? sameScope(previousScope, requestScope) : visualIdentity(userId, previousScope) === requestId;
        const previousKeys = keys(row.contentUseKeys);
        const overlap = previousKeys.filter(key => candidate.includes(key));
        // The saved primitive reserves its own forthcoming output. Its exact
        // event, entry and content must agree; another component cannot borrow it.
        if (presentedEntryId && row.kind !== 'presentation-use' && sameEvent && row.entryId === presentedEntryId
          && candidate.every(key => previousKeys.includes(key))) continue;
        // Canonical history owns restoration if its original request is missing.
        // A same-event receipt never authorizes replacing it with a fresh selection.
        if (overlap.some(key => !(sameEvent && (mediaKey(key) || (presentedEntryId && row.kind === 'presentation-use'
          && row.entryId === presentedEntryId && key === `entry:${presentedEntryId}`))))) throw new SparcContentAlreadyUsedError();
      }
      if (!rows.length) break;
      cursor = rows.at(-1)!._id; requireIdentity(cursor);
    }
    const media = candidate.filter(mediaKey).map(key => key.slice(key.indexOf(':') + 1));
    if (!media.length) return;
    const ownVisual = requestScope ? visualIdentity(userId, requestScope) : requestId;
    if (await deps.figures.findOne({ kind: 'decision', userId, assetId: { $in: media }, _id: { $ne: ownVisual } }, { projection: { _id: 1 }, session })) {
      throw new SparcContentAlreadyUsedError();
    }
  }

  async function saveRequest<T extends Row>(value: T): Promise<T> {
    await ensureUser(value.userId);
    return await transaction(value.userId, async session => {
      const previous = await deps.requests.findOne({ _id: value._id }, { session });
      if (previous && previous.userId !== value.userId) throw new Error('Primitive decision ownership mismatch');
      if (previous && (!sameScope(scope(previous), scope(value)) || previous.query?.context?.kind !== value.query?.context?.kind)) throw new Error('Primitive decision event scope mismatch');
      if (previous?.entryId) return previous as T;
      if (value.entryId) {
        const entry = await deps.entries.findOne({ _id: value.entryId }, { session });
        if (!entry) throw new Error('Selected content is unavailable');
        const expected = sparcCatalogUseKeys(entry as { _id: string; kind: string; content?: SparcPrimitiveContent });
        if (JSON.stringify(keys(value.contentUseKeys)) !== JSON.stringify(expected)) throw new Error('Selected component changed before it was accepted');
        await assertUnused(value.userId, expected, scope(value), value._id, session);
      }
      if (!previous) await deps.requests.updateOne({ _id: value._id }, { $setOnInsert: value }, { upsert: true, session });
      else if (value.entryId) await deps.requests.updateOne({ _id: value._id, userId: value.userId, entryId: { $exists: false } },
        { $set: { entryId: value.entryId, source: value.source, similarity: value.similarity ?? null, contentUseKeys: keys(value.contentUseKeys) } }, { session });
      const accepted = await deps.requests.findOne({ _id: value._id }, { session });
      if (!accepted || accepted.userId !== value.userId) throw new Error('Primitive decision was not saved');
      return accepted as T;
    });
  }

  async function saveDecision(value: Row): Promise<void> {
    await ensureUser(value.userId);
    await transaction(value.userId, async session => {
      const previous = await deps.figures.findOne({ _id: value._id }, { session });
      if (previous) {
        if (previous.userId !== value.userId || previous.kind !== 'decision' || previous.tdfId !== value.tdfId || previous.sessionId !== value.sessionId) throw new Error('Visual decision ownership mismatch');
        return;
      }
      const contentUseKeys = [value.video ? `video:${value.video.segmentId}` : `image:${value.assetId}`];
      await assertUnused(value.userId, contentUseKeys, undefined, value._id, session);
      await deps.figures.updateOne({ _id: value._id }, { $setOnInsert: { ...value, contentUseKeys } }, { upsert: true, session });
    });
  }

  async function preparePresentations(userId: string, rows: readonly Record<string, unknown>[]): Promise<void> {
    if (!rows.some(row => presentationReceipts(row).length)) return;
    if (rows.some(row => row.userId !== userId)) throw new Error('SPARC presentation commits require one authenticated user');
    await ensureUser(userId);
  }

  /** Caller already owns the per-user history source write in this same session. */
  async function acceptPresentations(userId: string, rows: readonly Record<string, unknown>[], session: Session): Promise<void> {
    if (rows.some(row => row.userId !== userId)) throw new Error('SPARC presentation commits require one authenticated user');
    const receipts = rows.flatMap(presentationReceipts);
    const pending: Row[] = [];
    for (const receipt of receipts) {
      const candidate = keys(receipt.contentUseKeys);
      await assertUnused(userId, candidate, scope(receipt), receipt._id, session, receipt.entryId);
      for (const prior of pending) {
        const sameEvent = sameScope(scope(prior), scope(receipt));
        const repeated = keys(prior.contentUseKeys).filter(key => candidate.includes(key));
        if (repeated.some(key => !(sameEvent && (mediaKey(key) || (receipt.entryId && prior.entryId === receipt.entryId && key === `entry:${receipt.entryId}`))))) {
          throw new SparcContentAlreadyUsedError();
        }
      }
      pending.push(receipt);
    }
    await writeReceipts(pending, session);
  }
  return { ensureUser, saveRequest, saveDecision, preparePresentations, acceptPresentations };
}
