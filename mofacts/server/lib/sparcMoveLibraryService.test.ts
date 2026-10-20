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
  it('publishes, presents, and retrieves text above advisory size thresholds unchanged', async () => {
    const f = fixture(); const service = f.make(); const q = query();
    const text = 'A complete explanation. '.repeat(140).trim();
    const lookup = await service.lookup('learner', q);
    assert.equal(lookup.status, 'generate');
    if (lookup.status !== 'generate') throw new Error('Expected a generation ticket');
    const published = await service.publish('learner', lookup.ticket, { text });
    if (!published.accepted) throw new Error('Expected accepted content');
    await service.present('learner', q, published.reference, 'explanation-node');
    assert.equal(published.content.text, text);
    assert.equal([...f.exposures.values()][0]!.content.text, text);
    const resumed = await service.lookup('learner', q);
    assert.equal(resumed.status, 'hit');
    if (resumed.status === 'hit') assert.equal(resumed.content.text, text);
  });

  it('keeps written support separate and resolves each new visual request instead of bypassing video-first retrieval', async () => {
    const f = fixture();
    const s = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async () => [1, 0],
      verifyFigure: async () => {}, figureReusable: async () => true });
    const generic = query('saved-image', 'richContent');
    const generated = await s.lookup('alice', generic); if (generated.status !== 'generate') throw new Error();
    const content = { text: 'A teaching image.', figure: { assetId: 'image123', description: 'A teaching image.' } };
    await s.publish('alice', generated.ticket, content);
    const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 0, endSeconds: 20,
      transcript: 'A teaching passage.', language: 'en', title: 'Teaching', channel: 'Teaching' };
    const seed = [...f.entries.values()][0]!;
    f.entries.set('video-entry', { ...seed, _id: 'video-entry', content: { text: video.transcript, video } });
    // No videoReuseStatus dependency is installed: a written request must not inspect video availability.
    const written = query('written', 'richContent'); written.context.supportKind = 'written';
    const write = await s.lookup('alice', written); assert.equal(write.status, 'generate');
    if (write.status !== 'generate') throw new Error();
    await assert.rejects(s.publish('alice', write.ticket, content), /written move/);
    const visual = query('visual', 'richContent'); visual.context.supportKind = 'visual';
    const select = await s.lookup('alice', visual); assert.equal(select.status, 'generate');
    if (select.status !== 'generate') throw new Error();
    await assert.rejects(s.publish('alice', select.ticket, { text: 'A written example.' }), /visual move/);
    await s.publish('alice', select.ticket, content);
    assert.equal((await s.lookup('alice', visual)).status, 'hit', 'accepted visual decisions replay unchanged');
    assert.equal((await s.lookup('alice', { ...visual, eventId: 'another-visual' })).status, 'generate');
  });
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

  it('excludes similar retrieved questions across attempts but accepts generated questions and keeps learner exposure private', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    const p = await s.publish('alice', first.ticket, { text: 'What separates these populations?' });
    if (!p.accepted) throw new Error();
    await s.present('alice', q, p.reference, 'one:question');
    const next = { ...query('two', 'question'), sessionId: 'new-attempt' };
    const blocked = await f.make().lookup('alice', next); assert.equal(blocked.status, 'generate');
    if (blocked.status !== 'generate') throw new Error();
    const generated = await s.publish('alice', blocked.ticket, { text: 'Which barrier keeps these birds apart?' });
    assert.equal(generated.accepted, true);
    if (!generated.accepted) throw new Error('Expected generated question to be accepted');
    assert.equal(generated.content.text, 'Which barrier keeps these birds apart?');
    assert.equal(f.leases.size, 0, 'acceptance must release the generation lease');
    assert.equal((await f.make().lookup('bob', query('two', 'question'))).status, 'hit');
    await assert.rejects(s.publish('bob', blocked.ticket, { text: 'tampered' }), /Unknown/);
    assert.equal((await f.make().lookup('alice', { ...next, eventId: 'three' })).status, 'generate');
  });

  it('waits for a concurrent matching generator and uses its published content', async () => {
    const f = fixture(), firstService = f.make(), q = query();
    const first = await firstService.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    let waits = 0;
    const waiting = f.make(async () => { waits++; await firstService.publish('alice', first.ticket, { text: 'Shared explanation.' }); });
    assert.equal((await waiting.lookup('bob', query('two'))).status, 'hit');
    assert.equal(waits, 1); assert.equal(f.entries.size, 1); assert.equal(f.leases.size, 0);
  });

  it('accepts generated questions across concurrent tabs and reserves them against later retrieval', async () => {
    const f = fixture(), first = f.make(), second = f.make();
    const a = await first.lookup('alice', query('tab-a', 'question'));
    const b = await second.lookup('alice', { ...query('tab-b', 'question'), queryText: needText('another pending context') });
    if (a.status !== 'generate' || b.status !== 'generate') throw new Error('Expected pending generators');
    const results = await Promise.all([
      first.publish('alice', a.ticket, { text: 'First wording?' }),
      second.publish('alice', b.ticket, { text: 'Second wording?' }),
    ]);
    assert.equal(results.filter(r => r.accepted).length, 2);
    assert.equal(f.exposures.size, 0);
    assert.equal(f.leases.size, 0);
    assert.equal((await f.make().lookup('alice', query('later', 'question'))).status, 'generate');
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

  it('validates and reuses cloze and true/false without substituting formats or shuffling binary answers', async () => {
    for (const format of ['cloze', 'true-false'] as const) {
      const f = fixture(), s = f.make(), q = query('new-format', 'question'); q.context.responseFormat = format;
      const pending = await s.lookup('alice', q); if (pending.status !== 'generate') throw new Error();
      if (format === 'cloze') {
        for (const text of ['No blank here.', '_____ and _____', '_____', 'A ____ is incomplete.']) {
          await assert.rejects(s.publish('alice', pending.ticket, { text }), /exactly one/);
        }
      }
      const content = format === 'cloze' ? { text: 'Isolation restricts gene _____.' } : { text: 'Isolation increases gene flow.', choices: [
        { id: 'true', label: 'True', correct: false }, { id: 'false', label: 'False', correct: true },
      ] };
      const accepted = await s.publish('alice', pending.ticket, content); if (!accepted.accepted) throw new Error();
      assert.deepEqual(accepted.content, content);
      const hit = await f.make().lookup('bob', q); if (hit.status !== 'hit') throw new Error();
      assert.deepEqual(hit.content, content);
      const other = { ...q, eventId: 'different-format', context: { ...q.context, responseFormat: format === 'cloze' ? 'text' : 'multiple-choice' } };
      const mismatch = await f.make().lookup('charlie', other);
      assert.equal(mismatch.status, 'generate');
      if (format === 'true-false' && mismatch.status === 'generate') {
        await assert.rejects(s.publish('charlie', mismatch.ticket, content), /3 or 4/);
        await f.make().present('bob', q, hit.reference, 'new-format:question');
        assert.deepEqual([...f.exposures.values()].find(e => e.userId === 'bob')!.content, content);
      }
    }
  });

  it('assigns stable shuffled MC options for generation and retrieval and records the displayed order', async () => {
    const f = fixture(), s = f.make(), q = query('question', 'question');
    q.context.responseFormat = 'multiple-choice';
    const content = { text: 'Which claim describes isolation?', choices: [
      { id: 'a', label: 'Isolation restricts gene flow.', correct: true },
      { id: 'b', label: 'Isolation always increases gene flow.', correct: false },
      { id: 'c', label: 'Isolation requires different continents.', correct: false },
      { id: 'd', label: 'Isolation prevents all variation.', correct: false },
    ] };
    const original = JSON.parse(JSON.stringify(content));
    const pending = await s.lookup('author', q); if (pending.status !== 'generate') throw new Error();
    const generated = await s.publish('author', pending.ticket, content); if (!generated.accepted) throw new Error();
    const publishedAgain = await f.make().publish('author', pending.ticket, content); if (!publishedAgain.accepted) throw new Error();
    assert.deepEqual(publishedAgain.content, generated.content, 'uncertain publication retry must retain the assigned order');
    const positions = new Set<number>(), orders = new Set<string>();
    for (let index = 0; index < 32; index++) {
      const user = `learner-${index}`;
      const assigned = await f.make().lookup(user, q); if (assigned.status !== 'hit') throw new Error();
      assert.deepEqual([...assigned.content.choices!].sort((a, b) => a.id.localeCompare(b.id)), original.choices);
      positions.add(assigned.content.choices!.findIndex(choice => choice.correct));
      orders.add(assigned.content.choices!.map(choice => choice.id).join(','));
      const resumed = await f.make().lookup(user, JSON.parse(JSON.stringify(q))); if (resumed.status !== 'hit') throw new Error();
      assert.deepEqual(resumed.content, assigned.content, 'reload before the first journal write must keep the order');
      await f.make().present(user, q, assigned.reference, 'question:question');
      const exposure = [...f.exposures.values()].find(entry => entry.userId === user)!;
      assert.deepEqual(exposure.content, assigned.content);
      const projected = moveExposuresFromHistory({ userId: user, TDFId: q.tdfId, sessionID: q.sessionId,
        sparc: { stateTransition: { event: { eventId: q.eventId }, writes: [{ value: { node: {
          id: 'question:question', component: 'question', value: assigned.content.text, choices: assigned.content.choices,
          primitiveReference: assigned.reference,
        } } }] } } });
      assert.deepEqual(projected[0]!.content, exposure.content, 'history and exposure must retain the same assigned option order');
    }
    assert.equal(positions.size, 4, 'the fixed assignment samples place the correct answer in every position');
    assert.ok(orders.size > 1);
    assert.deepEqual(content, original, 'assignment must not mutate generated content');
    assert.deepEqual(f.entries.get(generated.reference.entryId)!.content, original, 'the shared catalog retains its original list');
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

  it('retains supplied prior questions through a generation miss without vetoing generated text', async () => {
    const f = fixture(), s = f.make(), q = query('one', 'question');
    q.previousQuestions = [{ text: 'An earlier question from the conversation?' }];
    const first = await s.lookup('alice', q); if (first.status !== 'generate') throw new Error();
    assert.equal(first.previousQuestions.length, 1);
    assert.equal((await s.publish('alice', first.ticket, { text: 'Equivalent question wording?' })).accepted, true);
  });

  it('checks question novelty in descending need similarity and stops at the first acceptable candidate', async () => {
    const f = fixture(), seedService = f.make();
    const lookup = await seedService.lookup('author', query('seed', 'question')); if (lookup.status !== 'generate') throw new Error();
    await seedService.publish('author', lookup.ticket, { text: 'seed' });
    const seed = [...f.entries.values()][0]!; f.entries.clear();
    for (const [id, similarity, text] of [['a', .993, 'unused'], ['b', .995, 'novel'], ['c', 1, 'repeated']] as const) {
      const entry = { ...seed, _id: id, embedding: [similarity, Math.sqrt(1 - similarity ** 2)], content: { text } };
      delete entry.questionEmbedding;
      f.entries.set(id, entry);
    }
    const embedded: string[] = [];
    const service = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async text => {
      embedded.push(text); return text === 'novel' ? [0, 1] : [1, 0];
    } });
    const result = await service.lookup('reader', { ...query('read', 'question'), previousQuestions: [{ text: 'earlier' }] });
    assert.equal(result.status === 'hit' && result.content.text, 'novel');
    assert.deepEqual(embedded.filter(text => ['unused', 'novel', 'repeated'].includes(text)), ['repeated', 'novel']);
  });

  it('uses independent reuse and repetition cutoffs for retrieved questions', async () => {
    const vector = (cosine: number) => [cosine, Math.sqrt(1 - cosine ** 2)];
    const retrieve = async (questionSimilarity: number, contextSimilarity = 1) => {
      const f = fixture(), first = f.make();
      const lookup = await first.lookup('author', query('first', 'question')); if (lookup.status !== 'generate') throw new Error();
      const saved = await first.publish('author', lookup.ticket, { text: 'Original question?' }); if (!saved.accepted) throw new Error();
      const service = createMoveLibraryService({ store: f.store, embeddingModel: 'fixture', embed: async text =>
        text === 'Earlier question?' ? vector(questionSimilarity) : vector(contextSimilarity) });
      return service.lookup('learner', { ...query('next', 'question'), previousQuestions: [{ text: 'Earlier question?' }] });
    };
    assert.equal((await retrieve(.89)).status, 'generate', 'question similarity above 0.88 excludes retrieval');
    assert.equal((await retrieve(.87)).status, 'hit', 'question similarity below 0.88 permits retrieval');
    assert.equal((await retrieve(.87, .98)).status, 'generate', '0.98 context similarity must not pass the 0.992 reuse cutoff');
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
