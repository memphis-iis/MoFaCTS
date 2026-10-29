import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedExternalSort, cleanupAbandonedExternalSortRuns } from './boundedExternalSort';

describe('boundedExternalSort', () => {
  async function inScratch(work: (directory: string) => Promise<void>): Promise<void> {
    const directory = await fs.mkdtemp(join(tmpdir(), 'mofacts-sort-synthetic-test-'));
    try { await work(directory); }
    finally { await fs.rm(directory, { recursive: true, force: true }); }
  }

  it('uses multiple bounded merge passes with stable ties and retains Date/undefined', async () => {
    await inScratch(async tempDirectory => {
      const rows = Array.from({ length: 61 }, (_, index) => ({
        _id: `synthetic-${index}`, order: (61 - index) % 7,
        date: new Date(1700000000000 + index), absent: undefined,
      }));
      const expected = [...rows].sort((a, b) => a.order - b.order);
      const actual = [];
      for await (const row of boundedExternalSort(rows, (a, b) => a.order - b.order, { tempDirectory, maxRowsPerRun: 2, maxBytesPerRun: 512, mergeFanIn: 2 })) actual.push(row);
      assert.deepEqual(actual, expected);
      assert.ok(actual[0]!.date instanceof Date);
      assert.ok(Object.hasOwn(actual[0]!, 'absent'));
      assert.deepEqual(await fs.readdir(tempDirectory), []);
    });
  });

  it('matches stable Array.sort when the comparator returns NaN and a record exceeds the byte budget', async () => {
    await inScratch(async tempDirectory => {
      const rows = [0, 1, 2, 3].map(id => ({ id, payload: 'synthetic'.repeat(100) }));
      const actual = [];
      for await (const row of boundedExternalSort(rows, () => Number.NaN, { tempDirectory, maxBytesPerRun: 8, mergeFanIn: 2 })) actual.push(row);
      assert.deepEqual(actual, rows);
      assert.deepEqual(await fs.readdir(tempDirectory), []);
    });
  });

  it('closes a failing source and removes scratch after failure or early consumer return', async () => {
    await inScratch(async tempDirectory => {
      let closed = false;
      async function* failing() {
        try { yield 2; yield 1; throw new Error('synthetic source failure'); }
        finally { closed = true; }
      }
      await assert.rejects(async () => {
        for await (const row of boundedExternalSort(failing(), (a, b) => a - b, { tempDirectory, maxRowsPerRun: 1 })) void row;
      }, /synthetic source failure/);
      assert.equal(closed, true);
      assert.deepEqual(await fs.readdir(tempDirectory), []);
      for await (const row of boundedExternalSort([4, 3, 2, 1], (a, b) => a - b, { tempDirectory, maxRowsPerRun: 1, mergeFanIn: 2 })) { assert.equal(row, 1); break; }
      assert.deepEqual(await fs.readdir(tempDirectory), []);
    });
  });

  it('removes private runs after cancellation and leaves active or unrelated startup directories alone', async () => {
    await inScratch(async tempDirectory => {
      const controller = new AbortController();
      const output = boundedExternalSort([4, 3, 2, 1], (a, b) => a - b, { tempDirectory, signal: controller.signal, maxRowsPerRun: 1, mergeFanIn: 2 });
      assert.equal((await output.next()).value, 1);
      controller.abort(new Error('synthetic cancellation'));
      await assert.rejects(output.next(), /synthetic cancellation/);
      assert.deepEqual(await fs.readdir(tempDirectory), []);
      const active = join(tempDirectory, `mofacts-external-sort-${process.pid}-active`);
      const unrelated = join(tempDirectory, 'unrelated-data');
      await fs.mkdir(active);
      await fs.mkdir(unrelated);
      await fs.writeFile(join(active, 'owner.json'), JSON.stringify({ owner: 'mofacts-bounded-external-sort-v1', pid: process.pid }));
      await cleanupAbandonedExternalSortRuns({ tempDirectory });
      assert.deepEqual((await fs.readdir(tempDirectory)).sort(), [active.split(/[\\/]/).pop(), 'unrelated-data'].sort());
    });
  });

  it('cleans only marked dead-process runs and does not follow directory links', async () => {
    await inScratch(async tempDirectory => {
      const deadPid = 2147483647;
      const dead = join(tempDirectory, `mofacts-external-sort-${deadPid}-dead`);
      const wrongOwner = join(tempDirectory, `mofacts-external-sort-${deadPid}-unrelated`);
      const target = join(tempDirectory, 'synthetic-link-target');
      const link = join(tempDirectory, `mofacts-external-sort-${deadPid}-link`);
      for (const path of [dead, wrongOwner, target]) await fs.mkdir(path);
      await fs.writeFile(join(dead, 'owner.json'), JSON.stringify({ owner: 'mofacts-bounded-external-sort-v1', pid: deadPid }));
      await fs.writeFile(join(wrongOwner, 'owner.json'), JSON.stringify({ owner: 'unrelated', pid: deadPid }));
      await fs.writeFile(join(target, 'owner.json'), JSON.stringify({ owner: 'mofacts-bounded-external-sort-v1', pid: deadPid }));
      await fs.symlink(target, link, 'junction');
      const kill = process.kill;
      try {
        process.kill = ((pid: number, signal: unknown) => {
          if (pid === deadPid && signal === 0) throw Object.assign(new Error('synthetic dead process'), { code: 'ESRCH' });
          throw new Error('Unexpected process check in synthetic cleanup');
        }) as typeof process.kill;
        await cleanupAbandonedExternalSortRuns({ tempDirectory });
      } finally { process.kill = kill; }
      await assert.rejects(fs.stat(dead), { code: 'ENOENT' });
      assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
      assert.equal((await fs.stat(join(target, 'owner.json'))).isFile(), true);
      assert.equal((await fs.stat(join(wrongOwner, 'owner.json'))).isFile(), true);
    });
  });
});
