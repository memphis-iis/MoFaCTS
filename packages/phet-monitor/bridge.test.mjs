import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('./bridge.js', import.meta.url), 'utf8');
function fixture() {
  const handlers = new Map(), timers = new Map(), sent = [], chunks = [];
  let clock = 0, stops = 0, complete = true, serial = 0, notify = null;
  const parent = { postMessage(message, origin) { sent.push({ message: structuredClone(message), origin }); } };
  const window = {
    parent, phetResearchConfiguration: { buildId: 'test-build', hostOrigins: ['https://host.example'] },
    phetResearchMonitor: {
      drain(limit, bytes) { assert.equal(limit, 4000); assert.equal(bytes, 1024 * 1024); return chunks.shift() || []; },
      status() { return { complete }; }, stop() { stops++; },
      onRecords(listener) { notify = listener; },
    },
    addEventListener(name, callback) { handlers.set(name, callback); },
    removeEventListener(name) { handlers.delete(name); },
  };
  vm.runInNewContext(source, { window, performance: { now: () => clock },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const envelope = { protocol: 'phet-research', version: 3, buildId: 'test-build', sessionId: '12345678-1234-1234-1234-123456789abc' };
  return {
    sent, chunks, timers, handlers, parent,
    get stops() { return stops; },
    receive(kind, data, overrides = {}, event = {}) {
      handlers.get('message')({ source: parent, origin: 'https://host.example',
        data: { ...envelope, kind, data, ...overrides }, ...event });
    },
    tick() { for (const [id, timer] of timers) { if (timer.at <= clock) { timers.delete(id); timer.callback(); } } },
    advance(ms) { clock += ms; },
    notify() { notify?.(); },
    incomplete() { complete = false; },
  };
}

test('child validates parent, origin, version, build and session before startup', () => {
  const f = fixture();
  f.receive('initialize', {}, {}, { source: {} });
  f.receive('initialize', {}, {}, { origin: 'https://foreign.example' });
  f.receive('initialize', {}, { version: 1 });
  f.receive('initialize', {}, { buildId: 'other' });
  f.receive('initialize', {}, { sessionId: 'short' });
  assert.equal(f.sent.length, 0);
  f.receive('initialize', {});
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].message.kind, 'ready');
  assert.equal(f.sent[0].origin, 'https://host.example');
  f.receive('initialize', {});
  assert.equal(f.sent.length, 1, 'duplicate initialization must not reset stream identity');
});

test('child retries identical batches and advances only after exact matching acknowledgment', () => {
  const f = fixture();
  f.chunks.push([{ sequence: 1, type: 'initial', data: { value: 1 } }], [{ sequence: 2, type: 'sample', data: { value: 2 } }]);
  f.receive('initialize', {});
  f.tick(); // next task, with no elapsed batching delay
  const first = f.sent.at(-1);
  assert.equal(first.message.kind, 'batch');
  const initialCount = f.sent.length;
  for (let i = 0; i < 9; i++) { f.advance(100); f.tick(); }
  assert.equal(f.sent.length, initialCount, 'No repeated cloning while the first acknowledgment is in flight');
  f.advance(100); f.tick(); assert.equal(f.sent.length, initialCount + 1);
  assert.deepEqual(f.sent.at(-1), first, 'Loss recovery must retry the exact same batch');
  f.receive('ack', { sequence: 2 });
  f.tick(); assert.deepEqual(f.sent.at(-1), first);
  f.receive('ack', { sequence: 1 }, { sessionId: '12345678-1234-1234-1234-000000000000' });
  f.tick(); assert.deepEqual(f.sent.at(-1), first);
  f.receive('ack', { sequence: 1 });
  f.advance(100); f.tick(); assert.equal(f.sent.at(-1).message.data.firstSequence, 2);
  f.receive('ack', { sequence: 2 });
  const count = f.sent.length; f.advance(100); f.tick(); assert.equal(f.sent.length, count);
  assert.equal(f.timers.size, 0, 'idle transport has no recurring timer');
  f.chunks.push([{ sequence: 3 }]); f.notify(); f.notify();
  assert.equal(f.timers.size, 1, 'record notifications coalesce one flush');
  f.advance(100); f.tick(); assert.equal(f.sent.at(-1).message.data.firstSequence, 3);
});

test('lost acknowledgments and unload release the collector and report incomplete evidence', () => {
  const f = fixture();
  f.chunks.push([{ sequence: 1 }]);
  f.receive('initialize', {});
  f.advance(100); f.tick();
  f.advance(10001); f.tick();
  assert.equal(f.stops, 1); assert.equal(f.timers.size, 0);
  assert.equal(f.sent.at(-1).message.data.reason, 'acknowledgment-timeout');
  assert.equal(f.sent.at(-1).message.data.evidenceComplete, false);
  f.handlers.get('pagehide')();
  assert.equal(f.handlers.has('message'), false); assert.equal(f.stops, 1);
});

test('collector failure is explicit and never advertises complete readiness', () => {
  const f = fixture(); f.incomplete(); f.receive('initialize', {});
  f.advance(100); f.tick();
  assert.equal(f.sent[0].message.data.evidenceComplete, false);
  assert.equal(f.sent.at(-1).message.data.reason, 'collector-incomplete');
  assert.equal(f.stops, 1);
});
