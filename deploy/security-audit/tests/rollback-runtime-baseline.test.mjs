import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { openRollbackDdp, validateRollbackFixture, verifyRollbackReadback } from '../rollback-runtime-baseline.mjs';

function input() {
  const namespace = 'mofacts_audit_rollback_0123456789ab';
  return { fixture: { namespace, userId: namespace + '-admin', email: namespace + '@localhost.test', resumeToken: 'a'.repeat(43),
    v1: { schema: 'SecurityAuditReportV1', reportId: namespace + '-SecurityAuditReportV1', digestSha256: 'b'.repeat(64), target: 'https://rollback.invalid', completedAt: '2026-11-07T10:00:00.000Z' },
    v2: { schema: 'SecurityAuditReportV2', reportId: namespace + '-SecurityAuditReportV2', digestSha256: 'c'.repeat(64), target: 'https://rollback.invalid', completedAt: '2026-11-07T10:01:00.000Z' } },
  env: { MOFACTS_AUDIT_ROLLBACK_NAMESPACE: namespace, EXPECTED_MONGO_DB_NAME: namespace,
    ROOT_URL: 'http://app:3000', MONGO_URL: `mongodb://mongo:27017/${namespace}?replicaSet=rollback-rs` } };
}
test('rollback baseline refuses production/foreign databases, credentials, routes and fixture identity before opening Mongo', () => {
  const { fixture, env } = input(); assert.equal(validateRollbackFixture(fixture, env), fixture.namespace);
  for (const change of [
    value => { value.env.MOFACTS_AUDIT_ROLLBACK_NAMESPACE = 'production'; },
    value => { value.env.EXPECTED_MONGO_DB_NAME = 'production'; },
    value => { value.env.MONGO_URL = value.env.MONGO_URL.replace('mongo:', 'public.example:'); },
    value => {
      const uri = new URL(value.env.MONGO_URL);
      uri.username = 'synthetic-operator'; uri.password = 'synthetic-credential';
      value.env.MONGO_URL = uri.href;
    },
    value => { value.env.MONGO_URL += '&authSource=admin'; },
    value => { value.env.ROOT_URL = 'https://production.example'; },
    value => { value.fixture.userId = 'existing-user'; },
    value => { value.fixture.v2.target = 'https://production.example'; },
    value => { value.fixture.v2.reportId = 'existing-report'; },
  ]) { const value = input(); change(value); assert.throws(() => validateRollbackFixture(value.fixture, value.env)); }
});

class SyntheticSocket extends EventTarget {
  static instances = [];
  constructor(url) {
    super(); assert.equal(url, 'ws://127.0.0.1:3000/websocket'); this.sent = []; SyntheticSocket.instances.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  send(value) {
    const message = JSON.parse(value); this.sent.push(message);
    if (message.msg === 'connect') queueMicrotask(() => this.message({ msg: 'connected', session: 'synthetic' }));
  }
  close() { this.dispatchEvent(new Event('close')); }
}
test('rollback DDP correlates concurrent results and responds to server ping without credentials in diagnostics', async () => {
  const ddp = await openRollbackDdp(SyntheticSocket), socket = SyntheticSocket.instances.at(-1);
  try {
    const first = ddp.call('one', [1]), second = ddp.call('two', [2]);
    socket.message({ msg: 'ping', id: 'heartbeat' });
    socket.message({ msg: 'result', id: '2', result: 'second' });
    socket.message({ msg: 'result', id: '1', result: 'first' });
    assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
    assert.deepEqual(socket.sent.at(-1), { msg: 'pong', id: 'heartbeat' });
  } finally { ddp.close(); }
});
test('rollback DDP retains a denial category and suppresses raw server error details', async () => {
  const ddp = await openRollbackDdp(SyntheticSocket), socket = SyntheticSocket.instances.at(-1);
  try {
    const result = ddp.call('denied');
    socket.message({ msg: 'result', id: '1', error: { error: 'not-authorized', reason: 'synthetic-private-value' } });
    await assert.rejects(result, error => error.code === 'not-authorized' && !error.message.includes('synthetic-private-value'));
  } finally { ddp.close(); }
});
test('rollback DDP rejects pending work promptly after channel loss', async () => {
  const ddp = await openRollbackDdp(SyntheticSocket), result = ddp.call('pending');
  ddp.close(); await assert.rejects(result, /channel closed/);
});

function readback(phase, change = {}) {
  const { fixture } = input(), selected = phase === 'previous' ? fixture.v1 : fixture.v2;
  const rows = { security_audit_reports: structuredClone(fixture.v1), security_audit_reports_v2: structuredClone(fixture.v2) };
  const database = { collection(name) { return {
    async countDocuments() { return rows[name] ? 1 : 0; },
    async findOne() { return structuredClone(rows[name]); },
  }; } };
  const ddp = { async call(name, args = []) {
    if (name === 'admin.securityAudits.list') {
      if (change.mutate) rows.security_audit_reports.extra = true;
      return { reports: change.mixed ? [fixture.v1, fixture.v2] : [selected], latestFull: selected, latestExposure: null };
    }
    if (args[0] !== selected.reportId) { const error = new Error('Synthetic rejection'); error.code = change.wrongDenial ? 'timeout' : 'not-found'; throw error; }
    if (name === 'admin.securityAudits.get') return selected;
    assert.equal(name, 'admin.securityAudits.downloadToken');
    return { url: '/admin/security-audits/download/synthetic-token/' + args[1] };
  } };
  const request = async url => {
    const body = String(url).endsWith('/json') ? JSON.stringify(selected) : `<html>${selected.reportId} ${selected.digestSha256}</html>`;
    return new Response(body, { status: 200, headers: {
      'x-content-sha256': change.badDigest ? '0'.repeat(64) : createHash('sha256').update(body).digest('hex'),
    } });
  };
  return { fixture, phase, database, ddp, request };
}
test('candidate/previous/candidate readback preserves both records and restores identical candidate downloads', async () => {
  const results = [];
  for (const phase of ['candidate', 'previous', 'candidate-restored']) {
    const result = await verifyRollbackReadback(readback(phase)); results.push(result);
    assert.equal(result.phase, phase); assert.equal(result.v1Preserved, true); assert.equal(result.v2Preserved, true);
    assert.equal(result.schema, phase === 'previous' ? 'SecurityAuditReportV1' : 'SecurityAuditReportV2');
  }
  for (const key of ['schema', 'digestSha256', 'jsonSha256', 'htmlSha256']) assert.equal(results[0][key], results[2][key]);
});
test('rollback readback rejects mixed schemas, changed records, corrupt downloads and non-policy rejections', async () => {
  for (const change of [{ mixed: true }, { mutate: true }, { badDigest: true }, { wrongDenial: true }]) {
    await assert.rejects(verifyRollbackReadback(readback('candidate', change)));
  }
  await assert.rejects(verifyRollbackReadback(readback('unselected-generation')));
});
