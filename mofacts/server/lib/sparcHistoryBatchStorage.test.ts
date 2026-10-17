import { strict as assert } from 'node:assert';
import { insertSparcHistoryBatch } from './sparcHistoryBatchStorage';

describe('Atomic SPARC score-change storage', () => {
  it('commits history and its exposure projection together and rebuilds the projection on an idempotent retry', async () => {
    type Row = Record<string, unknown> & { _id: string };
    let saved: Row[] = [], projected: string[] = [];
    let pendingRows: Row[] = [], pendingProjection: string[] = [];
    let rejectProjection = true;
    const session = {
      async withTransaction(action: () => Promise<void>) {
        pendingRows = [...saved]; pendingProjection = [...projected];
        await action();
        saved = pendingRows; projected = pendingProjection;
      },
      async endSession() {},
    };
    const collection = {
      find: () => ({ toArray: async () => pendingRows }),
      async insertMany(rows: readonly Row[]) { pendingRows.push(...rows); },
    };
    const project = async (rows: readonly Row[], active: typeof session) => {
      assert.equal(active, session);
      pendingProjection = rows.map(r => r._id);
      if (rejectProjection) throw new Error('Exposure write interrupted');
    };
    const rows = [{ _id: 'question', value: 'A new case?' }];
    await assert.rejects(insertSparcHistoryBatch(collection, rows, () => session, project), /Exposure write interrupted/);
    assert.deepEqual(saved, []); assert.deepEqual(projected, []);
    rejectProjection = false;
    await insertSparcHistoryBatch(collection, rows, () => session, project);
    assert.deepEqual(saved, rows); assert.deepEqual(projected, ['question']);
    projected = [];
    assert.equal((await insertSparcHistoryBatch(collection, rows, () => session, project)).length, 0);
    assert.deepEqual(projected, ['question']);
  });

  it('rolls back an interrupted batch, accepts a retry once, and rejects conflicting retries', async () => {
    type Row = Record<string, unknown> & { _id: string };
    let saved = new Map<string, Row>();
    let working = saved;
    let failAt: string | undefined = 'complete';
    let ended = 0;
    const session = {
      async withTransaction(action: () => Promise<void>, options: unknown) {
        assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        working = new Map(saved);
        await action();
        saved = working;
      },
      async endSession() { ended++; },
    };
    const collection = {
      find(selector: { _id: { $in: string[] } }, options: { session: typeof session }) {
        assert.equal(options.session, session);
        return { toArray: async () => selector._id.$in.flatMap(id => working.has(id) ? [working.get(id)!] : []) };
      },
      async insertMany(rows: readonly Row[], options: { session: typeof session }) {
        assert.equal(options.session, session);
        for (const row of rows) {
          if (row._id === failAt) throw new Error('interrupted transaction');
          working.set(row._id, row);
        }
      },
    };
    const rows = [{ _id: 'score-a', value: .3 }, { _id: 'score-m', value: 0 }, { _id: 'complete', done: true }];
    await assert.rejects(insertSparcHistoryBatch(collection, rows, () => session), /interrupted/);
    assert.equal(saved.size, 0);
    failAt = undefined;
    assert.equal((await insertSparcHistoryBatch(collection, rows, () => session)).length, 3);
    assert.equal((await insertSparcHistoryBatch(collection, rows, () => session)).length, 0);
    assert.equal(saved.size, 3);
    await assert.rejects(insertSparcHistoryBatch(collection, [{ _id: 'score-a', value: .9 }], () => session), /Conflicting/);
    assert.equal(saved.get('score-a')!.value, .3);
    assert.equal(ended, 4);
  });
});
