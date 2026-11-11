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
  } finally { host.dispose(); await host.traceWork; delete global.window; }
  assert.equal(handlers.size, 0); assert.equal(frameHandlers.size, 0); assert.equal(iframe.src, 'about:blank');
});

test('a fresh explicit attempt cannot be stopped or blocked by a prior delayed request', async () => {
  const handlers = new Map(), frameHandlers = new Map(), sent = [], decisions = [], statuses = [];
  global.window = { location: { origin: 'https://host.example' }, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const iframe = { src: 'about:blank', contentWindow: { postMessage: message => sent.push(message) },
    addEventListener: (name, fn) => frameHandlers.set(name, fn), removeEventListener: name => frameHandlers.delete(name) };
  let delayedAttempt, rejectDelayed;
  const delayed = new Promise((_resolve, reject) => { rejectDelayed = reject; });
  delayed.catch(()=>{});
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
    const priorWork = host.work, priorTrace = host.traceWork;
    await priorWork;
    assert.equal(decisions.length, 1, 'instruction reacts before research ingestion resolves');
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
    assert.equal(decisions.length, 2);
    rejectDelayed(Error('old transport failure')); await priorTrace; await host.traceWork;
    assert.equal(statuses.at(-1), 'running');
    assert.equal(host.queuedBytes, 0);
    assert.equal(host.pendingBatches.size, 0);
  } finally { rejectDelayed(Error('test cleanup')); host.dispose(); delete global.window; }
});

function reactiveFixture() {
  const handlers=new Map(), sent=[], decisions=[], statuses=[];
  global.window={location:{origin:'https://host.example'},addEventListener:(k,v)=>handlers.set(k,v),removeEventListener:k=>handlers.delete(k)};
  const iframe={src:'about:blank',contentWindow:{postMessage:m=>sent.push(m)},addEventListener(){},removeEventListener(){}};
  const host=new SimulationResearchHost({iframe,scope,config:{buildId,bindings:[{name:'mass',address:{path:'screens.0.model.mass'},projection:'value'}]},status:s=>statuses.push(s),observation:async facts=>decisions.push(facts.mass)});
  return {host,sent,decisions,statuses,send(kind,data){handlers.get('message')({origin:'https://simulation.example',source:iframe.contentWindow,data:{protocol:'phet-research',version:2,buildId,sessionId:host.sessionId,kind,data}});}};
}
test('ordered reactive updates and receipt ACKs continue while research storage is blocked; failure stops new decisions',async()=>{
  const f=reactiveFixture();let rejectWrite;const blocked=new Promise((_resolve,reject)=>rejectWrite=reject);blocked.catch(()=>{});let writes=0;
  Meteor.callAsync=async(name,...args)=>name==='ingestSimulationResearchBatch'?(writes++,blocked):methods[name].call({userId:'learner'},...args);
  try {
    await f.host.initialize();await f.host.start();f.send('ready',{evidenceComplete:true,scope:'initialized-screen-models'});await f.host.work;
    f.send('batch',initial());await f.host.work;
    f.send('batch',initial()); // identical retry cannot duplicate a decision or write
    f.send('batch',batch(record(4,'property',{id:'p',args:[7]}),record(5,'checkpoint',{evidenceComplete:true})));
    await f.host.work;
    f.send('batch',batch(record(6,'property',{id:'p',args:[8]}),record(7,'checkpoint',{evidenceComplete:true})));
    await f.host.work;
    assert.deepEqual(f.decisions,[5,7,8]);assert.equal(writes,0,'research coalescing never blocks reactive updates');
    assert.equal(f.sent.at(-1).kind,'ack');assert.equal(f.sent.at(-1).data.sequence,7);
    assert.ok(f.host.queuedBytes>0,'accepted research remains bounded and retained until storage');
    rejectWrite(Error('synthetic storage outage'));await f.host.traceWork;
    assert.equal(f.statuses.at(-1),'stopped');
    f.send('batch',batch(record(8,'property',{id:'p',args:[9]}),record(9,'checkpoint',{evidenceComplete:true})));await f.host.work;
    assert.deepEqual(f.decisions,[5,7,8]);assert.equal(f.host.queuedBytes,0);
  } finally {rejectWrite(Error('cleanup'));f.host.dispose();await f.host.traceWork;delete global.window;}
});
test('normal departure drains accepted research before closing the attempt',async()=>{
  const f=reactiveFixture();let release;const blocked=new Promise(resolve=>release=resolve);const calls=[];
  Meteor.callAsync=async(name,...args)=>{calls.push(name);if(name==='ingestSimulationResearchBatch'){await blocked;}return methods[name].call({userId:'learner'},...args);};
  try {
    await f.host.initialize();await f.host.start();f.send('ready',{evidenceComplete:true,scope:'initialized-screen-models'});await f.host.work;
    f.send('batch',initial());await f.host.work;f.host.dispose();
    assert.equal(calls.includes('endSimulationResearchAttempt'),false);
    release();await f.host.traceWork;await new Promise(resolve=>setImmediate(resolve));
    const attempt=rows.get(f.host.sessionId);assert.equal(attempt.lastSequence,3);assert.equal(attempt.status,'interrupted');
  } finally {release();await f.host.traceWork;delete global.window;}
});

