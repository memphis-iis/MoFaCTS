import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tracker } from 'meteor/tracker';
import { SparcEmbeddingIndex } from '../../../../../../learning-components/runtime/sparcEmbeddingIndex';
import { SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, parseSparcRetrievalCategory, sparcRetrievalCategoryKey,
  type SparcRetrievalCategory } from '../../../../../common/lib/sparcRetrieval';
import type { SparcReadingLevel } from '../../../../../../learning-components/runtime/sparcReadingLevel';

type RetrievalDependencies = {
  userId(): string | null;
  autorun(effect: () => void): unknown;
  subscribe(name: string, category: SparcRetrievalCategory, callbacks: { onReady(): void; onStop(error?: unknown): void }): { stop(): void };
  vectors: { find(selector: { _id: { $regex: string } }): { observeChanges(callbacks: {
    added(id: string, fields: { embedding?: number[] }): void;
    changed(id: string, fields: { embedding?: number[] }): void;
    removed(id: string): void;
  }): { stop(): void } } };
};

/** One cache owner; dependencies make its subscription lifecycle testable in both runtimes. */
export function createSparcLocalRetrieval(deps: RetrievalDependencies) {
  type CachedCategory = { index: SparcEmbeddingIndex; ready: Promise<void>; stop(): void; error?: unknown };
  const categories = new Map<string, CachedCategory>();
  let account: string | null = null;
  deps.autorun(() => {
    const current = deps.userId();
    if (current !== account) {
      for (const cache of categories.values()) { cache.stop(); cache.index.clear(); }
      categories.clear(); account = current;
    }
  });

  /** Live ID/vector-only subscriptions populate a browser-owned index once per category. */
  async function prepareSparcLocalRetrieval(value: SparcRetrievalCategory): Promise<SparcEmbeddingIndex> {
    const category = parseSparcRetrievalCategory(value);
    const key = sparcRetrievalCategoryKey(category);
    if (!deps.userId()) throw new Error('Library retrieval requires an authenticated account');
    let cache = categories.get(key);
    if (!cache) {
      const prefix = `${key}:`;
      const index = new SparcEmbeddingIndex();
      let resolve!: () => void; let reject!: (error: unknown) => void;
      const ready = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
      let observer: { stop(): void } | undefined;
      let subscription: { stop(): void } | undefined;
      cache = { index, ready, stop() {
        const activeSubscription = subscription; const activeObserver = observer;
        subscription = undefined; observer = undefined;
        activeObserver?.stop(); activeSubscription?.stop();
      } };
      const current = cache;
      const fail = (error: unknown) => {
        if (current.error) return;
        current.error = error;
        if (categories.get(key) === current) categories.delete(key);
        reject(error);
        current.stop();
        index.clear();
      };
      const update = (id: string, fields: { embedding?: number[] }) => {
        try {
          if (!fields.embedding) throw new Error('Library cache update omitted its embedding');
          index.set(id.slice(prefix.length), fields.embedding);
        } catch (error) { fail(error); }
      };
      categories.set(key, current);
      try {
        observer = deps.vectors.find({ _id: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }).observeChanges({
          added: update, changed: update, removed: id => index.remove(id.slice(prefix.length)),
        });
        if (!current.error) subscription = deps.subscribe('sparcRetrievalEmbeddings', category, {
          onReady() { resolve(); }, onStop(error: unknown) {
            fail(error ?? new Error('The local retrieval cache subscription stopped'));
          },
        });
        // Observers and subscription callbacks may fail synchronously before their handles exist.
        if (current.error) current.stop();
      } catch (error) { fail(error); }
    }
    await cache.ready;
    if (cache.error) throw cache.error;
    return cache.index;
  }
  return { prepareSparcLocalRetrieval };
}

let localRetrieval: ReturnType<typeof createSparcLocalRetrieval> | undefined;
export async function prepareSparcLocalRetrieval(value: SparcRetrievalCategory): Promise<SparcEmbeddingIndex> {
  localRetrieval ??= createSparcLocalRetrieval({
    userId: () => Meteor.userId(), autorun: effect => Tracker.autorun(effect),
    subscribe: (name, category, callbacks) => Meteor.subscribe(name, category, callbacks),
    vectors: new Mongo.Collection<{ _id: string; embedding: number[] }>(SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION),
  });
  return localRetrieval.prepareSparcLocalRetrieval(value);
}

/** Load category vectors before the first learner response; later practice searches stay local. */
export async function prepareSparcPracticeRetrieval(readingLevel: SparcReadingLevel, language: string): Promise<void> {
  await Promise.all([
    ...['feedback', 'explanation'].map(kind => prepareSparcLocalRetrieval({
      kind: kind as 'feedback' | 'explanation', readingLevel, responseFormat: 'text',
    })),
    prepareSparcLocalRetrieval({ kind: 'richContent', readingLevel, responseFormat: 'text', supportKind: 'written' }),
    ...['text', 'multiple-choice', 'cloze', 'true-false'].map(responseFormat => prepareSparcLocalRetrieval({ kind: 'question', readingLevel, responseFormat })),
    prepareSparcLocalRetrieval({ kind: 'visual', language }),
  ]);
}

