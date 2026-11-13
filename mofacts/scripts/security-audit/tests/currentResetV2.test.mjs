import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCurrentResetV2 as capture, evaluateCurrentResetSessionsV2 as evaluate } from '../authentication/currentResetV2.mjs';

function fixture() {
  const namespace = 'mofacts_audit_fixture_0123456789ab';
  const target = 'https://staging2.optimallearning.org';
  const actor = { userId: 'owned', username: `imrryr+${namespace}-reset@gmail.com`, password: 'Synthetic-old-password-1234567890123456!' };
  const calls = [], allowed = () => ({ state: 'returned', allowedObservationMatched: true });
  const value = { namespace, target, actor, newPassword: 'Synthetic-new-password-1234567890123456!',
    transport: {
      async baseline() { calls.push('baseline'); return { observation: allowed(), independentSessionCount: 2, distinctCapabilitiesVerified: true, lifetime: { baselineOutcome: 'ALLOWED',
        freshSessionVerified: true, issuedAtMs: 1000, expiresAtMs: 1000 + 86400000 } }; },
      async request() { calls.push('request'); return allowed(); },
      async reset() { calls.push('reset'); return calls.filter(call => call === 'reset').length === 1 ? allowed() : { state: 'rejected', code: 'invalid-token' }; },
      async newPasswordLogin() { calls.push('new-login'); return allowed(); },
      async oldPasswordLogin() { calls.push('old-login'); return { state: 'rejected', code: '403' }; },
      async revokedSessions() { calls.push('sessions'); return [0, 1].map(() => ({ method: { state: 'rejected', code: '401' },
        resume: { state: 'rejected', code: '403', reason: "You've been logged out by the server. Please log in again." } })); },
    },
    async acquireMail(binding) { calls.push('mail'); return { metadata: { messageId: 'synthetic', recipients: [actor.username], receivedAtMs: binding.requestedAtMs },
      plainText: `${target}/auth/reset-password?email=${encodeURIComponent(actor.username)}&token=${'a'.repeat(64)}` }; },
  };
  return { value, calls };
}

test('connected-mail scenario shares current reset cases and retains only bounded outcome evidence', async () => {
  const { value, calls } = fixture(), result = await capture(value);
  assert.equal(result.current.status, 'PASS'); assert.equal(result.session.status, 'PASS'); assert.equal(result.lifetime.status, 'PASS');
  assert.deepEqual(calls, ['baseline', 'request', 'mail', 'reset', 'new-login', 'old-login', 'sessions', 'reset']);
  const serialized = JSON.stringify(result);
  for (const secret of [value.actor.username, value.actor.password, value.newPassword, 'a'.repeat(64)]) assert.ok(!serialized.includes(secret));
});
test('foreign accounts and origins fail before password or mail callbacks', async () => {
  for (const patch of [{ target: 'https://optimallearning.org' }, { actor: { ...fixture().value.actor, username: 'existing@gmail.com' } }]) {
    const { value, calls } = fixture(); await assert.rejects(capture({ ...value, ...patch })); assert.equal(calls.length, 0);
  }
});
test('failed positive baseline or reset request prevents mail acquisition and mutation', async () => {
  for (const stage of ['baseline', 'request']) {
    const { value, calls } = fixture();
    if (stage === 'baseline') value.transport.baseline = async () => ({ observation: { state: 'transport-error' }, lifetime: { baselineOutcome: 'INCONCLUSIVE', freshSessionVerified: false, issuedAtMs: 0, expiresAtMs: 0 } });
    else value.transport.request = async () => ({ state: 'rejected', code: '500' });
    await assert.rejects(capture(value)); assert.ok(!calls.includes('mail')); assert.ok(!calls.includes('reset'));
  }
});
test('foreign/stale mail cannot reach a reset mutation', async () => {
  const { value, calls } = fixture(); value.acquireMail = async () => ({ metadata: { messageId: 'bad', recipients: ['other@gmail.com'], receivedAtMs: 0 }, plainText: 'bad' });
  await assert.rejects(capture(value)); assert.ok(!calls.includes('reset'));
});
test('failed current reset leaves replay and session qualification ERROR without additional attempts', async () => {
  const { value, calls } = fixture(); value.transport.reset = async () => ({ state: 'rejected', code: 'invalid-token' });
  const result = await capture(value); assert.equal(result.current.status, 'ERROR'); assert.equal(result.session.status, 'ERROR');
  assert.ok(!calls.includes('new-login'));
});
test('revocation preserves explicit violations and never treats transport/domain failures as denial', () => {
  const baseline = { newLogin: 'ALLOWED', oldLogin: 'DENIED_BY_POLICY', sessions: [0, 1].map(() => ({ method: 'DENIED_BY_POLICY', resume: 'DENIED_BY_POLICY' })) };
  assert.equal(evaluate(baseline).status, 'PASS');
  for (const path of ['oldLogin', '0.method', '0.resume', '1.method', '1.resume']) {
    for (const outcome of ['ALLOWED', 'DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE']) {
      const value = structuredClone(baseline);
      if (path === 'oldLogin') value.oldLogin = outcome;
      else { const [index, key] = path.split('.'); value.sessions[index][key] = outcome; }
      assert.equal(evaluate(value).status, outcome === 'ALLOWED' ? 'FAIL' : 'ERROR');
    }
  }
  assert.equal(evaluate({ ...baseline, newLogin: 'DENIED_BY_POLICY' }).status, 'ERROR');
  assert.throws(() => evaluate({ ...baseline, token: 'PRIVATE' }));
});
test('one session or a cloned capability cannot satisfy the two-independent-session precondition', async () => {
  for (const patch of [{ independentSessionCount: 1 }, { distinctCapabilitiesVerified: false }]) {
    const { value, calls } = fixture(), baseline = value.transport.baseline;
    value.transport.baseline = async () => ({ ...await baseline(), ...patch });
    await assert.rejects(capture(value)); assert.deepEqual(calls, ['baseline']);
  }
});