for (const fault of ['conflict','overflow']) test('reactive host stops on '+fault+' while storage is pending',async()=>{
  const f=reactiveFixture();let release;const blocked=new Promise(resolve=>release=resolve);
  Meteor.callAsync=async(name,...args)=>{if(name==='ingestSimulationResearchBatch')await blocked;return methods[name].call({userId:'learner'},...args);};
  try {
    await f.host.initialize();await f.host.start();f.send('ready',{evidenceComplete:true,scope:'initialized-screen-models'});await f.host.work;
    f.send('batch',initial());await f.host.work;
    if(fault==='conflict'){const changed=initial();changed.records[1].data.state.value=6;f.send('batch',changed);}
    else {f.host.queuedBytes=32*1024*1024;f.send('batch',batch(record(4,'checkpoint',{evidenceComplete:true})));}
    assert.equal(f.statuses.at(-1),'stopped');assert.deepEqual(f.decisions,[5]);
    release();await f.host.traceWork;await new Promise(resolve=>setImmediate(resolve));
    assert.equal(rows.get(f.host.sessionId).status,'incomplete');
  } finally {release();f.host.dispose();await f.host.traceWork;delete global.window;}
});

test('research coalesces contiguous receipts without changing evidence sequences or replaying duplicate decisions',async()=>{
  const f=reactiveFixture();let writes=0;
  Meteor.callAsync=async(name,...args)=>{if(name==='ingestSimulationResearchBatch')writes++;return methods[name].call({userId:'learner'},...args);};
  try {
    await f.host.initialize();await f.host.start();f.send('ready',{evidenceComplete:true,scope:'initialized-screen-models'});await f.host.work;
    f.send('batch',initial());await f.host.work;
    const next=batch(record(4,'property',{id:'p',args:[7]}),record(5,'checkpoint',{evidenceComplete:true}));
    f.send('batch',next);await f.host.work;
    assert.deepEqual(f.decisions,[5,7]);assert.equal(writes,0);
    await f.host.traceWork;
    assert.equal(writes,1);assert.equal(rows.get(f.host.sessionId+':1').batch.lastSequence,5);
    assert.equal(f.host.queuedBytes,0);
    f.send('batch',structuredClone(next));await f.host.work;await f.host.traceWork;
    assert.equal(writes,1);assert.deepEqual(f.decisions,[5,7]);
  } finally {f.host.dispose();await f.host.traceWork;delete global.window;}
});

test('continuous research arrivals receive a coalescing window between writes',async()=>{
  const f=reactiveFixture(),starts=[];
  Meteor.callAsync=async(name,...args)=>{
    if(name==='ingestSimulationResearchBatch'){
      starts.push(performance.now());
      if(starts.length===1){
        f.send('batch',batch(record(4,'property',{id:'p',args:[7]}),record(5,'checkpoint',{evidenceComplete:true})));
        await f.host.work;
      }
    }
    return methods[name].call({userId:'learner'},...args);
  };
  try {
    await f.host.initialize();await f.host.start();f.send('ready',{evidenceComplete:true,scope:'initialized-screen-models'});await f.host.work;
    f.send('batch',initial());await f.host.work;assert.deepEqual(f.decisions,[5]);
    await f.host.traceWork;
    assert.deepEqual(f.decisions,[5,7]);assert.equal(starts.length,2);
    assert.ok(starts[1]-starts[0]>=90,'sustained writes must coalesce instead of bursting above the server limit');
  } finally {f.host.dispose();await f.host.traceWork;delete global.window;}
});
