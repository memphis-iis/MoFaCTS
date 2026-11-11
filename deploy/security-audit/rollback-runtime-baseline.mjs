// Runs inside each selected application image, against owned synthetic data.
// Image selection and cleanup belong to the staging2 controller.
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

export async function verifyRollbackReadback({ fixture, phase, database, ddp, request = fetch }) {
  assert(['candidate', 'previous', 'candidate-restored'].includes(phase));
  const selected = phase === 'previous' ? fixture.v1 : fixture.v2;
  const excluded = phase === 'previous' ? fixture.v2 : fixture.v1;
  const collections = [database.collection('security_audit_reports'), database.collection('security_audit_reports_v2')];
  const before = [];
  for (const [index, report] of [fixture.v1, fixture.v2].entries()) {
    assert.equal(await collections[index].countDocuments({}), 1);
    const stored = await collections[index].findOne({ reportId: report.reportId });
    assert.equal(stored?.digestSha256, report.digestSha256); before.push(stored);
  }
  const listed = await ddp.call('admin.securityAudits.list');
  assert.deepEqual(listed.reports.map(row => row.reportId), [selected.reportId]);
  assert.equal(listed.latestFull.reportId, selected.reportId); assert.equal(listed.latestExposure, null);
  const summary = await ddp.call('admin.securityAudits.get', [selected.reportId]);
  assert.equal(summary.digestSha256, selected.digestSha256);
  if (phase !== 'previous') assert.equal(summary.schema, 'SecurityAuditReportV2');
  const downloads = {};
  for (const format of ['json', 'html']) {
    const issued = await ddp.call('admin.securityAudits.downloadToken', [selected.reportId, format]);
    assert.match(issued.url, /^\/admin\/security-audits\/download\/[A-Za-z0-9_-]+\//);
    const url = new URL(issued.url, 'http://127.0.0.1:3000');
    assert.equal(url.origin, 'http://127.0.0.1:3000');
    const response = await request(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    const body = Buffer.from(await response.arrayBuffer()); assert(body.length < 2097152);
    assert.equal(response.headers.get('x-content-sha256'), sha(body));
    if (format === 'json') assert.deepEqual(JSON.parse(body), selected);
    else { assert(body.includes(Buffer.from(selected.reportId))); assert(body.includes(Buffer.from(selected.digestSha256))); }
    downloads[`${format}Sha256`] = sha(body);
  }
  for (const name of ['admin.securityAudits.get', 'admin.securityAudits.downloadToken']) {
    await assert.rejects(ddp.call(name, [excluded.reportId, 'json']), error => error.code === 'not-found');
  }
  for (const [index, report] of [fixture.v1, fixture.v2].entries()) {
    assert.equal(await collections[index].countDocuments({}), 1);
    assert.deepEqual(await collections[index].findOne({ reportId: report.reportId }), before[index]);
  }
  return { state: 'rollback-generation-verified', phase, schema: selected.schema,
    digestSha256: selected.digestSha256, ...downloads, v1Preserved: true, v2Preserved: true, otherGenerationExcluded: true };
}

export async function runRollbackBaseline(fixture, phase, env = process.env) {
  const namespace = validateRollbackFixture(fixture, env);
  assert(['candidate', 'previous', 'candidate-restored'].includes(phase));
  baselineStage = 'database-connection';
  const require = createRequire('/opt/bundle/bundle/programs/server/npm/package.json');
  const { MongoClient } = require('meteor/npm-mongo/node_modules/mongodb');
  const client = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  let ddp;
  try {
    await client.connect(); const database = client.db(); assert.equal(database.databaseName, namespace);
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
    baselineStage = 'generation-readback';
    return await verifyRollbackReadback({ fixture, phase, database, ddp });
  } finally { ddp?.close(); await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 4);
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(await runRollbackBaseline(fixture, process.argv[3])) + '\n');
  } catch { process.stderr.write(JSON.stringify({ state: 'rollback-readback-failed', stage: baselineStage }) + '\n'); process.exitCode = 1; }
}
