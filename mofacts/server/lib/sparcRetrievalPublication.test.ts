import { strict as assert } from 'node:assert';
import { createSparcRetrievalPublicationHandler, type SparcRetrievalPublication } from './sparcRetrievalPublicationHandler';

type Callbacks = {
  added(id: string, fields: Record<string, unknown>): void;
  changed(id: string, fields: Record<string, unknown>): void;
  removed(id: string): void;
};

describe('SPARC retrieval publication lifecycle', () => {
  function fixture(options: { unauthorized?: boolean; stopDuringInitialization?: boolean; invalidCatalog?: boolean } = {}) {
    const events: Array<{ operation: string; id?: string; fields?: Record<string, unknown> }> = [];
    const queries: Array<{ source: string; selector: unknown; fields: unknown }> = [];
    const observers = new Map<string, Callbacks>();
    const stopCallbacks: Array<() => void> = [];
    let stoppedHandles = 0;
    const publication: SparcRetrievalPublication = {
      userId: 'synthetic-learner', onStop: callback => { stopCallbacks.push(callback); },
      added: (_collection, id, fields) => { events.push({ operation: 'added', id, fields }); },
      changed: (_collection, id, fields) => { events.push({ operation: 'changed', id, fields }); },
      removed: (_collection, id) => { events.push({ operation: 'removed', id }); },
      ready: () => { events.push({ operation: 'ready' }); },
      error: error => { events.push({ operation: 'error', fields: { message: error.message } }); for (const callback of stopCallbacks) callback(); },
    };
    const observe = (name: string) => async (selector: unknown, settings: { fields: unknown }, callbacks: Callbacks) => {
      queries.push({ source: name, selector, fields: settings.fields });
      observers.set(name, callbacks);
      if (name === 'moves') callbacks.added('historical-output', { contentUseKeys: ['text:seen'] });
      if (name === 'catalog') {
        callbacks.added('already-used', { embedding: [1, 0], contentUseKeys: ['text:seen'] });
        callbacks.added('unseen', { embedding: [.99, .1], ...(options.invalidCatalog ? {} : { contentUseKeys: ['text:fresh'] }) });
      }
      return { stop: () => { stoppedHandles++; } };
    };
    const handler = createSparcRetrievalPublicationHandler({
      authorize: async (userId, tdfId) => {
        events.push({ operation: 'authorize' });
        assert.equal(userId, publication.userId); assert.equal(tdfId, 'synthetic-lesson');
        if (options.unauthorized) throw new Error('Not authorized');
        return 'synthetic-learner';
      },
      initializeCatalog: async () => { events.push({ operation: 'catalog-metadata' }); },
      initializeUser: async userId => {
        assert.equal(userId, publication.userId); events.push({ operation: 'user-metadata' });
        if (options.stopDuringInitialization) for (const callback of stopCallbacks) callback();
      },
      observeMoves: observe('moves'), observeVisuals: observe('visuals'), observeEntries: observe('catalog'),
      unavailableError: () => new Error('Its content eligibility is unavailable.'),
    });
    return { events, queries, observers, stoppedHandles: () => stoppedHandles,
      stop: () => { for (const callback of stopCallbacks) callback(); },
      run: () => handler.call(publication, { kind: 'instruction', readingLevel: 'unbiased', responseFormat: 'text' }, 'synthetic-lesson') };
  }

  it('authorizes and initializes historical eligibility before publishing unseen vector-only rows', async () => {
    const f = fixture(); await f.run();
    assert.deepEqual(f.events.map(event => event.operation), ['authorize', 'catalog-metadata', 'user-metadata', 'added', 'ready']);
    assert.deepEqual(f.queries[0], { source: 'moves', selector: { userId: 'synthetic-learner', $or: [{ entryId: { $exists: true } }, { kind: 'presentation-use' }] }, fields: { contentUseKeys: 1 } });
    assert.deepEqual(f.queries[1], { source: 'visuals', selector: { kind: 'decision', userId: 'synthetic-learner' }, fields: { contentUseKeys: 1 } });
    assert.deepEqual(f.queries[2]?.fields, { embedding: 1, contentUseKeys: 1 });
    assert.deepEqual(f.events.find(event => event.operation === 'added')?.fields, { embedding: [.99, .1] });
    f.observers.get('moves')!.added('next-turn', { contentUseKeys: ['text:fresh'] });
    assert.equal(f.events.at(-1)?.operation, 'removed');
    f.stop(); await Promise.resolve();
    assert.equal(f.stoppedHandles(), 3);
  });

  it('does not read source metadata for unauthorized subscriptions or open observers after stop', async () => {
    const denied = fixture({ unauthorized: true });
    await assert.rejects(denied.run(), /Not authorized/);
    assert.deepEqual(denied.events, [{ operation: 'authorize' }]);
    assert.equal(denied.queries.length, 0);
    const stopped = fixture({ stopDuringInitialization: true });
    await stopped.run();
    assert.equal(stopped.queries.length, 0);
    assert.equal(stopped.events.some(event => event.operation === 'ready'), false);
  });

  it('fails closed and stops every observer when catalog metadata is incomplete', async () => {
    const f = fixture({ invalidCatalog: true }); await f.run(); await Promise.resolve();
    assert.equal(f.events.some(event => event.operation === 'added'), false);
    assert.equal(f.events.at(-1)?.operation, 'error');
    assert.equal(f.events.some(event => event.operation === 'ready'), false);
    assert.equal(f.stoppedHandles(), 3);
    assert.match(String(f.events.at(-1)?.fields?.message), /content eligibility is unavailable/);
  });
});
