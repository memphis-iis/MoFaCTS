import { strict as assert } from 'node:assert';
import { sameHistoryWrite } from './historyWriteIdentity';
import {
  createHistoryCommitStorage,
  HistoryCommitConflictError,
  type CommittedHistoryRow,
  type HistoryCommitRow,
  type HistoryCommitSession,
} from './historyCommitStorage';

type Document = Record<string, unknown>;
type Database = { histories: Map<string, HistoryCommitRow>; states: Map<string, Document> };
type Session = HistoryCommitSession & { database: Database; dirty: boolean };

function fixture(initial: { histories?: HistoryCommitRow[]; states?: Document[] } = {}, hooks: {
  prepareInsert?: (userId: string, rows: readonly HistoryCommitRow[]) => Promise<void>;
  acceptInsert?: (userId: string, rows: readonly CommittedHistoryRow[], session: Session) => Promise<void>;
} = {}) {
  let database: Database = {
    histories: new Map((initial.histories || []).map((row) => [row._id, { ...row }])),
    states: new Map((initial.states || []).map((row) => [String(row._id), { ...row }])),
  };
  let failAt: string | undefined;
  let retryNextTransaction = false;
  let endedSessions = 0;
  let beforeInsert: (() => Promise<void>) | undefined;
  let sourceRaces = 0;
  let historyRace = false;
  const clone = (): Database => ({
    histories: new Map([...database.histories].map(([id, row]) => [id, { ...row }])),
    states: new Map([...database.states].map(([id, row]) => [id, { ...row }])),
  });
  const startSession = (): Session => {
    const session: Session = {
      database: clone(),
      dirty: false,
      async withTransaction(work, options) {
        assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        const attempts = retryNextTransaction ? 2 : 1;
        retryNextTransaction = false;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          session.database = clone();
          session.dirty = false;
          await work();
          if (attempt === attempts && session.dirty) database = session.database;
        }
      },
      async endSession() { endedSessions += 1; },
    };
    return session;
  };
  const storage = createHistoryCommitStorage({
    ...hooks,
    startSession,
    histories: {
      find(selector, { session }) {
        return { toArray: async () => selector._id.$in.flatMap((id) => {
          const row = session.database.histories.get(id);
          return row ? [row] : [];
        }) };
      },
      async insertMany(rows: readonly CommittedHistoryRow[], { session }) {
        await beforeInsert?.();
        if (historyRace) {
          historyRace = false;
          for (const row of rows) database.histories.set(row._id, { ...row });
          const userId = rows[0]!.userId;
          database.states.set(userId, { ...session.database.states.get(userId)! });
          throw Object.assign(new Error('concurrent history ID'), { code: 11000 });
        }
        for (const row of rows) {
          if (row._id === failAt) throw new Error('interrupted transaction');
          if (session.database.histories.has(row._id)) throw new Error('unexpected duplicate history ID');
          session.database.histories.set(row._id, { ...row });
          session.dirty = true;
        }
      },
    },
    states: {
      async findOne(selector, options) {
        return (options?.session?.database || database).states.get(selector._id) || null;
      },
      async updateOne(selector, modifier, { session, upsert }) {
        assert.equal(upsert, true);
        if (sourceRaces > 0) {
          sourceRaces -= 1;
          database.states.set(selector._id, { _id: selector._id, sequence: 0, repairRevision: 0 });
          throw Object.assign(new Error('concurrent source ID'), { code: 11000 });
        }
        const saved = session.database.states.get(selector._id);
        const row: Document = saved ? { ...saved } : { _id: selector._id, ...modifier.$setOnInsert };
        for (const [key, increment] of Object.entries(modifier.$inc)) row[key] = Number(row[key] ?? 0) + Number(increment);
        session.database.states.set(selector._id, row);
        session.dirty = true;
      },
    },
  });
  return {
    storage,
    database: () => database,
    endedSessions: () => endedSessions,
    interruptAt: (id?: string) => { failAt = id; },
    retryNext: () => { retryNextTransaction = true; },
    beforeInsert: (work?: () => Promise<void>) => { beforeInsert = work; },
    raceSource: (count = 1) => { sourceRaces = count; },
    raceHistory: () => { historyRace = true; },
  };
}

const row = (id: string, value: unknown = 'answer', userId = 'learner'): HistoryCommitRow => ({ _id: id, userId, value });

