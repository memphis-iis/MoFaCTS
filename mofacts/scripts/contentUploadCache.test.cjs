// Isolated contracts with injected persistence/observers. Does not start Meteor or touch Mongo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('./registerHistoryTypescript.cjs');
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'meteor/meteor') return { Meteor: { Error: class extends Error {
    constructor(code, message) { super(message); this.error = code; }
  } } };
  return originalLoad.call(this, request, parent, main);
};
const { createBrowserSnapshotStore } = require('../client/lib/browserSnapshotStore.ts');
const { createContentUploadProjection } = require('../client/views/experimentSetup/contentUploadProjection.ts');
const { publicUploadMetadata, stimuliSetCandidates, stimuliSetCountKey } = require('../common/lib/contentUploadMetadata.ts');
const { publishContentUploadMetadata } = require('../server/lib/contentUploadMetadataPublication.ts');

const root = (id, extra = {}) => ({ _id: id, ownerId: 'owner', stimuliSetId: '42', content: { fileName: `${id}.json`,
  tdfs: { tutor: { setspec: { lessonname: id, condition: [], ...extra }, unit: [] } } } });
const record = (data, kind = 'tdf', isRoot = true) => ({
  _id: `${kind}:${data._id}`, userId: 'owner', kind, root: isRoot, data,
});

test('browser snapshots retain identity/version, handle malformed storage, and expose write failures', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, val) => values.set(key, val), removeItem: key => values.delete(key) };
  const store = createBrowserSnapshotStore(id => `v1.${id}`, (value, id) => value?.userId === id && value.version === 1, () => storage);
  store.write('a', { version: 1, userId: 'a', rows: [1] });
  assert.deepEqual(store.read('a').rows, [1]);
  assert.equal(store.read('b'), null);
  assert.throws(() => store.write('b', store.read('a')));
  values.set('v1.a', '{'); assert.throws(() => store.read('a'));
  values.set('v1.a', JSON.stringify({ userId: 'a', version: 0 })); assert.throws(() => store.read('a'));
  storage.setItem = () => { throw new Error('quota'); }; assert.throws(() => store.write('a', { userId: 'a', version: 1 }), /quota/);
  store.remove('a'); assert.equal(store.read('a'), null);
});

test('client projections handle all cached rows and recompute only affected roots', () => {
  const project = createContentUploadProjection();
  const records = Array.from({ length: 251 }, (_, i) => record(root(`lesson-${i.toString().padStart(3, '0')}`)));
  const first = project(records);
  assert.equal(first.ids.length, 251);
  const changed = [...records];
  changed[0] = record(root('lesson-000', { lessonname: 'zzz' }));
  const next = project(changed);
  assert.equal(next.ids.at(-1), 'lesson-000');
  assert.equal(first.summaries['lesson-001'], next.summaries['lesson-001']);
  assert.notEqual(first.summaries['lesson-000'], next.summaries['lesson-000']);
  assert.equal(project(changed.slice(1)).ids.includes('lesson-000'), false);
});

test('client computes condition eligibility, missing stimulus state and typed asset counts', () => {
  const project = createContentUploadProjection();
  const parent = root('parent', { condition: ['child.json'], conditionTdfIds: ['child'], stimulusfile: 'stim.json' });
  parent.conditionCounts = [3];
  const child = { _id: 'child', content: { tdfs: { tutor: { unit: [{ sparcsession: { pageId: 'p' } }] } } },
    rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'p', display: { unitType: 'sparc-autotutor-dialogue' } }] } } };
  const count = value => ({ _id: `count:${stimuliSetCountKey(value)}`, userId: 'owner', kind: 'count', data: { stimuliSetId: value, count: 2 } });
  let rows = [record(parent), record(child, 'tdf', false), count('42'), count(42)];
  const first = project(rows).summaries.parent;
  assert.equal(first.assetCount, 4); assert.equal(first.conditions[0].supportsSparcVideoCatalog, true);
  assert.equal(first.stimFiles[0].exists, false);
  rows = [...rows, record({ _id: 'stim', meta: { fileName: 'stim.json' } }, 'stim', false)];
  assert.equal(project(rows).summaries.parent.stimFiles[0].exists, true);
  assert.deepEqual(stimuliSetCandidates('42'), ['42', 42]);
});

test('wire projection removes key material and accessors', () => {
  const data = publicUploadMetadata({ ...root('a', { openRouterApiKey: 'synthetic-secret', speechAPIKey: 'synthetic-secret' }), accessors: [{ userId: 'private' }] });
  assert.equal(data.hasAPIKeys, true);
  assert.equal(JSON.stringify(data).includes('synthetic-secret'), false);
  assert.equal('accessors' in data, false);
});

