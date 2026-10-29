import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateHeaderValue } from 'node:http';
import { createOwnedHistoryDownloadHandler } from './ownedHistoryDownloadHandler';
import type { OwnedHistoryDownloadHandlerDeps } from './ownedHistoryDownloadHandler';
import type { OwnedHistoryDownloadToken } from './ownedHistoryDownloadTokens';

describe('owned history HTTP download boundary', () => {
  function fixture(overrides: Partial<OwnedHistoryDownloadHandlerDeps> = {}) {
    const record: OwnedHistoryDownloadToken = {
      actorId: 'synthetic-owner', request: { kind: 'owned-lessons' },
      tdfIds: ['synthetic-lesson'], fileName: 'synthetic-data.tsv', expiresAt: Date.now() + 10000,
    };
    const req = Object.assign(new EventEmitter(), { method: 'GET', url: '/synthetic-token/synthetic-data.tsv' });
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    class SyntheticResponse extends EventEmitter {
      destroyed = false;
      writableEnded = false;
      headersSent = false;
      statusCode = 0;
      writeHead(status: number, values: Record<string, string>) {
        for (const [name, value] of Object.entries(values)) validateHeaderValue(name, value);
        this.statusCode = status; this.headersSent = true; Object.assign(headers, values); return this;
      }
      write(chunk: Buffer): boolean { chunks.push(chunk); return true; }
      end(chunk?: string) { if (chunk) chunks.push(Buffer.from(chunk)); this.writableEnded = true; }
      destroy() { this.destroyed = true; this.emit('close'); return this; }
    }
    const res = new SyntheticResponse();
    let consumed = 0;
    let authorized = 0;
    let opened = 0;
    let closed = 0;
    const deps: OwnedHistoryDownloadHandlerDeps = {
      consumeToken: token => token === 'synthetic-token' && consumed++ === 0 ? record : null,
      reauthorize: async () => { authorized++; },
      openHistory: async function* (_record, signal) {
        opened++;
        try { signal.throwIfAborted(); yield { input: 'synthetic one' }; yield { input: 'synthetic two' }; }
        finally { closed++; }
      },
      writeHistory: async (histories, write) => {
        await write('Synthetic header\n');
        for await (const row of histories) await write(`${row.input}\n`);
      },
      ...overrides,
    };
    return { record, req, res, chunks, headers, deps, counts: () => ({ consumed, authorized, opened, closed }),
      run: () => createOwnedHistoryDownloadHandler(deps)(req as unknown as IncomingMessage, res as unknown as ServerResponse) };
  }

  it('streams Unicode lesson names using a valid HTTP attachment header', async () => {
    const f = fixture();
    f.record.fileName = 'SPARC — 中文-data.tsv';
    f.req.url = `/synthetic-token/${encodeURIComponent(f.record.fileName)}`;
    await f.run();
    assert.equal(f.res.statusCode, 200);
    const disposition = f.headers['Content-Disposition'];
    assert.ok(disposition);
    assert.doesNotThrow(() => validateHeaderValue('Content-Disposition', disposition));
    assert.equal(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]!), f.record.fileName);
    assert.match(Buffer.concat(f.chunks).toString('utf16le'), /synthetic one/);
  });

  it('authorizes before reading and after sorting, then writes a no-store UTF-16LE attachment', async () => {
    const f = fixture();
    await f.run();
    assert.deepEqual(f.counts(), { consumed: 1, authorized: 2, opened: 1, closed: 1 });
    assert.equal(f.res.statusCode, 200);
    assert.equal(f.headers['Cache-Control'], 'no-store');
    assert.equal(f.headers['X-Content-Type-Options'], 'nosniff');
    assert.match(f.headers['Content-Disposition']!, /synthetic-data\.tsv/);
    assert.deepEqual(f.chunks[0], Buffer.from([0xFF, 0xFE]));
    assert.equal(Buffer.concat(f.chunks.slice(1)).toString('utf16le'), 'Synthetic header\nsynthetic one\nsynthetic two\n');
    assert.equal(f.res.writableEnded, true);
    assert.equal(f.req.listenerCount('aborted'), 0);
    assert.equal(f.res.listenerCount('close'), 0);
    assert.equal(f.res.listenerCount('error'), 0);
  });

  it('rejects invalid paths or one-use capabilities before opening a history cursor', async () => {
    const f = fixture();
    f.req.url = '/synthetic-token/wrong-file.tsv';
    await f.run();
    assert.equal(f.res.statusCode, 404);
    assert.equal(f.counts().opened, 0);
    f.req.url = '/synthetic-token/synthetic-data.tsv';
    await f.run();
    assert.equal(f.res.statusCode, 404);
    assert.equal(f.counts().opened, 0);
    const extra = fixture();
    extra.req.url += '/unexpected';
    await extra.run();
    assert.equal(extra.res.statusCode, 404);
    assert.equal(extra.counts().consumed, 0);
  });

  it('rejects authorization revoked during sorting before headers or export bytes and closes the iterator', async () => {
    let authorization = 0;
    const f = fixture({ reauthorize: async () => {
      if (++authorization === 2) throw Object.assign(new Error('synthetic private reason'), { error: 403 });
    } });
    await f.run();
    assert.equal(f.res.statusCode, 403);
    assert.equal(f.counts().opened, 1);
    assert.equal(f.counts().closed, 1);
    assert.equal(Buffer.concat(f.chunks).toString(), 'Not authorized to download this history');
    assert.equal(f.headers['Content-Disposition'], undefined);
  });

  it('does not read histories when the initial authorization fails', async () => {
    const f = fixture({ reauthorize: async () => { throw Object.assign(new Error('synthetic secret'), { error: 403 }); } });
    await f.run();
    assert.equal(f.res.statusCode, 403);
    assert.equal(f.counts().opened, 0);
    assert.ok(!Buffer.concat(f.chunks).toString().includes('synthetic secret'));
  });

  it('waits for backpressure and closes the iterator after a client disconnect', async () => {
    const f = fixture();
    let writes = 0;
    f.res.write = function(chunk: Buffer) {
      f.chunks.push(chunk);
      writes++;
      if (writes === 1) queueMicrotask(() => this.emit('drain'));
      else queueMicrotask(() => this.destroy());
      return false;
    };
    await f.run();
    assert.equal(writes, 2);
    assert.equal(f.res.destroyed, true);
    assert.equal(f.counts().closed, 1);
    assert.equal(f.res.listenerCount('drain'), 0);
    assert.equal(f.res.listenerCount('error'), 0);
  });

  it('destroys a started stream on a writer failure and does not emit private exception text', async () => {
    const f = fixture({ writeHistory: async () => { throw new Error('synthetic learner content'); } });
    await f.run();
    assert.equal(f.res.destroyed, true);
    assert.equal(f.counts().closed, 1);
    assert.deepEqual(f.chunks, [Buffer.from([0xFF, 0xFE])]);
  });
});