describe('Committed history source storage', () => {
  it('commits presentation acceptance with history, rolls back rejection, and skips acceptance for an idempotent delivery', async () => {
    let reject = true;
    let preparations = 0;
    let acceptances = 0;
    const test = fixture({}, {
      prepareInsert: async (userId, rows) => {
        assert.equal(userId, 'learner');
        assert.equal(rows.length, 1);
        preparations += 1;
      },
      acceptInsert: async (userId, rows, session) => {
        acceptances += 1;
        assert.equal(session.database.states.get(userId)?.sequence, 1);
        assert.equal(rows[0]?.historySequence, 1);
        session.database.states.get(userId)!.presentationClaim = rows[0]!._id;
        if (reject) throw new Error('Presentation rejected');
      },
    });
    await assert.rejects(test.storage.insert('learner', [row('presentation')]), /Presentation rejected/);
    assert.equal(test.database().states.size, 0);
    assert.equal(test.database().histories.size, 0);

    reject = false;
    await test.storage.insert('learner', [row('presentation')]);
    assert.equal(test.database().states.get('learner')?.presentationClaim, 'presentation');
    assert.equal(test.database().histories.size, 1);
    assert.deepEqual(await test.storage.insert('learner', [row('presentation')]), []);
    assert.equal(preparations, 3);
    assert.equal(acceptances, 2);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 0 });
  });

  it('publishes single and batch sequences only with their committed rows', async () => {
    const test = fixture();
    let observedUncommitted = 0;
    test.beforeInsert(async () => {
      const source = await test.storage.readSource('learner');
      assert.equal(source.sequence, test.database().histories.size);
      observedUncommitted += 1;
    });
    const first = await test.storage.insert('learner', [row('single')]);
    assert.deepEqual(first.map((record) => record.historySequence), [1]);
    const batch = await test.storage.insert('learner', [row('score-a'), row('score-b'), row('complete')]);
    assert.deepEqual(batch.map((record) => record.historySequence), [2, 3, 4]);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 4, repairRevision: 0 });
    assert.equal(observedUncommitted, 2);
    assert.equal(test.endedSessions(), 2);
  });

  it('rolls back an interrupted batch and its allocation, then accepts one retry and rejects conflicts', async () => {
    const test = fixture();
    const batch = [row('score-a', .3), row('score-m', 0), row('complete', true)];
    test.interruptAt('complete');
    await assert.rejects(test.storage.insert('learner', batch), /interrupted/);
    assert.equal(test.database().histories.size, 0);
    assert.equal(test.database().states.size, 0);
    test.interruptAt();
    assert.deepEqual((await test.storage.insert('learner', batch)).map((record) => record.historySequence), [1, 2, 3]);
    assert.deepEqual(await test.storage.insert('learner', batch), []);
    await assert.rejects(test.storage.insert('learner', [row('score-a', .9)]), HistoryCommitConflictError);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 3, repairRevision: 0 });
    assert.equal(test.database().histories.get('score-a')?.value, .3);
    assert.equal(test.endedSessions(), 4);
  });

  it('allocates only missing batch rows and replaces incoming server-owned sequence values', async () => {
    const test = fixture();
    await test.storage.insert('learner', [row('existing')]);
    const batch = [{ ...row('existing'), historySequence: 999 }, { ...row('new'), historySequence: -100 }];
    assert.deepEqual(await test.storage.insert('learner', batch), [{ ...row('new'), historySequence: 2 }]);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 2, repairRevision: 0 });
    assert.equal(batch[1]?.historySequence, -100);
    assert.equal(sameHistoryWrite({ ...row('existing'), historySequence: 1 }, batch[0]!), true);
    assert.equal(sameHistoryWrite(row('existing', 'changed'), batch[0]!), false);
  });

  it('keeps transaction callback retries from leaking allocations or duplicated result rows', async () => {
    const test = fixture();
    test.retryNext();
    const inserted = await test.storage.insert('learner', [row('a'), row('b')]);
    assert.deepEqual(inserted.map((record) => record.historySequence), [1, 2]);
    assert.equal(test.database().histories.size, 2);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 2, repairRevision: 0 });
  });

  it('restarts one fresh transaction when another writer creates the first source document', async () => {
    const test = fixture();
    test.raceSource();
    assert.deepEqual((await test.storage.insert('learner', [row('new')])).map((record) => record.historySequence), [1]);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 0 });
    assert.equal(test.database().histories.size, 1);
    assert.equal(test.endedSessions(), 2);
  });

  it('resolves a concurrently committed stable history ID without allocating or inserting twice', async () => {
    const test = fixture();
    test.raceHistory();
    assert.deepEqual(await test.storage.insert('learner', [row('same')]), []);
    assert.equal(test.database().histories.size, 1);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 0 });
    assert.equal(test.endedSessions(), 2);
  });

  it('propagates a persistent duplicate-key failure after one fresh transaction attempt', async () => {
    const test = fixture();
    test.raceSource(2);
    await assert.rejects(test.storage.insert('learner', [row('new')]), (error: unknown) => (error as { code?: number }).code === 11000);
    assert.equal(test.database().histories.size, 0);
    assert.equal(test.endedSessions(), 2);
  });

  it('orders commits independently of the timestamps assigned while records were prepared', async () => {
    const test = fixture();
    const preparedFirst = { ...row('prepared-first'), recordedServerTime: 10 };
    const committedFirst = { ...row('committed-first'), recordedServerTime: 10 };
    await test.storage.insert('learner', [committedFirst]);
    await test.storage.insert('learner', [preparedFirst]);
    assert.equal(test.database().histories.get('committed-first')?.historySequence, 1);
    assert.equal(test.database().histories.get('prepared-first')?.historySequence, 2);
  });

  it('leaves pre-sequence rows unchanged and does not allocate for their idempotent retry', async () => {
    const historical = row('historical');
    const test = fixture({ histories: [historical] });
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 0, repairRevision: 0 });
    assert.deepEqual(await test.storage.insert('learner', [historical]), []);
    assert.equal(test.database().states.size, 0);
    assert.equal(test.database().histories.get('historical')?.historySequence, undefined);
    assert.deepEqual((await test.storage.insert('learner', [row('new')])).map((record) => record.historySequence), [1]);
  });

  it('advances the repair checkpoint atomically with destructive work and rolls both back on failure', async () => {
    const test = fixture();
    await test.storage.insert('learner', [row('to-remove')]);
    await assert.rejects(test.storage.mutate('learner', async (session) => {
      session.database.histories.delete('to-remove');
      throw new Error('repair interrupted');
    }), /repair interrupted/);
    assert.equal(test.database().histories.has('to-remove'), true);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 0 });
    const changed = await test.storage.mutate('learner', async (session) => session.database.histories.delete('to-remove'));
    assert.deepEqual(changed, { result: true, source: { sequence: 1, repairRevision: 1 } });
    assert.equal(test.database().histories.size, 0);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 1 });
  });

  it('reads the source checkpoint and old history in one snapshot while later commits remain later', async () => {
    const test = fixture({ histories: [row('unsequenced')] });
    await test.storage.insert('learner', [row('first')]);
    const snapshot = await test.storage.withSnapshot('learner', async (source, session) => {
      await test.storage.insert('learner', [row('later')]);
      return { source, ids: [...session.database.histories.keys()] };
    });
    assert.deepEqual(snapshot, { source: { sequence: 1, repairRevision: 0 }, ids: ['unsequenced', 'first'] });
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 2, repairRevision: 0 });
  });

  it('rejects mixed users and repeated row IDs before starting any transaction', async () => {
    const test = fixture();
    await assert.rejects(test.storage.insert('learner', [row('wrong-user', 'answer', 'other')]), /one authenticated user/);
    await assert.rejects(test.storage.insert('learner', [row('duplicate'), row('duplicate')]), /unique row IDs/);
    assert.equal(test.endedSessions(), 0);
    assert.equal(test.database().states.size, 0);
  });

  it('keeps source checkpoints independent for different users', async () => {
    const test = fixture();
    await test.storage.insert('learner', [row('a')]);
    await test.storage.insert('other', [row('b', 'answer', 'other')]);
    assert.deepEqual(await test.storage.readSource('learner'), { sequence: 1, repairRevision: 0 });
    assert.deepEqual(await test.storage.readSource('other'), { sequence: 1, repairRevision: 0 });
  });

  it('fails clearly for corrupt or exhausted counters instead of substituting a new baseline', async () => {
    for (const value of [-1, .5, Number.NaN, undefined]) {
      const test = fixture({ states: [{ _id: 'learner', sequence: value, repairRevision: 0 }] });
      await assert.rejects(test.storage.insert('learner', [row('new')]), /Invalid committed history source/);
      assert.equal(test.database().histories.size, 0);
    }
    const exhausted = fixture({ states: [{ _id: 'learner', sequence: Number.MAX_SAFE_INTEGER, repairRevision: 0 }] });
    await assert.rejects(exhausted.storage.insert('learner', [row('new')]), /safe integer range/);
    const exhaustedRepair = fixture({ states: [{ _id: 'learner', sequence: 0, repairRevision: Number.MAX_SAFE_INTEGER }] });
    await assert.rejects(exhaustedRepair.storage.mutate('learner', async () => undefined), /safe integer range/);
  });
});
