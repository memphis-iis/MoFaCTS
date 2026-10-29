import { SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, parseSparcRetrievalCategory, sparcRetrievalCategoryKey } from '../../common/lib/sparcRetrieval';
import { sparcRetrievalSelector } from './sparcRetrievalSelector';
import { createSparcRetrievalPublicationState } from './sparcRetrievalPublicationState';

type Observer = { stop(): void | Promise<void> };
type Callbacks = {
  added(id: string, fields: Record<string, unknown>): void;
  changed(id: string, fields: Record<string, unknown>): void;
  removed(id: string): void;
};
type Observe = (selector: Record<string, unknown>, options: { fields: Record<string, 1>; batchSize: number }, callbacks: Callbacks) => Promise<Observer>;
export type SparcRetrievalPublication = {
  userId?: string | null;
  onStop(callback: () => void): void;
  added(collection: string, id: string, fields: { embedding: number[] }): void;
  changed(collection: string, id: string, fields: { embedding: number[] }): void;
  removed(collection: string, id: string): void;
  ready(): void;
  error(error: Error): void;
};

/** Authorization, initialization and live eligibility share one observable lifecycle. */
export function createSparcRetrievalPublicationHandler(deps: {
  authorize(userId: string | null | undefined, tdfId: unknown): Promise<string>;
  initializeCatalog(): Promise<void>;
  initializeUser(userId: string): Promise<void>;
  observeMoves: Observe;
  observeVisuals: Observe;
  observeEntries: Observe;
  unavailableError(): Error;
}) {
  return async function(this: SparcRetrievalPublication, value: unknown, tdfId?: string) {
    const userId = await deps.authorize(this.userId, tdfId);
    const category = parseSparcRetrievalCategory(value);
    const prefix = `${sparcRetrievalCategoryKey(category)}:`;
    let stopped = false;
    const handles: Observer[] = [];
    const stop = async () => {
      stopped = true;
      await Promise.all(handles.splice(0).map(handle => handle.stop()));
    };
    this.onStop(() => { void stop().catch(() => undefined); });
    const fail = () => {
      if (!stopped) { stopped = true; this.error(deps.unavailableError()); }
    };
    const guarded = <Args extends unknown[]>(work: (...args: Args) => void) => (...args: Args) => {
      if (!stopped) { try { work(...args); } catch { fail(); } }
    };
    const retain = async (pending: Promise<Observer>) => {
      const handle = await pending;
      if (stopped) await handle.stop(); else handles.push(handle);
    };
    const state = createSparcRetrievalPublicationState(this, SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix);
    await deps.initializeCatalog();
    await deps.initializeUser(userId);
    if (stopped) return;
    const sources = [
      { name: 'move', observe: deps.observeMoves, selector: { userId, $or: [{ entryId: { $exists: true } }, { kind: 'presentation-use' }] } },
      { name: 'visual', observe: deps.observeVisuals, selector: { kind: 'decision', userId } },
    ];
    for (const source of sources) {
      await retain(source.observe(source.selector, { fields: { contentUseKeys: 1 }, batchSize: 100 }, {
        added: guarded((id: string, fields: Record<string, unknown>) => state.setUse(`${source.name}:${id}`, fields.contentUseKeys)),
        changed: guarded((id: string, fields: Record<string, unknown>) => state.setUse(`${source.name}:${id}`, fields.contentUseKeys)),
        removed: guarded((id: string) => state.removeUse(`${source.name}:${id}`)),
      }));
      if (stopped) return;
    }
    // Ranking remains in the browser. Content bodies and user-use metadata stay on the server.
    await retain(deps.observeEntries(sparcRetrievalSelector(category), { fields: { embedding: 1, contentUseKeys: 1 }, batchSize: 100 }, {
      added: guarded((id: string, fields: Record<string, unknown>) => state.setEntry(id, fields)),
      changed: guarded((id: string, fields: Record<string, unknown>) => state.setEntry(id, fields)),
      removed: guarded((id: string) => state.removeEntry(id)),
    }));
    if (!stopped) this.ready();
  };
}
