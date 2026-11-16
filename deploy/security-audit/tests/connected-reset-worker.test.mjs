import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { runConnectedResetWorkerV2 } from '../connected-reset-worker.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
async function run(mode) {
  const input = new PassThrough(), output = new PassThrough();
  let text = '', ready = false, launched = 0, transportClosed = 0, browserClosed = 0, cleanupAccepted = false;
  output.on('data', bytes => {
    text += bytes;
    const frame = JSON.parse(String(bytes));
    if (frame.operation === 'fixture-needed') {
      assert.equal(ready, true);
      if (mode === 'eof') { input.end(); return; }
      const response = { operation: 'fixture-needed', actor: { userId: 'owned',
        username: `operator+${namespace}-reset@gmail.com`, password: 'PRIVATE_SYNTHETIC_PASSWORD' },
      newPassword: 'PRIVATE_SYNTHETIC_NEW_PASSWORD', verification: { namespace,
        recipient: `operator+${namespace}-reset@gmail.com`, target: 'https://staging2.optimallearning.org',
        requestedAtMs: Date.now(), deadlineMs: Date.now() + 1000 } };
      if (mode === 'extra-field') response.extra = 'PRIVATE_EXTRA';
      queueMicrotask(() => input.write(JSON.stringify(response) + '\n'));
    } else if (frame.operation === 'cleanup-required') queueMicrotask(() => input.write(JSON.stringify({
      operation: 'cleanup-required', namespace: mode === 'wrong-namespace' ? 'mofacts_audit_fixture_aaaaaaaaaaaa' : namespace,
      verified: mode !== 'cleanup-denied' }) + '\n'));
  });
  let result, error;
  try {
    result = await runConnectedResetWorkerV2({ namespace, deadlineMs: Date.now() + 2000,
      socketPath: '/private/scanner.sock', leaseDirectory: '/private/lease', input, output }, {
      withHandoff: async options => {
        if (mode === 'lease-denied') throw new Error('PRIVATE_LEASE_DETAIL');
        ready = true;
        let value, failure;
        try { value = await options.run({ acquireMail: async () => { throw new Error('Unexpected mail'); },
          acquireVerificationMail: async binding => ({ metadata: { messageId: 'owned', recipients: [binding.recipient], receivedAtMs: binding.requestedAtMs },
            plainText: `${binding.target}/auth/verify-email?token=PRIVATE_NATIVE_TOKEN` }),
          beginResetWindow: async () => {} }); }
        catch (caught) { failure = caught; }
        cleanupAccepted = await options.verifyClean();
        if (!cleanupAccepted) throw new Error('Cleanup not verified');
        if (failure) throw failure;
        return value;
      },
      launch: async () => { launched++; return { async close() { browserClosed++; } }; },
      transportFactory: () => ({ transport: {}, async verifyEmail(token) {
        assert.equal(token, 'PRIVATE_NATIVE_TOKEN');
        return { state: 'owned-fixture-email-verified', nativeVerificationSucceeded: true, ownedIdentityMatched: true };
      }, async close() { transportClosed++; } }),
      capture: async options => {
        assert.equal(options.actor.password, 'PRIVATE_SYNTHETIC_PASSWORD');
        assert.equal(options.newPassword, 'PRIVATE_SYNTHETIC_NEW_PASSWORD');
        if (mode === 'capture-error') throw new Error('PRIVATE_CAPTURE_DETAIL');
        return { current: { status: 'PASS' }, session: { status: 'PASS' } };
      },
    });
  } catch (caught) { error = caught; }
  finally { input.destroy(); output.destroy(); }
  assert.equal(text.includes('PRIVATE'), false);
  return { result, error, text, launched, transportClosed, browserClosed, cleanupAccepted };
}

test('private worker waits for its owned readiness and cleans resources before accepting fixture cleanup', async () => {
  const value = await run('success');
  assert.equal(value.error, undefined); assert.equal(value.result.current.status, 'PASS');
  assert.equal(value.launched, 1); assert.equal(value.transportClosed, 1); assert.equal(value.browserClosed, 1);
  assert.equal(value.cleanupAccepted, true); assert.match(value.text, /"operation":"finished"/);
});

for (const mode of ['lease-denied', 'capture-error', 'extra-field', 'cleanup-denied', 'wrong-namespace', 'eof']) {
  test(`private worker ${mode} never prints credentials or claims finished`, async () => {
    const value = await run(mode);
    assert.equal(value.error.message, 'Connected reset qualification requires owned recovery');
    assert.equal(value.error.cause, undefined); assert.equal(value.text.includes('"operation":"finished"'), false);
    if (mode === 'lease-denied') { assert.equal(value.launched, 0); assert.equal(value.text, ''); }
    if (mode === 'capture-error') { assert.equal(value.transportClosed, 1); assert.equal(value.browserClosed, 1); assert.equal(value.cleanupAccepted, true); }
    if (['cleanup-denied', 'wrong-namespace', 'eof'].includes(mode)) assert.equal(value.cleanupAccepted, false);
  });
}
