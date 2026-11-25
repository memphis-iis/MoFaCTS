import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionResumeOutcomeV2 as resume, evaluateLogoutRevocationV2 as evaluate,
  captureLogoutRevocationV2 as capture } from '../authentication/sessionBrowserV2.mjs';
const fixture = () => ({ originalBaselineMatched: true, cloneBaselineMatched: true, sameCapabilityCloned: true,
  logoutCompleted: true, passwordReloginMatched: true, revokedMethodOutcome: 'DENIED_BY_POLICY', revokedResumeOutcome: 'DENIED_BY_POLICY' });
test('resume denial requires the native code and reviewed reason, never a matching arbitrary exception', () => {
  assert.equal(resume({ state: 'rejected', code: '403', reason: "You've been logged out by the server. Please log in again." }), 'DENIED_BY_POLICY');
  for (const value of [{ state: 'rejected', code: '403', reason: 'Login forbidden' },
    { state: 'rejected', code: '500', reason: 'Your session has expired. Please log in again.' }]) assert.equal(resume(value), 'DOMAIN_REJECTION');
  assert.equal(resume({ state: 'returned', boundIdentityMatched: false }), 'INCONCLUSIVE');
  assert.equal(resume({ state: 'transport-error' }), 'TRANSPORT_OR_RUNNER_ERROR');
  assert.throws(() => resume({ state: 'rejected', code: '403', reason: 'bad', token: 'PRIVATE' }));
});
test('logout qualification requires two actual positive sessions, exact cloned capability and a fresh password relogin', () => {
  assert.equal(evaluate(fixture()).status, 'PASS');
  for (const key of ['originalBaselineMatched', 'cloneBaselineMatched', 'sameCapabilityCloned', 'logoutCompleted', 'passwordReloginMatched']) {
    assert.equal(evaluate({ ...fixture(), [key]: false }).status, 'ERROR');
  }
  for (const key of ['revokedMethodOutcome', 'revokedResumeOutcome']) {
    assert.equal(evaluate({ ...fixture(), [key]: 'ALLOWED' }).status, 'FAIL');
    for (const category of ['DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE']) {
      assert.equal(evaluate({ ...fixture(), [key]: category }).status, 'ERROR');
    }
  }
  assert.throws(() => evaluate({ ...fixture(), token: 'PRIVATE' }));
});

test('session acquisition closes a context even when initialization fails before the shared opener returns it', async () => {
  let closed = 0;
  const page = { setDefaultTimeout() {}, async goto() { throw new Error('Injected transport failure'); }, async evaluate() { return null; } };
  const browser = { async newContext() { return { async newPage() { return page; }, pages() { return [page]; }, async close() { closed++; } }; } };
  await assert.rejects(capture({ browser, target: 'https://staging2.optimallearning.org',
    binding: { userId: 'synthetic', username: 'synthetic@example.test', password: 'Synthetic-password-123!' } }), /Injected transport failure/);
  assert.equal(closed, 1);
});

test('a foreign origin fails before session creation, and cleanup failure is never a passing acquisition', async () => {
  let created = 0;
  const binding = { userId: 'synthetic', username: 'synthetic@example.test', password: 'Synthetic-password-123!' };
  const page = { setDefaultTimeout() {}, async goto() { throw new Error('Injected transport failure'); }, async evaluate() { return null; } };
  const browser = { async newContext() { created++; return { async newPage() { return page; }, pages() { return [page]; }, async close() { throw new Error('Injected cleanup failure'); } }; } };
  await assert.rejects(capture({ browser, target: 'https://optimallearning.org', binding })); assert.equal(created, 0);
  await assert.rejects(capture({ browser, target: 'https://staging2.optimallearning.org', binding }), /cleanup is unverified/);
});
