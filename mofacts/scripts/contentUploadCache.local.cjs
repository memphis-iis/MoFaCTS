// Canonical localhost integration only. Creates and removes exclusively synthetic test records.
// Run after deploy/hotfix-local.ps1 starts: node scripts/contentUploadCache.local.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');
const WebSocket = require('ws');
function envFile(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
      const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
    }));
}
const deploy = path.resolve(__dirname, '../../deploy');
const env = envFile(path.join(deploy, '.env.local'));
const secrets = envFile(path.join(deploy, 'local-hotfix/agent-secrets.env'));
const mongoUrl = env.MOFACTS_NATIVE_MONGO_URL;
assert.ok(mongoUrl && ['localhost', '127.0.0.1'].includes(new URL(mongoUrl).hostname), 'Only canonical localhost Mongo is allowed');
assert.equal(new URL(mongoUrl).pathname, '/MoFACT-meteor3');
const prefix = `upload-cache-qa-${crypto.randomUUID()}`;
const fixtures = [prefix, `${prefix}-hidden`, `${prefix}-child`];
const setId = `${prefix}-set`;

async function until(predicate, label) {
  const end = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`${label} timed out`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function session() {
  const socket = new WebSocket('ws://localhost:3200/websocket');
  const docs = new Map(); const pending = new Map(); let connected = false, ready = false, failure;
  socket.on('open', () => socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
  socket.on('message', raw => {
    const msg = JSON.parse(String(raw));
    if (msg.msg === 'connected') connected = true;
    if (msg.msg === 'ping') socket.send(JSON.stringify({ msg: 'pong', id: msg.id }));
    if (msg.msg === 'result' && pending.has(msg.id)) {
      const resolve = pending.get(msg.id); pending.delete(msg.id); resolve(msg);
    }
    if (msg.msg === 'nosub' && msg.id === 'metadata') failure = new Error('Metadata subscription rejected');
    if (msg.msg === 'ready' && msg.subs.includes('metadata')) ready = true;
    if (msg.collection !== 'content_upload_metadata') return;
    if (msg.msg === 'removed') docs.delete(msg.id);
    else if (msg.msg === 'added') docs.set(msg.id, msg.fields);
    else if (msg.msg === 'changed') {
      const next = { ...docs.get(msg.id), ...msg.fields };
      for (const key of msg.cleared || []) delete next[key]; docs.set(msg.id, next);
    }
  });
  socket.on('error', () => { failure = new Error('Local DDP connection failed'); });
  await until(() => connected || failure, 'DDP connection'); if (failure) throw failure;
  const response = new Promise(resolve => pending.set('login', resolve));
  socket.send(JSON.stringify({ msg: 'method', id: 'login', method: 'login', params: [{
    user: { email: secrets.MOFACTS_AGENT_ADMIN_EMAIL },
    password: { digest: crypto.createHash('sha256').update(secrets.MOFACTS_AGENT_ADMIN_PASSWORD).digest('hex'), algorithm: 'sha-256' },
  }] }));
  const login = await response; assert.ok(!login.error, 'Existing local admin login must succeed');
  socket.send(JSON.stringify({ msg: 'sub', id: 'metadata', name: 'contentUploadMetadata', params: [] }));
  await until(() => ready || failure, 'metadata ready'); if (failure) throw failure;
  return { socket, docs, userId: login.result.id };
}

(async () => {
  const client = new MongoClient(mongoUrl); const sessions = [];
  let db;
  try {
    await client.connect(); db = client.db();
    const first = await session(); sessions.push(first);
    const second = await session(); sessions.push(second);
    const tdfIndexes = await db.collection('tdfs').indexes();
    assert.ok(tdfIndexes.some(index => index.name === 'perf_owner_lessonname_id'));
    assert.ok(tdfIndexes.some(index => index.name === 'perf_accessors_user_lessonname_id'));
    assert.ok((await db.collection('stim_files').indexes()).some(index => index.key['meta.fileName'] === 1));
    assert.ok((await db.collection('Assets').indexes()).some(index => index.key['meta.stimuliSetId'] === 1));
    const root = { _id: prefix, ownerId: first.userId, stimuliSetId: setId, conditionCounts: [0],
      content: { fileName: `${prefix}.json`, tdfs: { tutor: { setspec: { lessonname: 'Cache integration fixture',
        condition: [`${prefix}-child.json`], conditionTdfIds: [fixtures[2]], stimulusfile: `${prefix}.stim.json`,
        openRouterApiKey: 'synthetic-test-marker' }, unit: [] } } } };
    await db.collection('tdfs').insertMany([root, { ...root, _id: fixtures[1], ownerId: `${prefix}-other` },
      { _id: fixtures[2], content: { fileName: `${prefix}-child.json` } }]);
    const started = performance.now();
    await until(() => sessions.every(s => s.docs.has(`tdf:${prefix}`)), 'two-session insert');
    const insertionMs = performance.now() - started;
    assert.ok(sessions.every(s => !s.docs.has(`tdf:${fixtures[1]}`)), 'Unauthorized root must not be published');
    assert.ok(sessions.every(s => !JSON.stringify(s.docs.get(`tdf:${prefix}`)).includes('synthetic-test-marker')));
    const changeStart = performance.now();
    await db.collection('tdfs').updateOne({ _id: prefix }, { $set: { 'content.tdfs.tutor.setspec.lessonname': 'Changed fixture' } });
    await until(() => sessions.every(s => s.docs.get(`tdf:${prefix}`)?.data.content.tdfs.tutor.setspec.lessonname === 'Changed fixture'), 'two-session edit');
    const changeMs = performance.now() - changeStart;
    await db.collection('Assets').insertOne({ _id: prefix, meta: { stimuliSetId: setId } });
    await until(() => sessions.every(s => s.docs.get(`count:string:${setId}`)?.data.count === 1), 'asset insert');
    await db.collection('Assets').deleteOne({ _id: prefix });
    await until(() => sessions.every(s => s.docs.get(`count:string:${setId}`)?.data.count === 0), 'asset removal');
    await db.collection('stim_files').insertOne({ _id: prefix, meta: { fileName: `${prefix}.stim.json` } });
    await until(() => sessions.every(s => s.docs.has(`stim:${prefix}`)), 'stimulus insert');
    await db.collection('tdfs').updateOne({ _id: prefix }, { $set: { ownerId: `${prefix}-other` } });
    await until(() => sessions.every(s => !s.docs.has(`tdf:${prefix}`)
      && !s.docs.has(`tdf:${fixtures[2]}`) && !s.docs.has(`stim:${prefix}`)), 'access revocation and dependency removal');
    await db.collection('tdfs').updateOne({ _id: fixtures[1] }, { $set: { accessors: [{ userId: first.userId }] } });
    await until(() => sessions.every(s => s.docs.has(`tdf:${fixtures[1]}`)), 'shared access grant');
    second.socket.close(); sessions.pop();
    const reconnected = await session(); sessions.push(reconnected);
    assert.ok(reconnected.docs.has(`tdf:${fixtures[1]}`));
    assert.equal(reconnected.docs.has(`tdf:${prefix}`), false);
    await db.collection('tdfs').deleteOne({ _id: fixtures[1] });
    await until(() => sessions.every(s => !s.docs.has(`tdf:${fixtures[1]}`)), 'two-session deletion');
    console.log(JSON.stringify({ passed: true, sessions: 2, insertionMs: Math.round(insertionMs), changeMs: Math.round(changeMs),
      checks: ['live insert/edit/delete', 'authorization', 'credential exclusion', 'asset counts', 'stimulus identity',
        'revocation', 'dependency removal', 'shared access grant', 'reconnect', 'supporting indexes'] }));
  } finally {
    for (const { socket } of sessions) socket.close();
    if (db) {
      await db.collection('tdfs').deleteMany({ _id: { $in: fixtures } });
      await db.collection('Assets').deleteOne({ _id: prefix });
      await db.collection('stim_files').deleteOne({ _id: prefix });
    }
    await client.close();
  }
})().catch(() => { console.error('Local upload-cache integration failed; synthetic cleanup attempted.'); process.exitCode = 1; });
