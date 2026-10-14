import { strict as assert } from 'node:assert';
import { insertSparcHistoryBatch } from './sparcHistoryBatchStorage';

describe('Atomic SPARC score-change storage', () => {
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
