// Pure storage/host contracts with synthetic data. The separate pilot browser
// runner exercises actual Mongo/DDP through the supported local Docker app.
require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const rows = new Map();
let failInsert = false;
const matches = (row, query) => Object.entries(query).every(([key, expected]) => {
  const actual = key.split('.').reduce((value, part) => value?.[part], row);
  return expected && typeof expected === 'object' && '$gt' in expected ? actual > expected.$gt : actual === expected;
});
const raw = {
  async createIndex() {},
  async findOne(query) { return structuredClone([...rows.values()].find(row => matches(row, query))); },
  async insertOne(row) { if (failInsert) throw Error('synthetic write failure'); if (rows.has(row._id)) throw Error('duplicate id'); rows.set(row._id, structuredClone(row)); },
  async updateOne(query, update) { const row = [...rows.values()].find(row => matches(row, query)); if (row) Object.assign(row, structuredClone(update.$set)); },
  async updateMany(query, update) { for (const row of rows.values()) if (matches(row, query)) Object.assign(row, structuredClone(update.$set)); },
  async deleteMany(query) { for (const [id, row] of rows) if (matches(row, query)) rows.delete(id); },
  find(query) { let result = [...rows.values()].filter(row => matches(row, query)); return {
    sort() { result.sort((a, b) => a.batch.firstSequence - b.batch.firstSequence); return this; },
    limit(n) { result = result.slice(0, n); return this; }, async toArray() { return structuredClone(result); },
  }; },
};
const buildId = 'synthetic-build';
const Meteor = {
  Error: class extends Error { constructor(code, message) { super(message); this.error = code; } },
  settings: { public: { simulationBuilds: [{ id: buildId, url: 'https://simulation.example/sim.html', sha256: '0'.repeat(64) }] } },
};
const load = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'meteor/meteor') return { Meteor };
  if (name === 'meteor/mongo') return {
    Mongo: { Collection: class { rawCollection() { return raw; } async insertAsync(row) { await raw.insertOne(row); return row._id; } } },
    MongoInternals: { defaultRemoteCollectionDriver: () => ({ mongo: { client: { startSession: () => ({
      async withTransaction(work) { const before = structuredClone(rows); try { await work(); } catch (error) { rows.clear(); before.forEach((value, key) => rows.set(key, value)); throw error; } },
      async endSession() {},
    }) } } }) },
  };
  return load.call(this, name, parent, main);
};
const storage = require('../server/lib/simulationTelemetry.ts');
const { createSimulationTelemetryMethods } = require('../server/methods/simulationTelemetryMethods.ts');
const { SimulationResearchHost } = require('../client/views/experiment/svelte/services/simulationResearchHost.ts');
Module._load = load;
const methods = createSimulationTelemetryMethods({ getMethodAuthorizationDeps: () => ({
  requireSparcLessonAccess: async (user, tdf) => { if (tdf !== 'lesson') throw Error('no lesson access'); },
  userIsInRoleAsync: async user => user === 'admin',
}) });
const scope = { tdfId: 'lesson', pageKey: 'page', nodeId: 'simulation', buildId };
const record = (sequence, type, data) => ({ sequence, order: sequence, frame: 1, time: sequence, type, data });
const batch = (...records) => ({ firstSequence: records[0].sequence, lastSequence: records.at(-1).sequence, records });
const initial = () => batch(record(1, 'catalog', { id: 'p', path: 'screens.0.model.mass', coverage: 'observed' }),
  record(2, 'initial', { id: 'p', state: { value: 5 } }), record(3, 'checkpoint', { evidenceComplete: true }));

