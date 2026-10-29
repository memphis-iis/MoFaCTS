import { strict as assert } from 'node:assert';
import { HistoryCommitConflictError, type HistoryCommitRow } from './historyCommitStorage';
import { insertSparcHistoryBatch } from './sparcHistoryBatchStorage';

describe('SPARC score-change commit delegation', () => {
  it('delegates the complete assessment batch once to the shared history commit owner', async () => {
    const rows = [{ _id: 'score-a', userId: 'learner', value: .3 }, { _id: 'complete', userId: 'learner', done: true }];
    let called = 0;
    const result = await insertSparcHistoryBatch({
      async insert(userId: string, batch: readonly HistoryCommitRow[]) {
        called += 1;
        assert.equal(userId, 'learner');
        assert.equal(batch, rows);
        return batch.map((row, index) => ({ ...row, historySequence: index + 1 }));
      },
    }, rows);
    assert.equal(called, 1);
    assert.deepEqual(result.map((row) => row.historySequence), [1, 2]);
  });

  it('preserves the SPARC conflict message while leaving operational failures unchanged', async () => {
    const rows = [{ _id: 'score-a', userId: 'learner', value: .3 }];
    await assert.rejects(insertSparcHistoryBatch({
      async insert() { throw new HistoryCommitConflictError(); },
    }, rows), /Conflicting SPARC assessment history\. Reload before continuing\./);
    const failure = new Error('database unavailable');
    await assert.rejects(insertSparcHistoryBatch({
      async insert() { throw failure; },
    }, rows), (error) => error === failure);
  });
});
