import { sparcInstructionalNeedText, SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { strict as assert } from 'node:assert';
import { createMoveLibraryService, type MoveStore, type MoveEntry, type MoveRequest, type MoveExposure } from './sparcMoveLibraryService';
import { SPARC_MOVE_LIBRARY_VERSION, type SparcPrimitiveQuery } from '../../../learning-components/units/sparcsession/sparcMoveLibrary';
import { moveExposuresFromHistory } from './sparcMoveExposureProjection';

function fixture() {
  const removed = new Set<string>();
  const entries = new Map<string, MoveEntry>(), requests = new Map<string, MoveRequest>(), exposures = new Map<string, MoveExposure>(), leases = new Map<string, string>();
  let embeds = 0, exposureReads = 0;
  const store: MoveStore = {
    request: async id => { const r = requests.get(id); return r ? { ...r } : undefined; }, saveRequest: async r => { if (!requests.get(r._id)?.entryId) requests.set(r._id, { ...r }); return requests.get(r._id)!; },
    entry: async id => entries.get(id), saveEntry: async e => { if (!entries.has(e._id)) entries.set(e._id, e); },
    candidates: async (kind, embeddingModel, after) => [...entries.values()].filter(e => e.kind === kind && e.embeddingModel === embeddingModel && e._id > after).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 100),
    exposures: async (userId, tdfId) => { exposureReads++; return [...exposures.values()].filter(e => e.userId === userId && e.tdfId === tdfId); },
    reservedQuestions: async (userId, tdfId) => [...requests.values()].filter(r => r.userId === userId && r.query.tdfId === tdfId && r.query.context.kind === 'question' && r.entryId && entries.has(r.entryId)).map(r => ({ _id: r._id, userId, tdfId, sessionId: r.query.sessionId, eventId: r.query.eventId,
      kind: 'question', nodeId: `${r.query.eventId}:question`, entryId: r.entryId!, content: entries.get(r.entryId!)!.content, questionEmbedding: entries.get(r.entryId!)!.questionEmbedding! })),
    expose: async e => { exposures.set(e._id, e); },
    acquire: async (key, token) => { if (leases.has(key) && leases.get(key) !== token) return false; leases.set(key, token); return true; },
    release: async (key, token) => { if (leases.get(key) === token) leases.delete(key); },
    list: async () => [...entries.values()],
    removed: async id => removed.has(id),
    saveQuestionEmbedding: async (id, vector, location) => { const item = location === 'entry' ? entries.get(id) : exposures.get(id); if (item) item.questionEmbedding = vector; },
    revise: async entry => { entries.set(entry._id, entry); },
  };
  const make = (wait?: (ms: number) => Promise<void>) => createMoveLibraryService({ store, embeddingModel: 'fixture', ...(wait ? { wait } : {}),
    embed: async text => { embeds++; return text.includes('distinct') ? [0, 1] : [1, 0]; }, verifyFigure: async () => {} });
  return { entries, removed, requests, exposures, leases, store, make, counts: () => ({ embeds, exposureReads }) };
}
function needText(value: string) { return sparcInstructionalNeedText({ target: { texts: [value] }, assistance: 2.52, evidence: [] }); }
function query(eventId = 'one', kind: SparcPrimitiveQuery['context']['kind'] = 'explanation'): SparcPrimitiveQuery {
  return { tdfId: 'biology', sessionId: 'attempt', eventId, context: { version: SPARC_MOVE_LIBRARY_VERSION, kind,
    target: 'species', move: 'example', assistance: 2.52, responseFormat: 'text', requirements: 'Reproductive isolation', components: [kind], focus: 'Gene flow unresolved', dependencies: 'null', specification: 'fixture-v1' }, queryText: needText('instructional situation'), previousQuestions: [] };
}