test('durable duplicate acceptance, conflict rejection, ownership, interruption and rollback', async () => {
  rows.clear();
  const { attemptId } = await storage.startSimulationAttempt('learner', scope);
  const first = initial();
  assert.deepEqual(await storage.ingestSimulationBatch('learner', attemptId, first), { sequence: 3, complete: true });
  await storage.ingestSimulationBatch('learner', attemptId, first);
  assert.equal(rows.size, 2);
  await assert.rejects(storage.ingestSimulationBatch('other', attemptId, first), /unavailable/);
  const conflicting = initial(); conflicting.records[1].data.state.value = 7;
  await assert.rejects(storage.ingestSimulationBatch('learner', attemptId, conflicting), /incomplete/);
  assert.equal(rows.get(attemptId).status, 'incomplete');
  const fresh = await storage.startSimulationAttempt('learner', scope);
  failInsert = true;
  await assert.rejects(storage.ingestSimulationBatch('learner', fresh.attemptId, first), /write failure/);
  failInsert = false;
  assert.equal(rows.get(fresh.attemptId).lastSequence, 0);
  await storage.ingestSimulationBatch('learner', fresh.attemptId, first);
  await storage.interruptSimulationScope('learner', scope);
  assert.equal(rows.get(fresh.attemptId).status, 'interrupted');
  assert.ok(rows.has(`${attemptId}:1`));
  await assert.rejects(storage.ingestSimulationBatch('learner', fresh.attemptId, batch(record(4, 'checkpoint', { evidenceComplete: true }))), /incomplete/);
});

test('authenticated lesson access and administrator-only research export', async () => {
  await assert.rejects(methods.startSimulationResearchAttempt.call({}, scope), /logged in/);
  await assert.rejects(methods.startSimulationResearchAttempt.call({ userId: 'learner' }, { ...scope, tdfId: 'forbidden' }), /lesson access/);
  await assert.rejects(methods.startSimulationResearchAttempt.call({ userId: 'learner' }, { ...scope, buildId: 'unapproved' }), /approved/);
  await assert.rejects(methods.exportSimulationResearchTrace.call({ userId: 'learner' }, 'attempt', 0), /Permission/);
});

test('account deletion removes only the selected research owner and preserves other traces', async () => {
  const selected = await storage.startSimulationAttempt('selected-owner', scope);
  const other = await storage.startSimulationAttempt('other-owner', scope);
  await storage.ingestSimulationBatch('selected-owner', selected.attemptId, initial());
  await assert.rejects(storage.removeSimulationResearchUserRecords(''), /Invalid simulation research owner/);
  await storage.removeSimulationResearchUserRecords('selected-owner');
  assert.equal([...rows.values()].some(row => row.userId === 'selected-owner'), false);
  assert.ok(rows.has(other.attemptId));
});

test('sequence gaps and terminal collector errors suspend acceptance', async () => {
  const a = await storage.startSimulationAttempt('learner', scope);
  await assert.rejects(storage.ingestSimulationBatch('learner', a.attemptId, batch(record(2, 'checkpoint', { evidenceComplete: true }))), /incomplete/);
  const b = await storage.startSimulationAttempt('learner', scope);
  assert.equal((await storage.ingestSimulationBatch('learner', b.attemptId, batch(record(1, 'monitoring-error', { reason: 'overflow' })))).complete, false);
  const c = await storage.startSimulationAttempt('learner', scope);
  await assert.rejects(storage.endSimulationAttempt('learner', c.attemptId, 'arbitrary unbounded diagnostic'), /Invalid simulation stop reason/);
  await storage.endSimulationAttempt('learner', c.attemptId, 'host-queue-overflow');
  assert.equal(rows.get(c.attemptId).status, 'incomplete');
  assert.equal(rows.get(c.attemptId).reason, 'host-queue-overflow');
});