function fakeCollection(initial = []) {
  const docs = new Map(initial.map(doc => [doc._id, doc]));
  const watchers = new Set();
  const path = (doc, key) => key.split('.').reduce((v, k) => Array.isArray(v) ? v.map(x => x?.[k]) : v?.[k], doc);
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(term => matches(doc, term));
    const actual = path(doc, key);
    if (value?.$in) return value.$in.includes(actual);
    return Array.isArray(actual) ? actual.includes(value) : actual === value;
  });
  function update(id, next) {
    const old = docs.get(id);
    if (next) docs.set(id, next); else docs.delete(id);
    for (const { query, callbacks } of watchers) {
      const before = old && matches(old, query), after = next && matches(next, query);
      if (before && !after) callbacks.removed(id);
      else if (!before && after) callbacks.added(id, next);
      else if (before && after) callbacks.changed(id, next);
    }
  }
  return { update, watchers, docs, find(query, options) {
    assert.ok(options.fields); assert.equal(options.batchSize, 200);
    for (const value of Object.values(query)) if (value?.$in) assert.ok(value.$in.length <= 200);
    return { async observeChangesAsync(callbacks) {
      const watcher = { query, callbacks }; watchers.add(watcher);
      for (const [id, doc] of docs) if (matches(doc, query)) callbacks.added(id, doc);
      return { stop() { watchers.delete(watcher); } };
    } };
  }, rawCollection() { return { aggregate(pipeline) { return { async toArray() {
    const keys = pipeline[0].$match['meta.stimuliSetId'].$in;
    assert.ok(keys.length <= 200);
    const counts = new Map();
    for (const doc of docs.values()) if (keys.includes(doc.meta?.stimuliSetId)) {
      const key = doc.meta.stimuliSetId; counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].map(([_id, count]) => ({ _id, count }));
  } }; } }; } };
}

test('publication synchronizes writes/deletion/revocation and stops every observer', async () => {
  const Tdfs = fakeCollection([root('a'), { ...root('hidden'), ownerId: 'other' }]);
  const Stims = fakeCollection(); const assets = fakeCollection([{ _id: 'asset', meta: { stimuliSetId: 42 } }]);
  const wire = new Map(); let ready = false, stop;
  const publication = { userId: 'owner', added(_c, id, value) { wire.set(id, value); }, changed(_c, id, value) { wire.set(id, value); },
    removed(_c, id) { wire.delete(id); }, ready() { ready = true; }, onStop(fn) { stop = fn; }, error(err) { throw err; } };
  await publishContentUploadMetadata(publication, { Tdfs, Stims, DynamicAssets: { collection: assets }, serverConsole() {} });
  assert.ok(ready); assert.ok(wire.has('tdf:a')); assert.equal(wire.has('tdf:hidden'), false);
  assert.equal(wire.get('count:number:42').data.count, 1);
  assets.update('asset2', { _id: 'asset2', meta: { stimuliSetId: 42 } });
  await new Promise(resolve => setTimeout(resolve, 65));
  assert.equal(wire.get('count:number:42').data.count, 2);
  Tdfs.update('b', root('b')); Tdfs.update('a', { ...root('a'), ownerId: 'other' });
  await new Promise(resolve => setTimeout(resolve, 65));
  assert.ok(wire.has('tdf:b')); assert.equal(wire.has('tdf:a'), false);
  Tdfs.update('b', null); await new Promise(resolve => setTimeout(resolve, 65));
  assert.equal(wire.size, 0);
  stop(); assert.equal(Tdfs.watchers.size + Stims.watchers.size + assets.watchers.size, 0);
  await assert.rejects(() => publishContentUploadMetadata({ ...publication, userId: null }, {}), /logged in/);
});

test('browser runtime paints saved data before readiness, reconciles live membership and cancels late work', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost:3200' });
  global.window = dom.window;
  const { contentUploadSnapshotStore } = require('../client/lib/contentUploadSnapshotStore.ts');
  const saved = { version: 1, userId: 'owner', generatedAt: 1, records: [record(root('saved'))] };
  contentUploadSnapshotStore.write('owner', saved);
  let userId = 'owner', ready = false, stopped = false, records = [], currentComputation;
  const tracker = { autorun(fn) {
    const computation = { stopped: false, stop() { this.stopped = true; }, invalidate() { if (!this.stopped) fn(); } };
    currentComputation = computation; fn(); return computation;
  }, nonreactive(fn) { return fn(); } };
  const meteor = { userId: () => userId, subscribe(name) {
    assert.equal(name, 'contentUploadMetadata');
    return { ready: () => ready, stop() { stopped = true; } };
  } };
  const original = Module._load;
  Module._load = function(request, parent, main) {
    if (request === 'meteor/meteor') return { Meteor: meteor };
    if (request === 'meteor/tracker') return { Tracker: tracker };
    if (request === 'meteor/mongo') return { Mongo: { Collection: class {
      find(query) { return { fetch: () => records.filter(doc => doc.userId === query.userId) }; }
    } } };
    return original.call(this, request, parent, main);
  };
  let start;
  try { start = require('../client/lib/contentUploadCache.ts').startContentUploadCache; }
  finally { Module._load = original; }
  const applied = [], errors = [];
  const cache = start({ apply: (snapshot, source) => applied.push({ snapshot, source }), error: err => errors.push(err) });
  assert.equal(applied.length, 1); assert.equal(applied[0].source, 'local');
  assert.equal(applied[0].snapshot.records[0].data._id, 'saved');
  records = [record(root('live'))]; ready = true; currentComputation.invalidate();
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(applied.at(-1).source, 'live');
  assert.equal(contentUploadSnapshotStore.read('owner').records[0].data._id, 'live');
  assert.equal(contentUploadSnapshotStore.read('owner').records.length, 1);
  records = []; currentComputation.invalidate(); cache.stop();
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(applied.at(-1).snapshot.records.length, 1); assert.ok(stopped);
  assert.deepEqual(errors.filter(Boolean), []);
  // Identity transition clears private snapshots and stops this lifetime.
  userId = 'owner'; ready = false;
  const second = start({ apply() {}, error: err => errors.push(err) });
  userId = 'other'; currentComputation.invalidate();
  assert.equal(contentUploadSnapshotStore.read('owner'), null);
  second.stop(); dom.window.close(); delete global.window;
});
