import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { createCurrentResetBrowserTransportV2 } from '../authentication/currentResetBrowserV2.mjs';
import { captureCurrentResetV2 } from '../authentication/currentResetV2.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab', target = 'https://staging2.optimallearning.org';
const actor = { userId: 'owned-reset', username: `operator+${namespace}-reset@gmail.com`, password: 'old-private-synthetic-password-123456789!' };
const newPassword = 'new-private-synthetic-password-123456789!';
function fixture(mode = 'success') {
  const contexts = [], calls = [], tokens = new Map();
  let password = actor.password, serial = 0, used = false;
  const browser = { async newContext() {
    const state = { userId: null, token: null, closed: false };
    const meteor = { status: () => ({ connected: true }), userId: () => state.userId,
      user: () => ({ username: actor.username, emails: [{ address: actor.username, verified: mode !== 'unverified-email' }] }),
      loginWithPassword(username, candidate, done) {
        calls.push('login');
        if (username !== actor.username || candidate !== password) { done({ error: '403' }); return; }
        state.userId = actor.userId;
        state.token = mode === 'cloned-capability' ? 'synthetic-shared-capability' : `synthetic-independent-capability-${++serial}`;
        tokens.set(state.token, true); done();
      },
      loginWithToken(token, done) {
        calls.push('resume');
        if (tokens.get(token)) { state.userId = actor.userId; state.token = token; done(); }
        else done({ error: '403', reason: "You've been logged out by the server. Please log in again." });
      },
      logout(done) { calls.push('logout'); if (mode === 'cleanup-error') { done({ error: 'unavailable' }); return; }
        tokens.set(state.token, false); state.userId = null; done(); },
      async callAsync(name, ...args) {
        calls.push(name);
        if (name === 'getOwnOpenRouterSettings') {
          if (!state.userId || !tokens.get(state.token)) throw { error: '401' };
          return { model: 'synthetic', reasoningLevel: 'synthetic', hasOpenRouterKey: false };
        }
        if (name === 'requestPasswordReset') return { success: true };
        if (name === 'resetPasswordWithToken') {
          if (used) throw { error: 'invalid-token' };
          assert.equal(args[0], actor.username); assert.equal(args[1], 'a'.repeat(64));
          used = true; password = args[2];
          if (mode !== 'revocation-violation') {
            for (const key of tokens.keys()) tokens.set(key, false);
            contexts.forEach(context => { context.state.userId = null; });
          }
          return { success: true };
        }
        throw new Error('PRIVATE_UNEXPECTED_CALL');
      },
    };
    const globals = { location: { origin: target }, setTimeout, clearTimeout,
      sessionStorage: { getItem: name => ({ 'Meteor.loginToken': state.token,
        'Meteor.loginTokenExpires': new Date(Date.now() + 86400000).toISOString() })[name] },
      Accounts: { verifyEmail(token, done) {
        assert.equal(token, 'opaque_NATIVE-token'); calls.push('verifyEmail');
        state.userId = mode === 'wrong-verification-owner' ? 'foreign-user' : actor.userId;
        done(mode === 'verification-rejected' ? { error: '403' } : undefined);
      } },
      Meteor: meteor, Session: { get: name => ({ authReady: true, authRolesHydrated: true,
        authRolesSyncedUserId: state.userId, authRoles: { admin: false, teacher: false } })[name] } };
    const evaluate = (fn, argument) => {
      if (mode === 'transport-error' && argument?.name === 'requestPasswordReset') return Promise.reject(new Error('PRIVATE_TRANSPORT_DETAIL'));
      return Promise.resolve(vm.runInNewContext(`(${fn.toString()})(argument)`, { ...globals, argument }));
    };
    const page = { url: () => target, setDefaultTimeout() {}, async goto() {}, evaluate,
      async waitForFunction(fn, argument) { if (!await evaluate(fn, argument)) throw new Error('Synthetic readiness failed'); } };
    const context = { state, async newPage() { return page; }, pages: () => state.closed ? [] : [page],
      async close() { state.closed = true; } };
    contexts.push(context); return context;
  } };
  const owner = createCurrentResetBrowserTransportV2({ browser, target, actor });
  return { ...owner, contexts, calls, async capture() {
    return captureCurrentResetV2({ namespace, target, actor, newPassword, transport: owner.transport,
      acquireMail: async binding => ({ metadata: { messageId: 'synthetic', recipients: [actor.username], receivedAtMs: binding.requestedAtMs },
        plainText: `${target}/auth/reset-password?email=${encodeURIComponent(actor.username)}&token=${'a'.repeat(64)}` }) });
  } };
}

test('normal verification uses native Accounts, checks the owned verified address and logs out before reset baseline', async () => {
  const f = fixture();
  try {
    const result = await f.verifyEmail('opaque_NATIVE-token');
    assert.equal(result.nativeVerificationSucceeded, true);
    assert.equal(f.contexts[0].state.userId, null);
    assert.deepEqual(f.calls, ['verifyEmail', 'logout']);
    await assert.rejects(f.verifyEmail('opaque_NATIVE-token'));
    assert.equal((await f.capture()).current.status, 'PASS');
  } finally { await f.close(); }
});

for (const mode of ['wrong-verification-owner', 'unverified-email', 'verification-rejected']) {
  test(`native verification ${mode} cannot satisfy the reset prerequisite`, async () => {
    const f = fixture(mode);
    try { await assert.rejects(f.verifyEmail('opaque_NATIVE-token')); }
    finally { await f.close(); }
    assert.equal(f.calls.includes('requestPasswordReset'), false);
  });
}

test('maintained browser transport composes current reset with two independent sessions and sanitized results', async () => {
  const f = fixture();
  try {
    const result = await f.capture();
    assert.equal(result.current.status, 'PASS'); assert.equal(result.session.status, 'PASS');
    assert.equal(f.calls.filter(name => name === 'resume').length, 2);
    for (const secret of [actor.username, actor.password, newPassword, 'a'.repeat(64)]) assert.equal(JSON.stringify(result).includes(secret), false);
  } finally { await f.close(); }
  assert.ok(f.contexts.every(context => context.state.closed)); await f.close();
});

test('cloned capabilities cannot start a reset request', async () => {
  const f = fixture('cloned-capability');
  try { await assert.rejects(f.capture()); assert.equal(f.calls.includes('requestPasswordReset'), false); }
  finally { await f.close(); }
});

test('actual access after reset is preserved as a session FAIL', async () => {
  const f = fixture('revocation-violation');
  try { assert.equal((await f.capture()).session.status, 'FAIL'); }
  finally { await f.close(); }
});

test('transport failure cannot become a denial or reach password mutation', async () => {
  const f = fixture('transport-error');
  try {
    await assert.rejects(f.capture(), error => { assert.equal(String(error).includes('PRIVATE_TRANSPORT_DETAIL'), false); return true; });
    assert.equal(f.calls.includes('resetPasswordWithToken'), false);
  } finally { await f.close(); }
});

test('failed browser cleanup stays unverified on repeated close attempts', async () => {
  const f = fixture('cleanup-error'); await f.transport.baseline(actor);
  await assert.rejects(f.close(), /cleanup is unverified/);
  await assert.rejects(f.close(), /cleanup is unverified/);
});

test('foreign target and non-owned reset names fail before allocating browser contexts', () => {
  const browser = { newContext() { assert.fail('Unexpected context'); } };
  assert.throws(() => createCurrentResetBrowserTransportV2({ browser, target: 'https://optimallearning.org', actor }));
  assert.throws(() => createCurrentResetBrowserTransportV2({ browser, target, actor: { ...actor, username: 'existing@gmail.com' } }));
});
