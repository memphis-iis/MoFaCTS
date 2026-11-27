import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCurrentResetV2 as capture, captureFreshResetBaselineV2, evaluateCurrentResetSessionsV2 as evaluate } from '../authentication/currentResetV2.mjs';
import { acquireConnectedGmailResetMessageV2 as acquire } from '../authentication/connectedGmailV2.mjs';

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

test('fresh reset baseline makes one password change and uses only the new password afterward', async () => {
  const { value, calls } = fixture();
  const result = await captureFreshResetBaselineV2(value);
  assert.equal(result.freshResetBaseline.status, 'PASS');
  assert.equal(result.freshResetBaseline.results.length, 2);
  assert.deepEqual(calls, ['baseline', 'request', 'mail', 'reset', 'new-login']);
  assert.equal(Object.hasOwn(result, 'session'), false);
  const serialized = JSON.stringify(result);
  for (const secret of [value.actor.username, value.actor.password, value.newPassword, 'a'.repeat(64)]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('connector acquisition composes with the current-reset protocol without changing its mail contract', async () => {
  const { value } = fixture();
  let resetCalls = 0;
  const reset = value.transport.reset;
  value.transport.reset = async (recipient, token, password) => {
    assert.equal(recipient, value.actor.username); assert.equal(token, 'a'.repeat(64));
    assert.equal(password, value.newPassword); resetCalls++;
    return reset();
  };
  value.acquireMail = async binding => {
    const content = `${binding.target}/auth/reset-password?email=${encodeURIComponent(binding.recipient)}&token=${'a'.repeat(64)}`;
    const message = { id: '1abc', payload: { mime_type: 'text/plain', filename: null, parts: null,
      headers: [{ name: 'To', value: binding.recipient }, { name: 'Delivered-To', value: binding.recipient },
        { name: 'X-Received', value: `by 2002:a17:903:1 with SMTP id synthetic.${binding.requestedAtMs}; Synthetic` }],
      body: { content, size: Buffer.byteLength(content), attachment_id: null } } };
    return acquire({ binding, listMessages: async () => [message], readMessage: async () => message });
  };
  const result = await capture(value);
  assert.equal(result.current.status, 'PASS'); assert.equal(result.session.status, 'PASS');
  assert.equal(resetCalls, 2); assert.equal(JSON.stringify(result).includes('a'.repeat(64)), false);
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
