// Runs inside the approved previous application image, against owned synthetic
// data only. It neither selects a release nor qualifies the future candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
let baselineStage = 'fixture-validation';
export function validateRollbackFixture(fixture, env) {
  const namespace = env.MOFACTS_AUDIT_ROLLBACK_NAMESPACE;
  assert.match(namespace ?? '', /^mofacts_audit_rollback_[a-f0-9]{12}$/);
  assert.equal(env.EXPECTED_MONGO_DB_NAME, namespace);
  assert.equal(env.ROOT_URL, 'http://app:3000');
  const mongo = new URL(env.MONGO_URL);
  assert.equal(mongo.protocol, 'mongodb:'); assert.equal(mongo.hostname, 'mongo');
  assert.equal(mongo.port, '27017'); assert.equal(mongo.pathname, '/' + namespace);
  assert.equal(mongo.username, ''); assert.equal(mongo.password, '');
  assert.equal(mongo.search, '?replicaSet=rollback-rs');
  assert.equal(fixture.namespace, namespace);
  assert.equal(fixture.userId, namespace + '-admin');
  assert.equal(fixture.email, namespace + '@localhost.test');
  assert.match(fixture.resumeToken, /^[A-Za-z0-9_-]{43}$/);
  for (const [report, schema] of [[fixture.v1, 'SecurityAuditReportV1'], [fixture.v2, 'SecurityAuditReportV2']]) {
    assert.equal(report.schema, schema); assert.match(report.digestSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.reportId, namespace + '-' + schema);
    assert.equal(report.target, 'https://rollback.invalid');
  }
  assert(fixture.v2.completedAt > fixture.v1.completedAt);
  return namespace;
}

