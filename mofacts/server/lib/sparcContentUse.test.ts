import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createSparcContentUseStorage, ensureSparcContentUseCatalog, sparcContentUseKeys, sparcCatalogUseKeys, SparcContentAlreadyUsedError } from './sparcContentUse';
import type { SparcContentUseCollection } from './sparcContentUse';
import type { SparcPrimitiveContent } from '../../../learning-components/runtime/sparcMoveLibraryContract';

type Row = Record<string, any>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function get(row: Row, path: string): any { return path.split('.').reduce((value, key) => value?.[key], row); }
function matches(row: Row, selector: Row): boolean {
  return Object.entries(selector).every(([name, expected]) => {
    if (name === '$or') return expected.some((branch: Row) => matches(row, branch));
    const actual = get(row, name);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected && expected.$exists !== (actual !== undefined)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$ne' in expected && isDeepStrictEqual(actual, expected.$ne)) return false;
      if ('$in' in expected && !(Array.isArray(actual) ? actual.some(value => expected.$in.includes(value)) : expected.$in.includes(actual))) return false;
      if (Object.keys(expected).some(key => key.startsWith('$'))) return true;
    }
    return isDeepStrictEqual(actual, expected);
  });
}
function fixture() {
  const names = ['requests', 'figures', 'entries', 'histories', 'states'] as const;
  type Name = typeof names[number];
  const rows = Object.fromEntries(names.map(name => [name, new Map<string, Row>()])) as Record<Name, Map<string, Row>>;
  const reads: Array<{ name: Name; selector: Row; options: Row }> = [];
  const bulks: Array<{ name: Name; count: number }> = [];
  const sourceWrites: Row[] = [];
  const logs: Row[] = [];
  let writeHook: ((name: Name, selector: Row, modifier: Row) => void) | undefined;
  const collections = Object.fromEntries(names.map(name => {
    const updateOne = async (selector: Row, modifier: Row, options: Row = {}) => {
      writeHook?.(name, selector, modifier);
      let target = [...rows[name].values()].find(row => matches(row, selector));
      const inserted = !target && !!options.upsert;
      if (!target && !inserted) return { matchedCount: 0, upsertedCount: 0 };
      if (!target) { target = { _id: selector._id }; rows[name].set(target._id, target); }
      if (inserted && modifier.$setOnInsert) Object.assign(target, structuredClone(modifier.$setOnInsert));
      if (modifier.$set) Object.assign(target, structuredClone(modifier.$set));
      for (const [key, value] of Object.entries(modifier.$inc ?? {})) target[key] = (target[key] ?? 0) + Number(value);
      for (const [key, spec] of Object.entries(modifier.$addToSet ?? {})) {
        target[key] = [...new Set([...(target[key] ?? []), ...(spec as { $each: string[] }).$each])];
      }
      if (name === 'states') sourceWrites.push(structuredClone(modifier));
      return { matchedCount: inserted ? 0 : 1, upsertedCount: inserted ? 1 : 0 };
    };
    return [name, {
      find(selector: Row, options: Row) {
        reads.push({ name, selector: structuredClone(selector), options });
        return { toArray: async () => {
          let result = [...rows[name].values()].filter(row => matches(row, selector));
          if (options.sort) result.sort((a, b) => String(a._id).localeCompare(String(b._id)));
          if (options.limit !== undefined) result = result.slice(0, options.limit);
          return structuredClone(result);
        } };
      },
      async findOne(selector: Row, options: Row = {}) {
        reads.push({ name, selector: structuredClone(selector), options });
        return structuredClone([...rows[name].values()].find(row => matches(row, selector)) ?? null);
      },
      updateOne,
      async bulkWrite(operations: Array<{ updateOne: { filter: Row; update: Row; upsert?: boolean } }>, options: Row = {}) {
        bulks.push({ name, count: operations.length });
        for (const operation of operations) await updateOne(operation.updateOne.filter, operation.updateOne.update, { ...options, upsert: operation.updateOne.upsert });
      },
    } satisfies SparcContentUseCollection];
  })) as Record<Name, SparcContentUseCollection>;
  let tail = Promise.resolve();
  let sessions = 0;
  let ended = 0;
  const startSession: Parameters<typeof createSparcContentUseStorage>[0]['startSession'] = () => {
      sessions++;
      return {
        async withTransaction(work, options) {
          assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const previous = tail;
          let release!: () => void;
          tail = new Promise<void>(resolve => { release = resolve; });
          await previous;
          const snapshot = structuredClone(rows);
          try { await work(); }
          catch (error) { for (const name of names) rows[name] = snapshot[name]; throw error; }
          finally { release(); }
        },
        async endSession() { ended++; },
      };
    };
  const storage = createSparcContentUseStorage({ ...collections, startSession,
    log: (message, progress) => { logs.push({ message, ...progress }); },
  });
  return { rows, collections, storage, reads, bulks, sourceWrites, logs, hook: (hook?: typeof writeHook) => { writeHook = hook; },
    async present(records: Row[]) {
      await storage.preparePresentations('learner', records);
      const session = startSession();
      try {
        await session.withTransaction(async () => {
          // The real history owner acquires the same user's source write first.
          await collections.states.updateOne({ _id: 'learner' }, { $inc: { sequence: records.length } }, { session });
          await storage.acceptPresentations('learner', records, session);
          for (const row of records) await collections.histories.updateOne({ _id: row._id }, { $setOnInsert: row }, { session, upsert: true });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } finally { await session.endSession(); }
    },
    sessions: () => ({ sessions, ended }) };
}
function entry(id: string, content: SparcPrimitiveContent, kind = 'instruction'): Row { return { _id: id, kind, content }; }
function request(id: string, item: Row, eventId = id, userId = 'learner', tdfId = 'lesson', sessionId = 'attempt'): Row {
  return { _id: id, userId, entryId: item._id, query: { tdfId, sessionId, eventId, context: { kind: item.kind } },
    source: 'generated', similarity: null, contentUseKeys: sparcCatalogUseKeys(item as { _id: string; kind: string; content: SparcPrimitiveContent }) };
}
function visual(assetId: string, eventId: string, userId = 'learner', tdfId = 'lesson', sessionId = 'attempt'): Row {
  return { _id: digest([userId, tdfId, sessionId, eventId]), kind: 'decision', userId, tdfId, sessionId, assetId, source: 'generated', similarity: null };
}
function history(id: string, content: SparcPrimitiveContent, entryId?: string, eventId = id): Row {
  return { _id: id, userId: 'learner', TDFId: 'lesson', sessionID: 'attempt', eventType: 'sparc', sparc: { stateTransition: {
    event: { eventId }, writes: [{ value: { type: 'append-node', node: { id: `${eventId}:explanation`, speaker: 'tutor', turnEventId: eventId,
      value: content.text, ...(content.figure ? { figure: content.figure } : {}), ...(content.video ? { video: content.video } : {}),
      ...(content.choices ? { choices: content.choices } : {}), ...(content.supportHeading ? { supportHeading: content.supportHeading } : {}),
      ...(entryId ? { primitiveReference: { entryId } } : {}) } } }],
  } } };
}

describe('SPARC durable content-use boundary', () => {
  it('identifies explanations, support, media and complete saved payloads independently without semantic normalization', () => {
    const content: SparcPrimitiveContent = { text: 'A principle.', support: { text: 'A matching case.', figure: { assetId: 'picture', description: 'The case', displayWidth: 300 } } };
    const keys = sparcContentUseKeys(content, 'instruction');
    assert.ok(keys.includes('entry:instruction'));
    assert.ok(keys.includes('image:picture'));
    assert.equal(keys.filter(key => key.startsWith('text:')).length, 2);
    assert.equal(keys.filter(key => key.startsWith('payload:')).length, 2);
    const question = { text: 'Which?', choices: [{ id: 'a', label: 'A', correct: true }, { id: 'b', label: 'B', correct: false }] };
    assert.deepEqual(sparcContentUseKeys(question), sparcContentUseKeys({ ...question, choices: [...question.choices].reverse() }));
    assert.notDeepEqual(sparcContentUseKeys(question), sparcContentUseKeys({ ...question, choices: question.choices.map(choice => ({ ...choice, label: choice.label + ' revised' })) }));
    assert.notDeepEqual(sparcContentUseKeys({ text: 'A principle.' }), sparcContentUseKeys({ text: 'A principle. ' }));
  });

  it('denies repeated text under a new entry across lessons and sessions while allowing another user', async () => {
    const f = fixture();
    const a = entry('a', { text: 'The original explanation.' });
    const b = entry('b', { text: 'The original explanation.' }, 'feedback');
    f.rows.entries.set(a._id, a); f.rows.entries.set(b._id, b);
    f.rows.states.set('learner', { _id: 'learner', sequence: 31, repairRevision: 4 });
    await f.storage.saveRequest(request('first', a));
    await assert.rejects(f.storage.saveRequest(request('next', b, 'next', 'learner', 'another-lesson', 'later-session')), SparcContentAlreadyUsedError);
    await f.storage.saveRequest(request('other-user', b, 'next', 'another-user'));
    assert.equal(f.rows.requests.has('next'), false);
    assert.equal(f.rows.requests.has('other-user'), true);
    assert.equal(f.rows.states.get('learner')!.sequence, 31);
    assert.equal(f.rows.states.get('learner')!.repairRevision, 4);
    assert.deepEqual(f.sessions().sessions, f.sessions().ended);
  });

  it('permits the same accepted request to resume and refuses forged scope or changed catalog between selection and acceptance', async () => {
    const f = fixture(); const item = entry('item', { text: 'Accepted once.' }); f.rows.entries.set(item._id, item);
    const first = await f.storage.saveRequest(request('event', item));
    assert.deepEqual(await f.storage.saveRequest({ ...request('event', item), entryId: 'ignored-new-selection' }), first);
    await assert.rejects(f.storage.saveRequest(request('event', item, 'forged-event')), /scope mismatch/);
    const selected = request('new', item); f.rows.entries.set(item._id, { ...item, content: { text: 'Revised after selection.' } });
    await assert.rejects(f.storage.saveRequest(selected), /changed before/);
  });

  it('arbitrates concurrent exact copies and rolls back the rejected claim without touching history freshness', async () => {
    const f = fixture(); const a = entry('a', { text: 'Same content.' }); const b = entry('b', { text: 'Same content.' });
    f.rows.entries.set(a._id, a); f.rows.entries.set(b._id, b);
    await f.storage.ensureUser('learner');
    const before = f.rows.states.get('learner')!.contentUseRevision;
    const results = await Promise.allSettled([f.storage.saveRequest(request('one', a)), f.storage.saveRequest(request('two', b))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(f.rows.requests.size, 1);
    assert.equal(f.rows.states.get('learner')!.contentUseRevision, before + 1);
    assert.equal(f.rows.states.get('learner')!.sequence, 0);
    assert.equal(f.rows.states.get('learner')!.repairRevision, 0);
  });

  it('allows a turn to accept its own resolved visual, but rejects that image or video on another turn in either store', async () => {
    const f = fixture();
    const item = entry('instruction', { text: 'Explanation.', support: { text: 'Visual support.', figure: { assetId: 'picture', description: 'Picture', displayWidth: 300 } } });
    f.rows.entries.set(item._id, item);
    const decision = visual('picture', 'turn');
    await f.storage.saveDecision(decision);
    await f.storage.saveRequest(request('instruction-request', item, 'turn'));
    await f.storage.saveDecision({ ...decision, assetId: 'different-unaccepted-draft' });
    assert.equal(f.rows.figures.get(decision._id)!.assetId, 'picture');
    await assert.rejects(f.storage.saveDecision(visual('picture', 'later')), SparcContentAlreadyUsedError);
    const next = entry('next', { text: 'Another explanation.', support: { text: 'Another case.', figure: { assetId: 'picture', description: 'Picture', displayWidth: 300 } } });
    f.rows.entries.set(next._id, next);
    await assert.rejects(f.storage.saveRequest(request('next-request', next, 'next-turn')), SparcContentAlreadyUsedError);
    const video = { ...visual('segment', 'video-turn'), video: { segmentId: 'segment' } };
    await f.storage.saveDecision(video);
    await assert.rejects(f.storage.saveDecision({ ...visual('segment', 'another-video-turn'), video: { segmentId: 'segment' } }), SparcContentAlreadyUsedError);
  });

  it('does not exempt repeated explanation or feedback text merely because two component requests share a turn', async () => {
    const f = fixture(); const a = entry('explanation', { text: 'Shared body.' }, 'explanation'); const b = entry('feedback', { text: 'Shared body.' }, 'feedback');
    f.rows.entries.set(a._id, a); f.rows.entries.set(b._id, b);
    await f.storage.saveRequest(request('explanation-request', a, 'same-turn'));
    await assert.rejects(f.storage.saveRequest(request('feedback-request', b, 'same-turn')), SparcContentAlreadyUsedError);
  });

  it('reconstructs use from actual historical snapshots, not an edited catalog, and leaves conversations unchanged', async () => {
    const f = fixture();
    const current = entry('item', { text: 'The administrator revised this.' }); f.rows.entries.set(current._id, current);
    const old = request('old-request', current, 'old-turn'); delete old.contentUseKeys; f.rows.requests.set(old._id, old);
    const recorded = history('old-history', { text: 'The original delivered explanation.', figure: { assetId: 'old-image', description: 'Original', displayWidth: 300 } }, 'item', 'old-turn');
    f.rows.histories.set(recorded._id, recorded); const original = structuredClone(recorded);
    await f.storage.ensureUser('learner');
    assert.deepEqual(f.rows.histories.get(recorded._id), original);
    const claimed = f.rows.requests.get(old._id)!.contentUseKeys;
    assert.ok(claimed.includes('entry:item')); assert.ok(claimed.includes('image:old-image'));
    assert.ok(claimed.includes(sparcContentUseKeys({ text: 'The original delivered explanation.' }).find(key => key.startsWith('text:'))));
    assert.ok(!claimed.includes(sparcContentUseKeys(current.content).find(key => key.startsWith('text:'))));
    assert.equal([...f.rows.requests.values()].filter(row => row.kind === 'presentation-use').length, 1);
    const replacement = entry('new-copy', { text: 'The original delivered explanation.' }); f.rows.entries.set(replacement._id, replacement);
    await assert.rejects(f.storage.saveRequest(request('new-copy-request', replacement)), SparcContentAlreadyUsedError);
    await assert.rejects(f.storage.saveDecision(visual('old-image', 'new-picture-turn')), SparcContentAlreadyUsedError);
  });

  it('retains historical proof when a backup lacks its accepted request, and never fabricates a request or original text', async () => {
    const f = fixture(); const recorded = history('snapshot', { text: 'Seen before the backup.' }, 'missing-request-entry', 'saved-event');
    f.rows.histories.set(recorded._id, recorded);
    f.rows.requests.set('no-snapshot', { _id: 'no-snapshot', userId: 'learner', entryId: 'no-snapshot-entry', query: { tdfId: 'lesson', sessionId: 'attempt', eventId: 'other' } });
    await f.storage.ensureUser('learner');
    assert.deepEqual(f.rows.requests.get('no-snapshot')!.contentUseKeys, ['entry:no-snapshot-entry']);
    const receipt = [...f.rows.requests.values()].find(row => row.kind === 'presentation-use')!;
    assert.equal(receipt.query, undefined); assert.equal(receipt.sourceHistoryId, 'snapshot');
    const item = entry('missing-request-entry', { text: 'Seen before the backup.' }); f.rows.entries.set(item._id, item);
    await assert.rejects(f.storage.saveRequest(request('replacement-request', item, 'saved-event')), SparcContentAlreadyUsedError);
  });

  it('initializes legacy figure decisions and a large account in bounded pages, once, without rewriting source records', async () => {
    const f = fixture();
    for (let index = 0; index < 251; index++) {
      const id = String(index).padStart(4, '0');
      f.rows.requests.set(id, { _id: id, userId: 'learner', entryId: `entry-${id}` });
      f.rows.histories.set(id, history(id, { text: `Unique historical text ${id}` }));
    }
    f.rows.figures.set('figure', { _id: 'figure', userId: 'learner', kind: 'decision', assetId: 'old-image' });
    f.rows.figures.set('video', { _id: 'video', userId: 'learner', kind: 'decision', assetId: 'old-video', video: { segmentId: 'old-video' } });
    await f.storage.ensureUser('learner');
    assert.deepEqual(f.rows.figures.get('figure')!.contentUseKeys, ['image:old-image']);
    assert.deepEqual(f.rows.figures.get('video')!.contentUseKeys, ['video:old-video']);
    const state = f.rows.states.get('learner')!.contentUseInitialization;
    assert.deepEqual(state, { version: 1, phase: 'complete', cursor: null, requestCount: 251, figureCount: 2, historyCount: 251 });
    assert.ok(f.bulks.every(bulk => bulk.count <= 100));
    assert.ok(f.reads.filter(read => read.options.limit !== undefined).every(read => read.options.limit === 100));
    assert.ok(f.reads.filter(read => read.name === 'histories').every(read => read.options.projection && read.options.session));
    const count = f.reads.filter(read => read.name === 'histories').length;
    await f.storage.ensureUser('learner');
    assert.equal(f.reads.filter(read => read.name === 'histories').length, count);
    assert.ok(f.logs.every(log => !JSON.stringify(log).includes('learner') && !JSON.stringify(log).includes('Unique historical')));
  });

  it('rolls back an interrupted history proof page and resumes at its atomic checkpoint', async () => {
    const f = fixture(); f.rows.histories.set('history', history('history', { text: 'Delivered instruction.' }, 'entry'));
    let fail = true;
    f.hook((name, _selector, modifier) => { if (name === 'requests' && modifier.$addToSet && fail) { fail = false; throw new Error('Synthetic interrupted metadata page'); } });
    await assert.rejects(f.storage.ensureUser('learner'), /interrupted/);
    assert.equal(f.rows.requests.size, 0);
    assert.equal(f.rows.states.get('learner')!.contentUseInitialization.phase, 'history');
    assert.equal(f.rows.states.get('learner')!.contentUseInitialization.cursor, null);
    f.hook(); await f.storage.ensureUser('learner');
    assert.equal(f.rows.requests.size, 1);
    assert.equal(f.rows.states.get('learner')!.contentUseInitialization.phase, 'complete');
  });

  it('initializes catalog keys with indexed keyset pages and refuses a concurrently changed unannotated entry', async () => {
    const f = fixture();
    for (let index = 0; index < 251; index++) {
      const id = String(index).padStart(4, '0'); f.rows.entries.set(id, entry(id, { text: `Catalog text ${id}` }, 'explanation'));
    }
    await ensureSparcContentUseCatalog(f.collections.entries);
    const paged = f.reads.filter(read => read.name === 'entries' && read.options.limit === 100);
    assert.equal(paged.length, 4);
    assert.deepEqual(paged.slice(1).map(read => read.selector._id.$gt), ['0099', '0199', '0250']);
    const raced = fixture(); raced.rows.entries.set('changed', entry('changed', { text: 'Before.' }, 'explanation'));
    let once = true;
    raced.hook((name, _selector, _modifier) => { if (name === 'entries' && once) { once = false; raced.rows.entries.set('changed', entry('changed', { text: 'After.' }, 'explanation')); } });
    await assert.rejects(ensureSparcContentUseCatalog(raced.collections.entries), /changed during/);
    await ensureSparcContentUseCatalog(raced.collections.entries);
    assert.deepEqual(raced.rows.entries.get('changed')!.contentUseKeys, sparcContentUseKeys({ text: 'After.' }, 'changed'));
  });

  it('rejects corrupt progress metadata and an exhausted source counter without advancing either', async () => {
    const f = fixture(); f.rows.states.set('learner', { _id: 'learner', contentUseInitialization: { version: 1, phase: 'complete' } });
    await assert.rejects(f.storage.ensureUser('learner'), /checkpoint/);
    f.rows.states.set('learner', { _id: 'learner', contentUseRevision: Number.MAX_SAFE_INTEGER });
    await assert.rejects(f.storage.ensureUser('learner'), /revision/);
    assert.equal(f.rows.states.get('learner')!.contentUseRevision, Number.MAX_SAFE_INTEGER);
  });

  it('commits direct tutor output and its use receipt with history, and rolls all three back on a later repeat', async () => {
    const f = fixture();
    await f.present([history('first-summary', { text: 'A direct summary which bypassed the catalog.' })]);
    assert.equal(f.rows.histories.size, 1);
    assert.equal(f.rows.states.get('learner')!.sequence, 1);
    assert.equal([...f.rows.requests.values()].filter(row => row.kind === 'presentation-use').length, 1);
    await assert.rejects(f.present([history('another-summary', { text: 'A direct summary which bypassed the catalog.' })]), SparcContentAlreadyUsedError);
    assert.equal(f.rows.histories.size, 1);
    assert.equal(f.rows.states.get('learner')!.sequence, 1);
    assert.equal(f.rows.requests.size, 1);
  });

  it('lets an accepted matched instruction journal its own exact explanation and support together', async () => {
    const f = fixture();
    const content: SparcPrimitiveContent = { text: 'One explanation.', support: { text: 'Its worked support.', supportHeading: 'Worked Case',
      figure: { assetId: 'figure', description: 'The worked case', displayWidth: 300 } } };
    const item = entry('matched', content); f.rows.entries.set(item._id, item);
    await f.storage.saveDecision(visual('figure', 'turn'));
    await f.storage.saveRequest(request('accepted', item, 'turn'));
    const row = history('matched-history', { text: content.text }, item._id, 'turn');
    const support = history('unused', content.support!, item._id, 'turn').sparc.stateTransition.writes[0];
    support.value.node.id = 'turn:richContent';
    row.sparc.stateTransition.writes.push(support);
    await f.present([row]);
    assert.equal(f.rows.histories.size, 1);
    assert.equal([...f.rows.requests.values()].filter(record => record.kind === 'presentation-use').length, 2);
    await assert.rejects(f.present([history('copied-feedback', { text: content.text }, undefined, 'later-turn')]), SparcContentAlreadyUsedError);
  });

  it('does not let a journal write replace the content reserved by its own accepted primitive', async () => {
    const f = fixture(); const item = entry('item', { text: 'Accepted original.' }); f.rows.entries.set(item._id, item);
    await f.storage.saveRequest(request('accepted', item, 'turn'));
    await assert.rejects(f.present([history('changed-output', { text: 'An unaccepted replacement.' }, item._id, 'turn')]), SparcContentAlreadyUsedError);
    assert.equal(f.rows.histories.size, 0);
    assert.equal([...f.rows.requests.values()].filter(row => row.kind === 'presentation-use').length, 0);
  });

  it('retains the immutable receipt if a restored missing history row tries to change the same output identity', async () => {
    const f = fixture(); const original = history('stable-history', { text: 'The immutable output.' });
    await f.present([original]); f.rows.histories.delete(original._id);
    await assert.rejects(f.present([history('stable-history', { text: 'Different output under the same identity.' })]), /presentation identity conflicts/);
    assert.equal(f.rows.histories.size, 0);
    assert.equal(f.rows.states.get('learner')!.sequence, 1);
    assert.equal(f.rows.requests.size, 1);
  });
});
