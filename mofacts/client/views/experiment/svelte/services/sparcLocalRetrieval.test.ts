import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { createSparcLocalRetrieval } from './sparcLocalRetrieval';
import * as embeddings from './sparcLocalEmbeddings';
import { createSparcMoveLibraryClient } from './sparcMoveLibraryClient';
import { sparcRetrievalCategoryKey } from '../../../../../common/lib/sparcRetrieval';

describe('Browser retrieval cache lifecycle and independent embedding calls', () => {
  it('searches local rows, applies live updates/removals, clears on account changes and caches completed queries only', async () => {
    type Callbacks = { added(id: string, fields: { embedding: number[] }): void; changed(id: string, fields: { embedding: number[] }): void; removed(id: string): void };
    const observers: Array<{ regex: RegExp; callbacks: Callbacks }> = [];
    const effects: Array<() => void> = [];
    const methodCalls: string[] = [];
    let subscriptionFailure: Error | undefined;
    let userId = 'admin'; let subscriptions = 0; let providerCalls = 0;
    const meteor = { userId: () => userId,
      subscribe(_name: string, _category: unknown, callbacks: { onReady(): void; onStop(error?: unknown): void }) {
        subscriptions++; queueMicrotask(() => subscriptionFailure ? callbacks.onStop(subscriptionFailure) : callbacks.onReady()); return { stop() { callbacks.onStop(); } };
      },
      async callAsync(name: string, params: { input: string[] }) {
        methodCalls.push(name);
        if (name === 'lookupSparcPrimitive') return { status: 'hit' };
        assert.equal(name, 'callResolvedOpenRouterEmbeddings'); providerCalls++;
        return { embeddings: params.input.map(() => [2, 0]), costUsd: .01 };
      },
    };
    class Collection {
      find(selector: { _id: { $regex: string } }) {
        return { observeChanges(callbacks: Callbacks) {
          const observer = { regex: new RegExp(selector._id.$regex), callbacks }; observers.push(observer);
          return { stop() { const position = observers.indexOf(observer); if (position >= 0) observers.splice(position, 1); } };
        } };
      }
    }
    const cache = createSparcLocalRetrieval({ ...meteor, vectors: new Collection(),
      autorun(effect) { effects.push(effect); effect(); },
    });
    const client = createSparcMoveLibraryClient(cache.prepareSparcLocalRetrieval);
    const originalUserId = Meteor.userId;
    const originalCallAsync = Meteor.callAsync;
    Meteor.userId = meteor.userId;
    Meteor.callAsync = meteor.callAsync as typeof Meteor.callAsync;
    try {
      const category = { kind: 'explanation' as const, readingLevel: 'unbiased' as const, responseFormat: 'text' };
      const index = await cache.prepareSparcLocalRetrieval(category);
      const id = `${sparcRetrievalCategoryKey(category)}:chosen`;
      assert.ok(observers[0]!.regex.test(id));
      observers[0]!.callbacks.added(id, { embedding: [3, 0] });
      assert.equal(index.maximum([1, 0], .95)?.entryId, 'chosen');
      assert.equal(await cache.prepareSparcLocalRetrieval(category), index); assert.equal(subscriptions, 1);
      observers[0]!.callbacks.changed(id, { embedding: [0, 2] });
      assert.equal(index.maximum([1, 0], .95), null);
      observers[0]!.callbacks.removed(id); assert.equal(index.size, 0);
      observers[0]!.callbacks.added(id, { embedding: [1, 0] });
      userId = 'other-admin'; effects[0]!(); assert.equal(index.size, 0); assert.equal(observers.length, 0);
      assert.notEqual(await cache.prepareSparcLocalRetrieval(category), index); assert.equal(subscriptions, 2);
      const costs: number[] = [];
      const usage = (value: { costUsd?: number }) => { costs.push(value.costUsd!); };
      await embeddings.embedSparcTexts('lesson', ['known'], usage); await embeddings.embedSparcTexts('lesson', ['known'], usage);
      assert.equal(providerCalls, 1, 'Completed query vectors are reused locally');
      assert.deepEqual(costs, [.01], 'Cache hits must not count a provider charge twice');
      await Promise.all([embeddings.embedSparcTexts('lesson', ['new']), embeddings.embedSparcTexts('lesson', ['new'])]);
      assert.equal(providerCalls, 3, 'Concurrent misses stay independent instead of joining in-flight calls');
      const query = { tdfId: 'lesson', context: category, queryText: 'library query', previousQuestions: [] } as unknown as import('../../../../../../learning-components/runtime/sparcMoveLibraryContract').SparcPrimitiveQuery;
      methodCalls.length = 0;
      const miss = await client.lookup(query);
      assert.equal(miss.status, 'generate');
      assert.deepEqual(methodCalls, ['callResolvedOpenRouterEmbeddings'], 'A local miss sends no lookup or pending-record call');
      methodCalls.length = 0;
      const visual = await client.lookup({ ...query, context: { ...query.context, kind: 'richContent', supportKind: 'visual' } });
      assert.equal(visual.status, 'generate');
      assert.deepEqual(methodCalls, [], 'Visual primitives neither embed nor call the server before generating their brief');
      observers[0]!.callbacks.added(id, { embedding: [1, 0] });
      assert.equal((await client.lookup(query)).status, 'hit');
      assert.deepEqual(methodCalls, ['lookupSparcPrimitive'], 'A hit fetches only the chosen content and reuses the completed query vector');
      userId = ''; effects[0]!();
      userId = 'retry-user'; effects[0]!();
      subscriptionFailure = new Error('Publication unavailable');
      const beforeFailure = subscriptions;
      await assert.rejects(cache.prepareSparcLocalRetrieval(category), /Publication unavailable/);
      assert.equal(observers.length, 0, 'A failed subscription disposes its observer');
      assert.equal(subscriptions, beforeFailure + 1, 'No automatic retry');
      subscriptionFailure = undefined;
      const recovered = await cache.prepareSparcLocalRetrieval(category);
      assert.equal(subscriptions, beforeFailure + 2, 'An explicit new attempt creates a fresh subscription');
      observers[0]!.callbacks.added(id, { embedding: [0, 0] });
      assert.equal(recovered.size, 0);
      assert.equal(observers.length, 0, 'Invalid live vectors also discard the failed cache');
      assert.notEqual(await cache.prepareSparcLocalRetrieval(category), recovered);
    } finally {
      userId = ''; effects[0]!();
      Meteor.userId = originalUserId; Meteor.callAsync = originalCallAsync;
    }
  });
});