export async function openRollbackDdp(Socket = WebSocket) {
  const socket = new Socket('ws://127.0.0.1:3000/websocket');
  const pending = new Map(); let sequence = 0, connected;
  const ready = new Promise((resolve, reject) => { connected = { resolve, reject }; });
  const timer = setTimeout(() => connected.reject(new Error('Disposable DDP connection timed out')), 15000);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
  socket.addEventListener('message', event => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.msg === 'connected') connected.resolve();
      if (message.msg === 'ping') socket.send(JSON.stringify({ msg: 'pong', ...(message.id ? { id: message.id } : {}) }));
      if (message.msg === 'result' && pending.has(message.id)) {
        const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
        if (message.error) { const error = new Error('Disposable DDP method rejected'); error.code = message.error.error; task.reject(error); }
        else task.resolve(message.result);
      }
    } catch { connected.reject(new Error('Malformed disposable DDP response')); }
  });
  const fail = () => {
    connected.reject(new Error('Disposable DDP channel closed'));
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Disposable DDP channel closed')); }
    pending.clear();
  };
  socket.addEventListener('error', fail); socket.addEventListener('close', fail);
  try { await ready; } catch (error) { socket.close(); throw error; } finally { clearTimeout(timer); }
  return {
    call(method, params = []) {
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Disposable DDP method timed out')); }, 15000);
        pending.set(id, { resolve, reject, timer: timeout });
        socket.send(JSON.stringify({ msg: 'method', id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

export async function runRollbackBaseline(fixture, env = process.env) {
  const namespace = validateRollbackFixture(fixture, env);
  baselineStage = 'database-connection';
  const require = createRequire('/opt/bundle/bundle/programs/server/npm/package.json');
  const { MongoClient } = require('meteor/npm-mongo/node_modules/mongodb');
  const client = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  let ddp;
  try {
    await client.connect(); const database = client.db(); assert.equal(database.databaseName, namespace);
    const reports = database.collection('security_audit_reports');
    const separate = database.collection('security_audit_reports_v2');
    assert.equal(await reports.countDocuments({}), 1);
    assert.equal(await separate.countDocuments({}), 0);
    assert.equal((await reports.findOne({ reportId: fixture.v1.reportId })).digestSha256, fixture.v1.digestSha256);
    baselineStage = 'ddp-connection';
    ddp = await openRollbackDdp();
    await assert.rejects(ddp.call('admin.securityAudits.list'), error => error.code === 'not-authorized');
    baselineStage = 'synthetic-login';
    await ddp.call('login', [{ resume: fixture.resumeToken }]);
    baselineStage = 'application-access';
    const root = await fetch('http://127.0.0.1:3000/', { signal: AbortSignal.timeout(10000) });
    assert.equal(root.status, 200); assert.match(await root.text(), /<html[\s>]/i);
    const health = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(10000) });
    assert.equal(health.status, 200);
    async function download(reportId, format) {
      const issued = await ddp.call('admin.securityAudits.downloadToken', [reportId, format]);
      assert.match(issued.url, /^\/admin\/security-audits\/download\/[A-Za-z0-9_-]+\//);
      const url = new URL(issued.url, 'http://127.0.0.1:3000'); assert.equal(url.origin, 'http://127.0.0.1:3000');
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const body = Buffer.from(await response.arrayBuffer()); assert(body.length < 2097152);
      if (response.status === 200) assert.equal(response.headers.get('x-content-sha256'), sha(body));
      return { status: response.status, body };
    }
    async function baseline() {
      const listed = await ddp.call('admin.securityAudits.list');
      assert.deepEqual(listed.reports.map(row => row.reportId), [fixture.v1.reportId]);
      assert.equal(listed.latestFull.reportId, fixture.v1.reportId); assert.equal(listed.latestExposure, null);
      const selected = await ddp.call('admin.securityAudits.get', [fixture.v1.reportId]);
      assert.equal(selected.digestSha256, fixture.v1.digestSha256);
      const json = await download(fixture.v1.reportId, 'json'), html = await download(fixture.v1.reportId, 'html');
      assert.equal(json.status, 200); assert.deepEqual(JSON.parse(json.body), fixture.v1);
      assert.equal(html.status, 200); assert(html.body.includes(Buffer.from(fixture.v1.reportId)));
      assert(html.body.includes(Buffer.from(fixture.v1.digestSha256)));
      return { jsonSha256: sha(json.body), htmlSha256: sha(html.body), digestSha256: selected.digestSha256 };
    }
    baselineStage = 'v1-read-download';
    const initial = await baseline();
    const now = new Date(), v2 = { ...fixture.v2, ingestNonce: namespace + '-v2-nonce', ingestedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 86400000) };
    baselineStage = 'mixed-v2-read';
    await reports.insertOne(structuredClone(v2));
    const mixed = await ddp.call('admin.securityAudits.list');
    const returnedAsCurrent = mixed.latestFull?.reportId === fixture.v2.reportId;
    const listedAsV1 = mixed.reports.some(row => row.reportId === fixture.v2.reportId);
    const mixedDownload = await download(fixture.v2.reportId, 'json');
    const servedUnsupportedSchema = mixedDownload.status === 200 && JSON.parse(mixedDownload.body).schema === 'SecurityAuditReportV2';
    // Remove only this owned synthetic insertion. Real retained data is never
    // migrated/deleted by this prequalification; the alternative is tested anew.
    assert.equal((await reports.deleteOne({ reportId: fixture.v2.reportId, ingestNonce: namespace + '-v2-nonce' })).deletedCount, 1);
    baselineStage = 'separate-v2-preservation';
    await separate.insertOne(structuredClone(v2));
    const isolated = await baseline(); assert.deepEqual(isolated, initial);
    await assert.rejects(ddp.call('admin.securityAudits.get', [fixture.v2.reportId]), error => error.code === 'not-found');
    assert.equal((await separate.findOne({ reportId: fixture.v2.reportId })).digestSha256, fixture.v2.digestSha256);
    const indexes = await reports.listIndexes().toArray();
    assert(indexes.some(index => index.expireAfterSeconds === 0 && index.key.expiresAt === 1));
    const oneCollectionUnsafe = returnedAsCurrent || listedAsV1 || servedUnsupportedSchema;
    return { state: 'previous-image-storage-prequalification', verifiedAt: new Date().toISOString(),
      baseline: initial, oneCollection: { returnedAsCurrent, listedAsV1, servedUnsupportedSchema, safe: !oneCollectionUnsafe },
      separateCollection: { v1BytesUnchanged: true, v2Excluded: true, v2DigestPreserved: true },
      proposedStorage: oneCollectionUnsafe ? 'version-separated' : 'schema-discriminated',
      limitations: ['Candidate application image not exercised', 'Candidate/previous/candidate qualification remains open'] };
  } finally { ddp?.close(); await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 3);
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(await runRollbackBaseline(fixture)) + '\n');
  } catch { process.stderr.write(JSON.stringify({ state: 'previous-image-baseline-failed', stage: baselineStage }) + '\n'); process.exitCode = 1; }
}
