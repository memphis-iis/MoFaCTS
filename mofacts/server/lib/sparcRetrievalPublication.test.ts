import { strict as assert } from 'node:assert';
import { withSparcLessonAccess, createSparcRetrievalPublicationHandler, type SparcRetrievalPublication } from './sparcRetrievalPublicationHandler';

type Callbacks = {
  added(id: string, fields: Record<string, unknown>): void;
  changed(id: string, fields: Record<string, unknown>): void;
  removed(id: string): void;
};

describe('SPARC retrieval publication lifecycle', () => {
  function fixture(options: { unauthorized?: boolean; invalidCatalog?: boolean } = {}) {
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
      if (name === 'catalog') {
        callbacks.added('already-used', { embedding: [1, 0], contentUseKeys: ['text:seen'] });
        callbacks.added('unseen', { embedding: options.invalidCatalog ? [] : [.99, .1] });
      }
      return { stop: () => { stoppedHandles++; } };
    };
    const handler = withSparcLessonAccess(
      async (userId, tdfId) => {
        events.push({ operation: 'authorize' });
        assert.equal(userId, publication.userId); assert.equal(tdfId, 'synthetic-lesson');
        if (options.unauthorized) throw new Error('Not authorized');
        return 'synthetic-learner';
      },
      createSparcRetrievalPublicationHandler({
        observeEntries: observe('catalog'),
        unavailableError: () => new Error('Its content eligibility is unavailable.'),
      }),
    );
    return { events, queries, observers, stoppedHandles: () => stoppedHandles,
      stop: () => { for (const callback of stopCallbacks) callback(); },
      run: () => handler.call(publication, { kind: 'instruction', readingLevel: 'unbiased', responseFormat: 'text' }, 'synthetic-lesson') };
  }

  it('publishes vectors for both previously used and fresh entries after authorization', async () => {
    const f = fixture(); await f.run();
    assert.deepEqual(f.events.map(event => event.operation), ['authorize', 'added', 'added', 'ready']);
    assert.deepEqual(f.queries.map(query => [query.source, query.fields]), [['catalog', { embedding: 1 }]]);
    assert.deepEqual(f.events[1]?.fields, { embedding: [1, 0] });
    f.observers.get('catalog')!.removed('already-used');
    assert.equal(f.events.at(-1)?.operation, 'removed');
    f.stop(); await Promise.resolve();
    assert.equal(f.stoppedHandles(), 1);
  });

  it('does not read source metadata for unauthorized subscriptions', async () => {
    const denied = fixture({ unauthorized: true });
    await assert.rejects(denied.run(), /Not authorized/);
    assert.deepEqual(denied.events, [{ operation: 'authorize' }]);
    assert.equal(denied.queries.length, 0);
  });

  it('fails closed and stops every observer when an embedding is invalid', async () => {
    const f = fixture({ invalidCatalog: true }); await f.run(); await Promise.resolve();
    assert.equal(f.events.at(-1)?.operation, 'error');
    assert.equal(f.events.some(event => event.operation === 'ready'), false);
    assert.equal(f.stoppedHandles(), 1);
    assert.match(String(f.events.at(-1)?.fields?.message), /content eligibility is unavailable/);
  });
});