describe('Shared instructional primitive library', () => {
  it('embeds the same canonical need for saving and retrieval of every primitive type', async () => {
    for (const kind of ['explanation', 'feedback', 'richContent', 'question'] as const) {
      const f = fixture(), inputs: string[] = [];
      const service = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async text => {
        inputs.push(text); return text.startsWith('{') ? [3, 4] : [0, 5];
      } });
      const original = query('save', kind);
      const lookup = await service.lookup('alice', original);
      if (lookup.status !== 'generate') throw new Error('Expected first encounter to generate');
      const content = { text: kind === 'question' ? 'Which relationship holds?' : 'Saved instructional content.' };
      const published = await service.publish('alice', lookup.ticket, content);
      if (!published.accepted) throw new Error('Expected content acceptance');
      const entry = f.entries.get(published.reference.entryId)!;
      assert.deepEqual(entry.embedding, [.6, .8]);
      assert.deepEqual(entry.embedding, f.requests.get(lookup.ticket)!.embedding);
      assert.equal(entry.embeddingVersion, SPARC_INSTRUCTIONAL_NEED_VERSION);
      if (kind === 'question') assert.deepEqual(entry.questionEmbedding, { model: 'fixture', text: content.text, vector: [0, 1] });
      const fresh = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async text => {
        inputs.push(text); return text.startsWith('{') ? [3, 4] : [0, 5];
      } });
      const found = await fresh.lookup('bob', { ...original, eventId: 'retrieve' });
      assert.equal(found.status, 'hit');
      if (found.status !== 'hit') throw new Error('Expected saved content retrieval');
      assert.equal(found.reference.entryId, entry._id);
      assert.deepEqual(inputs, kind === 'question' ? [original.queryText, content.text, original.queryText] : [original.queryText, original.queryText]);
    }
  });

  it('preserves accepted decisions but rejects an unfinished request or candidate from an unconverted representation', async () => {
    const f = fixture(), service = f.make(), q = query();
    const pending = await service.lookup('alice', q); if (pending.status !== 'generate') throw new Error();
    const request = f.requests.get(pending.ticket)!;
    request.embeddingVersion = 'previous-representation';
    await assert.rejects(service.lookup('alice', q), /reindexing/);
    await assert.rejects(service.publish('alice', pending.ticket, { text: 'Saved instruction.' }), /reindexing/);
    request.embeddingVersion = SPARC_INSTRUCTIONAL_NEED_VERSION;
    const accepted = await service.publish('alice', pending.ticket, { text: 'Saved instruction.' }); if (!accepted.accepted) throw new Error();
    const entry = f.entries.get(accepted.reference.entryId)!; entry.embeddingVersion = 'previous-representation';
    assert.equal((await service.lookup('alice', q)).status, 'hit');
    await assert.rejects(service.lookup('bob', query('new')), /reindexing/);
  });
  it('shares content across learners, highlights the original exposure, and stamps deleted accepted content', async () => {
    const f = fixture(), s = f.make(), q = query();
    const first = await s.lookup('alice', q); assert.equal(first.status, 'generate');
    if (first.status !== 'generate') throw new Error('Expected generation');
    const published = await s.publish('alice', first.ticket, { text: 'Isolation reduces gene flow.' }); assert.equal(published.accepted, true);
    if (!published.accepted) throw new Error('Expected acceptance');
    await s.present('alice', q, published.reference, 'one:explanation');
    const other = await f.make().lookup('bob', query('two')); assert.equal(other.status, 'hit');
    if (other.status !== 'hit') throw new Error('Expected reuse');
    assert.equal(other.reference.priorNodeId, undefined);
    const again = await f.make().lookup('alice', query('three')); assert.equal(again.status, 'hit');
    if (again.status !== 'hit') throw new Error('Expected reuse');
    assert.equal(again.reference.priorNodeId, 'one:explanation');
    await s.present('alice', query('three'), again.reference, 'three:explanation');
    const fourth = await f.make().lookup('alice', query('four')); assert.equal(fourth.status === 'hit' && fourth.reference.priorNodeId, 'one:explanation');
    f.entries.delete(published.reference.entryId); f.removed.add(published.reference.entryId);
    assert.equal((await f.make().lookup('alice', q)).status, 'hit');
    assert.equal((await f.make().lookup('carol', query('five'))).status, 'generate');
    assert.equal(f.entries.size, 0);
  });

  it('uses embeddings without exact-context restrictions or a calibration gate', async () => {
    const f = fixture(), s = f.make(), q = query();
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    await s.publish('alice', first.ticket, { text: 'Isolation reduces gene flow.' });
    const changed = { ...query('two'), queryText: needText('semantically similar wording') };
    assert.equal((await s.lookup('bob', changed)).status, 'hit');
    for (const context of [{ target: 'another KC' }, { assistance: 1.55 }, { dependencies: 'different figure' }, { specification: 'changed policy' },
      { focus: 'Paraphrased assessment' }, { requirements: 'Paraphrased requirement' }, { move: 'another move' }, { components: ['explanation', 'question'] as const }]) {
      const altered = { ...query(JSON.stringify(context)), context: { ...q.context, ...context } };
      assert.equal((await s.lookup('carol', altered as SparcPrimitiveQuery)).status, 'hit');
    }
    assert.equal((await s.lookup('dana', query('feedback', 'feedback'))).status, 'generate');
  });

  it('applies the 0.90 boundary even to identical text and supports tightening it', async () => {
    const f = fixture(), s = f.make();
    const first = await s.lookup('alice', query()); if (first.status !== 'generate') throw new Error();
    await s.publish('alice', first.ticket, { text: 'Reusable explanation.' });
    const make = (similarity: number, minimumSimilarity = .9) => createMoveLibraryService({ store: f.store, embeddingModel: 'fixture',
      minimumSimilarity, embed: async () => [similarity, Math.sqrt(1 - similarity ** 2)] });
    assert.equal((await make(.899).lookup('below', query())).status, 'generate');
    // Release the pending generation lease so the independent next comparison can proceed.
    f.leases.clear();
    assert.equal((await make(.901).lookup('above', query())).status, 'hit');
    assert.equal((await make(.91, .95).lookup('tightened', query())).status, 'generate');
    assert.throws(() => make(.9, NaN), /minimum cosine similarity/);
  });

  it('rejects repeated questions across attempts, accepts different evidence, and keeps learner exposure private', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    const p = await s.publish('alice', first.ticket, { text: 'What separates these populations?' });
    if (!p.accepted) throw new Error();
    await s.present('alice', q, p.reference, 'one:question');
    const next = { ...query('two', 'question'), sessionId: 'new-attempt' };
    const blocked = await f.make().lookup('alice', next); assert.equal(blocked.status, 'generate');
    if (blocked.status !== 'generate') throw new Error();
    const generated = await s.publish('alice', blocked.ticket, { text: 'Which barrier keeps these birds apart?' });
    assert.equal(generated.accepted, false);
    assert.equal(f.leases.size, 0, 'rejection must release the generation lease');
    const different = await s.publish('alice', blocked.ticket, { text: 'Make a distinct prediction about removing the barrier.' });
    assert.equal(different.accepted, true);
    assert.equal((await f.make().lookup('bob', query('two', 'question'))).status, 'hit');
    await assert.rejects(s.publish('bob', blocked.ticket, { text: 'tampered' }), /Unknown/);
  });

  it('waits for a concurrent matching generator and uses its published content', async () => {
    const f = fixture(), firstService = f.make(), q = query();
    const first = await firstService.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    let waits = 0;
    const waiting = f.make(async () => { waits++; await firstService.publish('alice', first.ticket, { text: 'Shared explanation.' }); });
    assert.equal((await waiting.lookup('bob', query('two'))).status, 'hit');
    assert.equal(waits, 1); assert.equal(f.entries.size, 1); assert.equal(f.leases.size, 0);
  });

  it('reserves accepted questions across concurrent tabs before either presentation is journaled', async () => {
    const f = fixture(), first = f.make(), second = f.make();
    const a = await first.lookup('alice', query('tab-a', 'question'));
    const b = await second.lookup('alice', { ...query('tab-b', 'question'), queryText: needText('another pending context') });
    if (a.status !== 'generate' || b.status !== 'generate') throw new Error('Expected pending generators');
    const results = await Promise.all([
      first.publish('alice', a.ticket, { text: 'First wording?' }),
      second.publish('alice', b.ticket, { text: 'Second wording?' }),
    ]);
    assert.equal(results.filter(r => r.accepted).length, 1);
    assert.equal(f.exposures.size, 0);
    assert.equal(f.leases.size, 0);
  });

  it('revises the current item without creating catalog versions or altering exposures', async () => {
    const f = fixture(), s = f.make(), q = query();
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    const p = await s.publish('alice', first.ticket, { text: 'Original.' }); if (!p.accepted) throw new Error();
    await s.present('alice', q, p.reference, 'one:explanation');
    const revised = await s.revise('admin', p.reference.entryId, { text: 'Revised.' });
    assert.equal(revised, p.reference.entryId);
    const resumed = await s.lookup('alice', q); assert.equal(resumed.status === 'hit' && resumed.content.text, 'Revised.');
    const next = await f.make().lookup('bob', query('two')); assert.equal(next.status === 'hit' && next.content.text, 'Revised.');
    assert.equal(f.entries.has(p.reference.entryId), true);
    assert.equal(f.entries.size, 1);
    assert.equal([...f.exposures.values()][0]!.content.text, 'Original.');
    const later = await s.lookup('alice', query('later'));
    assert.equal(later.status === 'hit' && later.reference.priorNodeId, undefined);
  });

  it('validates context, active markup, and multiple-choice keys without requiring descriptors', async () => {
    const f = fixture(), s = f.make();
    await assert.rejects(s.lookup('alice', { ...query(), previousQuestions: [{ text: '' }] }), /previous question/);
    const first = await s.lookup('alice', query()); if (first.status !== 'generate') throw new Error();
    await assert.rejects(s.publish('alice', first.ticket, { text: '<script>alert(1)</script>' }), /Unsafe/);
    assert.equal(f.leases.size, 0, 'validation failure must not strand the lease');
    const q = query('q', 'question'); q.context.responseFormat = 'multiple-choice';
    const question = await s.lookup('alice', q); if (question.status !== 'generate') throw new Error();
    await assert.rejects(s.publish('alice', question.ticket, { text: 'Question?', choices: [{ id: 'a', label: 'a', correct: true }, { id: 'b', label: 'b', correct: true }, { id: 'c', label: 'c', correct: false }] }), /exactly one/);
  });

  it('retains the requested question response format despite matching embeddings', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    await s.publish('alice', first.ticket, { text: 'Explain isolation.' });
    const multipleChoice = query('two', 'question'); multipleChoice.context.responseFormat = 'multiple-choice';
    assert.equal((await s.lookup('bob', multipleChoice)).status, 'generate');
  });

  it('rebuilds unidentified question vectors from text and preserves old accepted decisions', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    const accepted = await s.publish('alice', first.ticket, { text: 'Original question?' }); if (!accepted.accepted) throw new Error();
    const entry = f.entries.get(accepted.reference.entryId)!;
    // Representative persisted shape before descriptor removal; its vector described metadata.
    Object.assign(entry, { compatibility: 'old-exact-context', questionEmbedding: [0, 1] });
    const resumed = await s.lookup('alice', q);
    assert.equal(resumed.status === 'hit' && resumed.content.text, 'Original question?');
    const other = await f.make().lookup('bob', query('two', 'question'));
    assert.equal(other.status, 'hit');
    assert.deepEqual(entry.questionEmbedding, { model: 'fixture', text: 'Original question?', vector: [1, 0] });
    assert.equal(entry._id, accepted.reference.entryId);
  });

  it('retains supplied prior questions through a generation miss and checks their text embeddings', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    q.previousQuestions = [{ text: 'An earlier question from the conversation?' }];
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    assert.equal(first.previousQuestions.length, 1);
    assert.equal((await s.publish('alice', first.ticket, { text: 'Equivalent question wording?' })).accepted, false);
  });

  it('uses independent reuse and repetition cutoffs with the approved operating defaults', async () => {
    const f = fixture(), first = f.make();
    const q = query('first', 'question');
    const lookup = await first.lookup('alice', q); if (lookup.status !== 'generate') throw new Error();
    const saved = await first.publish('alice', lookup.ticket, { text: 'Original question?' }); if (!saved.accepted) throw new Error();
    await first.present('alice', q, saved.reference, 'first:question');
    const vector = (cosine: number) => [cosine, Math.sqrt(1 - cosine ** 2)];
    const service = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async text =>
      text === 'Repeated wording?' ? vector(.89) : text === 'Different question?' ? vector(.87) : vector(.98) });
    const next = await service.lookup('alice', query('next', 'question')); if (next.status !== 'generate') throw new Error();
    const other = await service.lookup('bob', { ...query('other', 'question'), queryText: needText('Other learner context') });
    assert.equal(other.status, 'generate', '0.98 context similarity must not pass the 0.99 reuse cutoff');
    assert.equal((await service.publish('alice', next.ticket, { text: 'Repeated wording?' })).accepted, false);
    assert.equal((await service.publish('alice', next.ticket, { text: 'Different question?' })).accepted, true);
  });

  it('projects old question histories and new primitive references without treating learner text as exposure', () => {
    const rows = moveExposuresFromHistory({ userId: 'alice', TDFId: 'biology', sessionID: 'attempt', sparc: { stateTransition: {
      event: { eventId: 'event' }, writes: [{ value: { nodes: [
        { id: 'event:learner', speaker: 'learner', value: 'my answer' },
        { id: 'event:question', value: 'Original old question?' },
        { id: 'event:tutor', value: 'Feedback', primitiveReference: { entryId: 'saved-feedback' } },
      ] } }],
    } } });
    assert.equal(rows.length, 2); assert.deepEqual(rows.map(e => e.kind), ['question', 'feedback']);
    assert.ok(rows[0]?.entryId.startsWith('historical:')); assert.equal(rows[1]?.entryId, 'saved-feedback');
    assert.deepEqual(moveExposuresFromHistory({ sparc: { stateTransition: { writes: [{ value: { factType: 'learningTarget.score' } }] } } }), []);
  });
});


