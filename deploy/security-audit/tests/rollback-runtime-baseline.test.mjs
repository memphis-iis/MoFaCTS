import assert from 'node:assert/strict';
import test from 'node:test';
import { openRollbackDdp, validateRollbackFixture } from '../rollback-runtime-baseline.mjs';

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
