import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareHistoryExportRecords } from './historyExportOrder';
import { HISTORY_EXPORT_SOURCE_PROJECTION, writeHistoryExport } from './historyExport';
import { sortedOwnedHistoryRecords } from './sortedHistoryExport';
import { operationalHistorySelector } from '../../common/historyEnvelope';

describe('sorted instructor history export', () => {
  it('batches lessons while retaining instructor order, cross-lesson ties and formatter output', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'mofacts-history-synthetic-test-'));
    try {
      const rows: Record<string, unknown>[] = [
        { userId: 'synthetic-b', anonStudentId: 'b', time: 10, outcome: 'study', input: 'one' },
        { userId: 'synthetic-a', anonStudentId: 'a', time: 10, CFStartLatency: 5, outcome: 'correct', input: 'two' },
        { userId: 'synthetic-a', anonStudentId: 'a', problemStartTime: 1, time: 12, eventId: 2, outcome: 'incorrect', input: 'three' },
        { userId: 'synthetic-a', anonStudentId: 'a', time: 10, outcome: 'study', input: 'four', feedbackText: new Date(0) },
        { userId: 'synthetic-a', anonStudentId: 'a', time: undefined, eventId: 4, input: 'tie-one' },
        { userId: 'synthetic-a', anonStudentId: 'a', time: undefined, eventId: 1, input: 'tie-two' },
      ];
      rows.forEach((row, index) => { row.TDFId = index < 3 ? 'first' : 'second'; });
      rows.push({ TDFId: 'first', userId: 'synthetic-a', time: undefined, input: 'first-lesson-tie' });
      const calls: unknown[] = [];
      let open = 0;
      let closed = 0;
      const histories = {
        find: (selector: Record<string, unknown>, options: unknown) => {
          calls.push({ selector, options });
          assert.equal(open++, 0);
          // A batched database cursor may interleave lessons in any order.
          const selected = [...rows.filter(row => row.TDFId === 'second'), ...rows.filter(row => row.TDFId === 'first')];
          return { async *[Symbol.asyncIterator]() { yield* selected; }, close: async () => { open--; closed++; } };
        },
      };
      const expectedRows = [...rows.filter(row => row.TDFId === 'first'), ...rows.filter(row => row.TDFId === 'second')].sort(compareHistoryExportRecords);
      let expected = '';
      await writeHistoryExport(expectedRows, chunk => { expected += chunk; }, error => { throw error; });
      let actual = '';
      await writeHistoryExport(sortedOwnedHistoryRecords(histories, ['first', 'second'], { tempDirectory: directory, maxRowsPerRun: 1, mergeFanIn: 2 }), chunk => { actual += chunk; }, error => { throw error; });
      assert.equal(actual, expected);
      assert.equal(closed, 1);
      assert.deepEqual(calls, [{ selector: { TDFId: { $in: ['first', 'second'] }, ...operationalHistorySelector() }, options: { projection: HISTORY_EXPORT_SOURCE_PROJECTION, batchSize: 500 } }]);
      assert.equal(HISTORY_EXPORT_SOURCE_PROJECTION._id, 0);
      assert.equal(HISTORY_EXPORT_SOURCE_PROJECTION.sparc, undefined);
      assert.deepEqual(await fs.readdir(directory), []);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('bounds lesson ID batches and closes each source cursor before opening the next', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'mofacts-history-synthetic-test-'));
    try {
      const ids = Array.from({ length: 1001 }, (_, index) => `synthetic-lesson-${index}`);
      const batches: string[][] = [];
      let open = false;
      const histories = {
        find: (selector: Record<string, unknown>) => {
          assert.equal(open, false);
          open = true;
          const ids = (selector.TDFId as { $in: string[] }).$in;
          batches.push(ids);
          return { async *[Symbol.asyncIterator]() { yield { TDFId: ids[0], userId: 'synthetic', time: batches.length }; }, close: async () => { open = false; } };
        },
      };
      const actual = [];
      for await (const row of sortedOwnedHistoryRecords(histories, ids, { tempDirectory: directory })) actual.push(row);
      assert.equal(actual.length, 3);
      assert.deepEqual(batches.map(batch => batch.length), [500, 500, 1]);
      assert.deepEqual(batches.flat(), ids);
      assert.equal(open, false);
      assert.deepEqual(await fs.readdir(directory), []);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('closes the source and clears scratch when cancellation or an invalid source scope terminates reading', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'mofacts-history-synthetic-test-'));
    try {
      const controller = new AbortController();
      let closed = 0;
      const histories = {
        find: () => ({ async *[Symbol.asyncIterator]() {
          yield { TDFId: 'first', time: 1 };
          controller.abort(new Error('synthetic cancelled read'));
          yield { TDFId: 'first', time: 2 };
        }, close: async () => { closed++; } }),
      };
      await assert.rejects(async () => {
        for await (const row of sortedOwnedHistoryRecords(histories, ['first'], { tempDirectory: directory, signal: controller.signal })) void row;
      }, /synthetic cancelled read/);
      assert.ok(closed >= 1);
      const invalid = { find: () => ({ async *[Symbol.asyncIterator]() { yield { TDFId: 'outside' }; }, close: async () => { closed++; } }) };
      await assert.rejects(async () => {
        for await (const row of sortedOwnedHistoryRecords(invalid, ['first'], { tempDirectory: directory })) void row;
      }, /outside the authorized lesson scope/);
      assert.deepEqual(await fs.readdir(directory), []);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('propagates a failing transport writer instead of reporting it as a malformed row', async () => {
    let errors = 0;
    let writes = 0;
    await assert.rejects(writeHistoryExport([{ time: 1, input: 'synthetic one' }, { time: 2, input: 'synthetic two' }], async () => {
      if (++writes === 2) throw new Error('synthetic writer disconnected');
    }, () => { errors++; }), /synthetic writer disconnected/);
    assert.equal(writes, 2);
    assert.equal(errors, 0);
  });
});