test('host requires explicit start, ignores foreign windows and does not duplicate instructional decisions', async () => {
  const handlers = new Map(), frameHandlers = new Map(), sent = [], decisions = [], statuses = [];
  global.window = { location: { origin: 'https://host.example' }, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const iframe = { src: 'about:blank', contentWindow: { postMessage: message => sent.push(message) },
    addEventListener: (name, fn) => frameHandlers.set(name, fn), removeEventListener: name => frameHandlers.delete(name) };
  Meteor.callAsync = async (name, ...args) => methods[name].call({ userId: 'learner' }, ...args);
  const host = new SimulationResearchHost({ iframe, scope,
    config: { buildId, bindings: [{ name: 'mass', address: { path: 'screens.0.model.mass' }, projection: 'value' }] },
    status: value => statuses.push(value), observation: async (facts, evidence) => decisions.push({ facts, evidence }),
  });
  try {
    await host.initialize(); assert.equal(iframe.src, 'about:blank'); assert.equal(statuses.at(-1), 'ready');
    await host.start(); frameHandlers.get('load')();
    const init = sent.at(-1);
    const receive = async (kind, data, source = iframe.contentWindow) => {
      handlers.get('message')({ origin: 'https://simulation.example', source, data: { ...init, kind, data } });
      await host.work;
    };
    const readiness = { evidenceComplete: true, scope: 'initialized-screen-models' };
    await receive('ready', readiness, {}); assert.notEqual(statuses.at(-1), 'running');
    await receive('ready', readiness);
    assert.equal(host.timer, undefined, 'a ready idle simulation has no heartbeat watchdog');
    const initialMessage = { origin: 'https://simulation.example', source: iframe.contentWindow, data: { ...init, kind: 'batch', data: initial() } };
    handlers.get('message')(initialMessage);
    const bytes = host.queuedBytes;
    for (let retry = 0; retry < 100; retry++) handlers.get('message')({ ...initialMessage, data: structuredClone(initialMessage.data) });
    assert.equal(host.queuedBytes, bytes, 'identical in-flight retries must not fill the host queue');
    await host.work;
    await receive('batch', initial());
    assert.equal(decisions.length, 1); assert.equal(decisions[0].facts.mass, 5);
    assert.equal(decisions[0].evidence.lastSequence, 3);
    await receive('batch', batch(record(5, 'checkpoint', { evidenceComplete: true })));
    assert.equal(statuses.at(-1), 'stopped'); assert.equal(decisions.length, 1);
  } finally { host.dispose(); delete global.window; }
  assert.equal(handlers.size, 0); assert.equal(frameHandlers.size, 0); assert.equal(iframe.src, 'about:blank');
});

test('a fresh explicit attempt cannot be stopped or blocked by a prior delayed request', async () => {
  const handlers = new Map(), frameHandlers = new Map(), sent = [], decisions = [], statuses = [];
  global.window = { location: { origin: 'https://host.example' }, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const iframe = { src: 'about:blank', contentWindow: { postMessage: message => sent.push(message) },
    addEventListener: (name, fn) => frameHandlers.set(name, fn), removeEventListener: name => frameHandlers.delete(name) };
  let delayedAttempt, rejectDelayed;
  const delayed = new Promise((_resolve, reject) => { rejectDelayed = reject; });
  Meteor.callAsync = async (name, ...args) => name === 'ingestSimulationResearchBatch' && args[0] === delayedAttempt
    ? delayed : methods[name].call({ userId: 'learner' }, ...args);
  const host = new SimulationResearchHost({ iframe, scope,
    config: { buildId, bindings: [{ name: 'mass', address: { path: 'screens.0.model.mass' }, projection: 'value' }] },
    status: value => statuses.push(value), observation: async facts => decisions.push(facts),
  });
  const send = (init, kind, data) => handlers.get('message')({ origin: 'https://simulation.example', source: iframe.contentWindow, data: { ...init, kind, data } });
  try {
    await host.initialize(); await host.start(); frameHandlers.get('load')();
    const prior = sent.at(-1); delayedAttempt = prior.sessionId;
    send(prior, 'ready', { evidenceComplete: true, scope: 'initialized-screen-models' }); await host.work;
    send(prior, 'batch', initial());
    await Promise.resolve(); // Let the first ingestion enter its delayed request.
    const priorWork = host.work;
    send(prior, 'error', { reason: 'acknowledgment-timeout', evidenceComplete: false });
    assert.equal(statuses.at(-1), 'stopped', 'child errors interrupt a pending durable request immediately');
    await host.start(); frameHandlers.get('load')();
    const fresh = sent.at(-1); assert.notEqual(fresh.sessionId, prior.sessionId);
    send(fresh, 'ready', { evidenceComplete: true, scope: 'initialized-screen-models' });
    // A fresh work queue must settle before the old request resolves.
    let freshReady = false; host.work.then(() => { freshReady = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(freshReady, true);
    send(fresh, 'batch', initial()); await host.work;
    assert.equal(decisions.length, 1);
    rejectDelayed(Error('old transport failure')); await priorWork;
    assert.equal(statuses.at(-1), 'running');
    assert.equal(host.queuedBytes, 0);
    assert.equal(host.pendingBatches.size, 0);
  } finally { rejectDelayed(Error('test cleanup')); host.dispose(); delete global.window; }
});
