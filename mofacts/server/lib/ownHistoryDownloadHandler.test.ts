import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createOwnHistoryDownloadHandler, type OwnHistoryDownloadHandlerDeps } from './ownHistoryDownloadHandler';

describe('own history HTTP download lifecycle', () => {
  function fixture() {
    const record = { userId: 'synthetic-user', fileName: 'synthetic-data.tsv', expiresAt: Date.now() + 10000 };
    const req = Object.assign(new EventEmitter(), { method: 'GET', url: '/synthetic-token/synthetic-data.tsv' });
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    class SyntheticResponse extends EventEmitter {
      destroyed = false;
      writableEnded = false;
      headersSent = false;
      statusCode = 0;
      writeHead(code: number, values: Record<string, string>) { this.statusCode = code; this.headersSent = true; Object.assign(headers, values); return this; }
      write(chunk: Buffer): boolean { chunks.push(chunk); return true; }
      end(chunk?: string) { if (chunk) chunks.push(Buffer.from(chunk)); this.writableEnded = true; }
      destroy() { this.destroyed = true; this.emit('close'); return this; }
    }
    const res = new SyntheticResponse();
    let opened = 0; let closed = 0; let consumed = 0; let userReads = 0; let historyReads = 0; let position = 0;
    const rows = [{ input: 'synthetic one' }, { input: 'synthetic two' }];
    const cursor = {
      [Symbol.asyncIterator]() { return this; },
      async next(): Promise<IteratorResult<Record<string, unknown>>> {
        const row = rows[position++];
        return row ? { done: false, value: row } : { done: true, value: undefined };
      },
      async close(): Promise<void> { closed++; },
    };
    const deps: OwnHistoryDownloadHandlerDeps = {
      consumeToken: token => token === 'synthetic-token' && consumed++ === 0 ? record : null,
      userExists: async userId => { assert.equal(userId, record.userId); userReads++; return true; },
      hasHistory: async userId => { assert.equal(userId, record.userId); historyReads++; return true; },
      openHistory: value => { assert.deepEqual(value, record); opened++; return cursor; },
      writeHistory: async (histories, write) => {
        await write('Synthetic header\n');
        for await (const row of histories) await write(`${row.input}\n`);
      },
    };
    async function run(): Promise<void> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          createOwnHistoryDownloadHandler(deps)(req as unknown as IncomingMessage, res as unknown as ServerResponse),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Download handler did not settle')), 1000); }),
        ]);
      } finally { clearTimeout(timer); }
      assert.equal(req.listenerCount('aborted'), 0);
      for (const event of ['drain', 'close', 'error']) assert.equal(res.listenerCount(event), 0);
    }
    return { record, req, res, chunks, headers, cursor, deps, run, counts: () => ({ opened, closed, consumed, userReads, historyReads }) };
  }

  it('completes a UTF-16LE attachment, closes its cursor and consumes its capability once', async () => {
    const f = fixture();
    await f.run();
    assert.deepEqual(f.counts(), { opened: 1, closed: 1, consumed: 1, userReads: 1, historyReads: 1 });
    assert.equal(f.res.statusCode, 200);
    assert.equal(f.headers['Cache-Control'], 'no-store');
    assert.equal(f.headers['Content-Type'], 'text/tab-separated-values; charset=utf-16le');
    assert.match(f.headers['Content-Disposition']!, /synthetic-data\.tsv/);
    assert.deepEqual(f.chunks[0], Buffer.from([0xFF, 0xFE]));
    assert.equal(Buffer.concat(f.chunks.slice(1)).toString('utf16le'), 'Synthetic header\nsynthetic one\nsynthetic two\n');
    assert.equal(f.res.writableEnded, true);
    await f.run();
    assert.equal(f.res.statusCode, 404);
    assert.equal(f.counts().opened, 1);
  });

  it('rejects non-GET requests, invalid tokens and filenames without opening a cursor', async () => {
    const method = fixture(); method.req.method = 'POST'; await method.run();
    assert.equal(method.res.statusCode, 405); assert.equal(method.counts().consumed, 0);
    for (const url of ['/invalid/synthetic-data.tsv', '/synthetic-token/wrong.tsv']) {
      const f = fixture(); f.req.url = url; await f.run();
      assert.equal(f.res.statusCode, 404); assert.equal(f.counts().opened, 0); assert.equal(f.counts().userReads, 0);
    }
  });

  it('preserves missing-user and missing-history rejection before streaming', async () => {
    const user = fixture(); user.deps.userExists = async () => false; await user.run();
    assert.equal(user.res.statusCode, 404); assert.equal(user.counts().historyReads, 0); assert.equal(user.counts().opened, 0);
    const history = fixture(); history.deps.hasHistory = async () => false; await history.run();
    assert.equal(history.res.statusCode, 404); assert.equal(history.counts().opened, 0);
  });

  it('resumes after data backpressure drains and closes the cursor on completion', async () => {
    const f = fixture(); let writes = 0;
    f.res.write = function(chunk) {
      f.chunks.push(chunk);
      if (++writes === 3) { queueMicrotask(() => this.emit('drain')); return false; }
      return true;
    };
    await f.run();
    assert.equal(f.res.writableEnded, true); assert.equal(f.counts().closed, 1);
    assert.match(Buffer.concat(f.chunks.slice(1)).toString('utf16le'), /synthetic two/);
  });

  for (const event of ['close', 'error', 'aborted'] as const) {
    it(`settles and closes the cursor when ${event} interrupts a blocked data write`, async () => {
      const f = fixture(); let writes = 0;
      f.res.write = function(chunk) {
        f.chunks.push(chunk);
        if (++writes !== 3) return true;
        queueMicrotask(() => {
          if (event === 'aborted') f.req.emit('aborted');
          else if (event === 'error') this.emit('error', new Error('synthetic transport failure'));
          else this.destroy();
        });
        return false;
      };
      await f.run();
      assert.equal(writes, 3); assert.equal(f.counts().closed, 1); assert.equal(f.res.writableEnded, false);
    });
  }

  it('does not open a cursor when the initial BOM write is cancelled', async () => {
    const f = fixture();
    f.res.write = function() { queueMicrotask(() => this.destroy()); return false; };
    await f.run();
    assert.equal(f.counts().opened, 0);
  });

  it('closes a cursor while its next row is pending on an aborted connection', async () => {
    const f = fixture(); let finishRead: ((value: IteratorResult<Record<string, unknown>>) => void) | undefined;
    f.cursor.next = () => new Promise(resolve => { finishRead = resolve; queueMicrotask(() => f.req.emit('aborted')); });
    const close = f.cursor.close;
    f.cursor.close = async () => { await close(); finishRead?.({ done: true, value: undefined }); };
    await f.run();
    assert.equal(f.counts().closed, 1); assert.equal(f.res.writableEnded, false);
  });

  it('closes the cursor after a formatter failure without exposing private exception text', async () => {
    const f = fixture();
    f.deps.writeHistory = async () => { throw new Error('synthetic private content'); };
    await f.run();
    assert.equal(f.res.destroyed, true); assert.equal(f.counts().closed, 1);
    assert.ok(!Buffer.concat(f.chunks).toString().includes('synthetic private content'));
  });

  it('handles cursor-close failures without rejecting the HTTP handler', async () => {
    const f = fixture(); f.cursor.close = async () => { throw new Error('synthetic cleanup failure'); };
    await f.run();
    assert.equal(f.res.writableEnded, true);
  });
});
