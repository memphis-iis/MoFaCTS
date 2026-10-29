import { strict as assert } from 'node:assert';
import { createSparcRetrievalPublicationState } from './sparcRetrievalPublicationState';

describe('per-user SPARC retrieval publication eligibility', () => {
  function fixture() {
    const events: Array<{ operation: string; collection: string; id: string; fields?: unknown }> = [];
    const state = createSparcRetrievalPublicationState({
      added: (collection, id, fields) => { events.push({ operation: 'added', collection, id, fields }); },
      changed: (collection, id, fields) => { events.push({ operation: 'changed', collection, id, fields }); },
      removed: (collection, id) => { events.push({ operation: 'removed', collection, id }); },
    }, 'vectors', 'category:');
    return { events, state };
  }

  it('excludes every matched instruction containing a used explanation, support or image', () => {
    const f = fixture();
    f.state.setUse('move:old-turn', ['text:explanation', 'image:seen']);
    f.state.setEntry('same-explanation', { embedding: [1, 0], contentUseKeys: ['text:explanation', 'text:fresh-support'] });
    f.state.setEntry('same-image', { embedding: [1, 0], contentUseKeys: ['text:fresh-explanation', 'image:seen'] });
    f.state.setEntry('unseen', { embedding: [.99, .1], contentUseKeys: ['text:unseen-explanation', 'text:unseen-support'] });
    assert.deepEqual(f.events, [{ operation: 'added', collection: 'vectors', id: 'category:unseen', fields: { embedding: [.99, .1] } }]);
  });

  it('removes newly used candidates live and transmits only vectors when another user remains eligible', () => {
    const first = fixture(), second = fixture();
    const row = { embedding: [1, 0], contentUseKeys: ['entry:selected', 'text:material', 'video:segment'] };
    first.state.setEntry('selected', row); second.state.setEntry('selected', row);
    first.state.setUse('figure:new-turn', ['video:segment']);
    assert.equal(first.events.at(-1)?.operation, 'removed');
    assert.equal(second.events.length, 1);
    assert.deepEqual(second.events[0]?.fields, { embedding: [1, 0] });
    first.state.setEntry('selected', { embedding: [0, 1] });
    assert.equal(first.events.length, 2, 'Changing an excluded vector cannot expose it');
    second.state.setEntry('selected', { embedding: [0, 1] });
    assert.equal(second.events.at(-1)?.operation, 'changed');
  });

  it('tracks changed and removed accepted decisions without releasing keys used by another decision', () => {
    const f = fixture();
    f.state.setEntry('selected', { embedding: [1], contentUseKeys: ['text:material'] });
    f.state.setUse('move:first', ['text:material']);
    f.state.setUse('move:second', ['text:material']);
    f.state.removeUse('move:first');
    assert.equal(f.events.length, 2);
    f.state.setUse('move:second', ['text:different']);
    assert.equal(f.events.at(-1)?.operation, 'added');
    f.state.removeEntry('selected');
    f.state.removeUse('move:second');
    assert.equal(f.events.at(-1)?.operation, 'removed');
  });

  it('updates component metadata as an entry changes and rejects missing metadata before publication', () => {
    const f = fixture();
    assert.throws(() => f.state.setEntry('incomplete', { embedding: [1] }), /content-use metadata/);
    assert.equal(f.events.length, 0);
    f.state.setUse('move:used', ['text:used']);
    f.state.setEntry('revised', { embedding: [1], contentUseKeys: ['text:new'] });
    f.state.setEntry('revised', { contentUseKeys: ['text:used'] });
    assert.equal(f.events.at(-1)?.operation, 'removed');
    f.state.setEntry('revised', { contentUseKeys: ['text:new-again'] });
    assert.equal(f.events.at(-1)?.operation, 'added');
    assert.throws(() => f.state.setUse('bad', []), /content-use metadata/);
    assert.throws(() => f.state.setUse('bad-prefix', ['unknown:identity']), /content-use metadata/);
    f.state.setUse('whole-payload', ['payload:accepted-part']);
    f.state.setEntry('repeated-payload', { embedding: [1], contentUseKeys: ['payload:accepted-part'] });
    assert.equal(f.events.some(event => event.id === 'category:repeated-payload'), false);
  });
});