describe('Saved video primitive durability', () => {
  it('stamps an accepted clip after administrative deletion and prevents subsequent reuse', async () => {
    const f = fixture(); let available = true;
    const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 10, endSeconds: 30,
      transcript: 'Heritable variation exists before selection.', language: 'en', title: 'Selection', channel: 'Teaching' };
    const service = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async () => [1, 0],
      videoReuseStatus: async videos => new Map(videos.map(item => [item.segmentId, available])) });
    const first = query('video-one', 'richContent');
    const proposed = await service.lookup('alice', first); assert.equal(proposed.status, 'generate');
    if (proposed.status !== 'generate') throw new Error('Expected generation');
    const saved = await service.publish('alice', proposed.ticket, { text: video.transcript, video });
    if (!saved.accepted) throw new Error('Expected saved video');
    available = false;
    f.entries.delete(saved.reference.entryId); f.removed.add(saved.reference.entryId);
    const restored = await service.lookup('alice', first); assert.equal(restored.status, 'hit');
    if (restored.status !== 'hit') throw new Error('Expected saved decision');
    assert.equal(restored.content.text, 'Administrative removal');
    assert.equal(restored.content.video, undefined);
    assert.equal((await service.lookup('alice', query('video-two', 'richContent'))).status, 'generate');
  });
});
