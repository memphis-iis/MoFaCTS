import { SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, parseSparcRetrievalCategory, sparcRetrievalCategoryKey } from '../../common/lib/sparcRetrieval';
import { sparcRetrievalSelector } from './sparcRetrievalSelector';

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

export type SparcRetrievalAuthorization = (actor: string | null | undefined, lesson: unknown) => Promise<string>;

export function withSparcLessonAccess<T extends { userId?: string | null }, R>(
  authorize: SparcRetrievalAuthorization, handler: (this: T, category: unknown, userId: string) => R,
) {
  return async function(this: T, category: unknown, lesson?: unknown): Promise<Awaited<R>> {
    const userId = await authorize(this.userId, lesson);
    return await handler.call(this, category, userId);
  };
}

/** Publish catalog vectors for the authorized lesson subscription. */
export function createSparcRetrievalPublicationHandler(deps: {
  observeEntries: Observe;
  unavailableError(): Error;
}) {
  return async function(this: SparcRetrievalPublication, value: unknown) {
    const category = parseSparcRetrievalCategory(value);
    const prefix = `${sparcRetrievalCategoryKey(category)}:`;
    let stopped = false;
    let observer: Observer | undefined;
    this.onStop(() => {
      stopped = true;
      if (observer) void observer.stop();
    });
    const fail = () => {
      if (!stopped) { stopped = true; this.error(deps.unavailableError()); }
    };
    const guarded = <Args extends unknown[]>(work: (...args: Args) => void) => (...args: Args) => {
      if (!stopped) { try { work(...args); } catch { fail(); } }
    };
    const publish = (operation: 'added' | 'changed', id: string, fields: Record<string, unknown>) => {
      const embedding = fields.embedding;
      if (!Array.isArray(embedding) || !embedding.length || !embedding.every(Number.isFinite)) throw new Error('Invalid library embedding');
      this[operation](SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix + id, { embedding });
    };
    observer = await deps.observeEntries(sparcRetrievalSelector(category), { fields: { embedding: 1 }, batchSize: 100 }, {
      added: guarded((id, fields) => publish('added', id, fields)),
      changed: guarded((id, fields) => publish('changed', id, fields)),
      removed: guarded(id => this.removed(SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix + id)),
    });
    if (stopped) await observer.stop();
    else this.ready();
  };
}
