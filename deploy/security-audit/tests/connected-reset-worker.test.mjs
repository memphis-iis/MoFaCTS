import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { runConnectedResetWorkerV2 } from '../connected-reset-worker.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
async function run(mode) {
  const integrated = mode === 'integrated';
  const protocol = integrated || mode.startsWith('protocol-');
  const comparison = mode === 'comparison';
  const input = new PassThrough(), output = new PassThrough();
  let text = '', ready = false, launched = 0, transportClosed = 0, browserClosed = 0, cleanupAccepted = false;
  const sequence = [];
  output.on('data', bytes => {
    text += bytes;
    const frame = JSON.parse(String(bytes));
    if (['fixture-needed', 'expiry-fixture-needed'].includes(frame.operation)) {
      assert.equal(ready, true);
      if (mode === 'eof') { input.end(); return; }
      const alias = frame.operation === 'expiry-fixture-needed' ? 'expiry' : 'reset';
      const response = { operation: frame.operation, actor: { userId: alias === 'expiry' && mode !== 'protocol-wrong-actor' ? 'owned-expiry' : 'owned',
        username: `operator+${namespace}-${alias}@gmail.com`, password: 'PRIVATE_SYNTHETIC_PASSWORD' },
      newPassword: 'PRIVATE_SYNTHETIC_NEW_PASSWORD', verification: { namespace,
        recipient: `operator+${namespace}-${alias}@gmail.com`, target: 'https://staging2.optimallearning.org',
        requestedAtMs: Date.now(), deadlineMs: Date.now() + 1000 } };
      if (mode === 'extra-field') response.extra = 'PRIVATE_EXTRA';
      queueMicrotask(() => input.write(JSON.stringify(response) + '\n'));
    } else if (['current-age-needed', 'expiry-age-needed'].includes(frame.operation)) queueMicrotask(() => input.write(JSON.stringify({
      operation:frame.operation,metadata:{owned:true,unused:true,ageMs:0,lifetimeMs:3600000,remainingMs:3600000} })+'\n'));
    else if (frame.operation === 'comparison-ownership-needed') queueMicrotask(() => input.write(JSON.stringify({
      operation: frame.operation, verified: true }) + '\n'));
    else if (frame.operation === 'cleanup-required') queueMicrotask(() => input.write(JSON.stringify({
      operation: 'cleanup-required', namespace: mode === 'wrong-namespace' ? 'mofacts_audit_fixture_aaaaaaaaaaaa' : namespace,
      verified: mode !== 'cleanup-denied' }) + '\n'));
  });
  let result, error;
  try {
    result = await runConnectedResetWorkerV2({ namespace, deadlineMs: Date.now() + (protocol ? 6000000 : 2000),
      scope: integrated ? 'integrated' : protocol ? 'protocol' : comparison ? 'comparison' : 'current',
      socketPath: '/private/scanner.sock', leaseDirectory: '/private/lease', input, output }, {
      withHandoff: async options => {
        if (mode === 'lease-denied') throw new Error('PRIVATE_LEASE_DETAIL');
        ready = true;
        let value, failure;
        try { value = await options.run({ acquireMail: async () => { if (!protocol) throw new Error('Unexpected mail'); return {plainText:'PRIVATE'}; },
          acquireVerificationMail: async binding => ({ metadata: { messageId: 'owned', recipients: [binding.recipient], receivedAtMs: binding.requestedAtMs },
            plainText: `${binding.target}/auth/verify-email?token=PRIVATE_NATIVE_TOKEN` }),
          beginResetWindow: async () => { assert.equal(comparison, false); }, beginExpiryWindow:async()=>{}, confirmMailLease:async()=>{} }); }
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
      captureComparisons: async options => {
        assert.equal(await options.requireOwnership(), true);
        assert.equal(options.actor.userId, integrated ? 'owned-expiry' : 'owned');
        await options.confirmLease();
        sequence.push('comparison');
        return { proofs: [{ status: 'PASS' }, { status: 'PASS' }] };
      },
      captureLogout: async options => {
        assert.equal(options.binding.userId, 'owned-expiry');
        sequence.push('logout');
        return { result: { status: 'PASS' } };
      },
      capture: async options => {
        assert.equal(options.actor.password, 'PRIVATE_SYNTHETIC_PASSWORD');
        assert.equal(options.newPassword, 'PRIVATE_SYNTHETIC_NEW_PASSWORD');
        if (mode === 'capture-error') throw new Error('PRIVATE_CAPTURE_DETAIL');
        if(protocol)await options.acquireMail({});
        return { current: { status: 'PASS', results:[
          {verificationId:'authn.reset.current.password-before',outcome:'ALLOWED'},
          {verificationId:'authn.reset.current.accepted',outcome:'ALLOWED'},
          {verificationId:'authn.reset.current.replay',outcome:'DENIED_BY_POLICY'},
        ] }, session: { status: 'PASS' }, lifetime:{status:'PASS'} };
      },
      captureExpiry:async options=>{
        assert.match(options.actor.username,/-expiry@gmail\.com$/);
        assert.equal(typeof options.confirmMailLease,'function');await options.observeTokenAge();
        if(mode==='protocol-expiry-error')throw Error('PRIVATE_EXPIRY_DETAIL');
        sequence.push('expiry');
        return {delivery:{state:'synthetic'},expiredToken:{owned:true,unused:true,ageMs:3600001,lifetimeMs:3600000,remainingMs:-1},results:[
          {verificationId:'authn.reset.expired.password-before',outcome:'ALLOWED'},
          {verificationId:'authn.reset.expired.rejected',outcome:'DENIED_BY_POLICY'},
          {verificationId:'authn.reset.expired.password-unchanged',outcome:'ALLOWED'},
        ]};
      },
    });
  } catch (caught) { error = caught; }
  finally { input.destroy(); output.destroy(); }
  assert.equal(text.includes('PRIVATE'), false);
  return { result, error, text, launched, transportClosed, browserClosed, cleanupAccepted, sequence };
}

test('integrated reset, comparison and logout execute in the observed lease order', async () => {
  const value = await run('integrated');
  assert.equal(value.error, undefined);
  assert.deepEqual(value.sequence, ['expiry', 'comparison', 'logout']);
  assert.equal(value.result.protocol.expired.status, 'PASS');
  assert.equal(value.result.comparisons.proofs.length, 2);
  assert.equal(value.result.logout.result.status, 'PASS');
  assert.equal(value.cleanupAccepted, true);
});

test('comparison scope verifies the fixture and cleanup without opening a reset mail handoff', async () => {
  const value = await run('comparison');
  assert.equal(value.error, undefined);
  assert.equal(value.result.proofs.length, 2);
  assert.equal(value.cleanupAccepted, true);
});

test('combined protocol keeps separate verified actors and evaluates all six reset cases before independent cleanup',async()=>{
  const value=await run('protocol-success');assert.equal(value.error,undefined);
  assert.equal(value.result.protocol.expired.status,'PASS');assert.equal(value.transportClosed,2);
  assert.equal(value.browserClosed,1);assert.equal(value.cleanupAccepted,true);
});
for(const mode of ['protocol-wrong-actor','protocol-expiry-error'])test(`${mode} retains failure and still requires fixture cleanup`,async()=>{
  const value=await run(mode);assert.equal(value.error.message,'Connected reset qualification requires owned recovery');
  assert.equal(value.cleanupAccepted,true);assert.equal(value.text.includes('"operation":"finished"'),false);
});

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
