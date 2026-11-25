import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { openConnectionStore } from './store.mjs';
import { createMailHandoff } from './handoff.mjs';
import { createScannerChannel, listenScannerChannel } from './scannerChannel.mjs';
import { openScannerMailClientV2, withScannerMailHandoffV2 } from './scannerClient.mjs';
import { writeAuditFileV2 } from '../../../mofacts/scripts/security-audit/core/producerFilesV2.mjs';
import { canonicalAuditJson } from '../../../mofacts/common/securityAudit/canonicalReport.ts';

const namespace = 'mofacts_audit_fixture_0123456789ab';
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-client-'));
  await fs.chmod(directory, 0o700);
  const leaseDirectory = path.join(directory, 'lease'); await fs.mkdir(leaseDirectory, { mode: 0o700 });
  const lease = path.join(leaseDirectory, 'staging2-authentication.lock.json');
  const deadlineMs = Date.now() + 10000;
  await writeAuditFileV2(lease, { schema: 'MoFaCTSAuditAuthenticationLeaseV1',
    target: 'https://staging2.optimallearning.org', namespace, startedAtMs: Date.now(), deadlineMs });
  const store = await openConnectionStore(directory), handoff = createMailHandoff({ store });
  const server = createScannerChannel({ handoff, leaseDirectory });
  const socketPath = path.join(directory, 'scanner.sock');
  await listenScannerChannel(server, socketPath);
  let client;
  t.after(async () => {
    client?.abort();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const open = async options => {
    client = await openScannerMailClientV2({ socketPath, namespace, deadlineMs, ...options });
    return client;
  };
  return { directory, socketPath, leaseDirectory, lease, store, handoff, deadlineMs, open };
}
async function until(check) {
  for (let index = 0; index < 100; index++) { if (check()) return; await delay(5); }
  assert.fail('Expected bounded protocol state did not arrive');
}
function message(binding) {
  const content = `${binding.target}/auth/reset-password?email=${encodeURIComponent(binding.recipient)}&token=${'a'.repeat(64)}`;
  return { id: '1abcd', payload: { mime_type: 'text/plain', filename: null, parts: null,
    headers: [{ name: 'To', value: binding.recipient }, { name: 'Delivered-To', value: binding.recipient },
      { name: 'X-Received', value: `by 2002:a17:903:1 with SMTP id synthetic.${binding.requestedAtMs}; Synthetic` }],
    body: { content, size: Buffer.byteLength(content), attachment_id: null } } };
}

test('verification and reset use one lease with separate readiness and monotonic private requests', async t => {
  const f = await fixture(t), client = await f.open();
  const reader = client.waitForReader(); f.handoff.request(); await reader;
  const requestedAtMs = Date.now();
  const binding = { namespace, recipient: `operator+${namespace}-reset@example.test`,
    target: 'https://staging2.optimallearning.org', requestedAtMs, deadlineMs: requestedAtMs + 5000 };
  const verification = message(binding);
  verification.payload.body.content = `${binding.target}/auth/verify-email?token=opaque_native-token`;
  verification.payload.body.size = Buffer.byteLength(verification.payload.body.content);
  const deliver = async (acquisition, mail, expectedOperation, expectedId) => {
    await until(() => f.handoff.status().state === 'metadata-requested');
    const first = f.handoff.request();
    assert.equal(first.operation, expectedOperation); assert.equal(first.requestId, expectedId);
    const metadata = structuredClone(mail); delete metadata.payload.body;
    f.handoff.submit({ requestId: first.requestId, response: [metadata] });
    await until(() => f.handoff.status().state === 'body-requested');
    const second = f.handoff.request(); assert.equal(second.requestId, expectedId + 1);
    f.handoff.submit({ requestId: second.requestId, response: mail });
    return acquisition;
  };
  await deliver(client.acquireVerificationMail(binding), verification, 'gmail-verification-metadata', 1);
  const transition = client.beginResetWindow();
  await until(() => f.handoff.status().state === 'reader-needed');
  assert.equal(f.handoff.request().state, 'reader-ready'); await transition;
  const resetAt = Date.now();
  const reset = { ...binding, requestedAtMs: resetAt, deadlineMs: resetAt + 5000 };
  await deliver(client.acquireMail(reset), message(reset), 'gmail-metadata', 4);
  await client.confirmMailLease();
  const nextActor = client.beginExpiryWindow();
  await until(() => f.handoff.status().state === 'reader-needed'); f.handoff.request(); await nextActor;
  const expiryAt = Date.now(), expiry = { ...binding, recipient: binding.recipient.replace('-reset@', '-expiry@'),
    requestedAtMs: expiryAt, deadlineMs: expiryAt + 5000 };
  const expiryVerification = message(expiry);
  expiryVerification.payload.body.content = `${expiry.target}/auth/verify-email?token=second_native-token`;
  expiryVerification.payload.body.size = Buffer.byteLength(expiryVerification.payload.body.content);
  await deliver(client.acquireVerificationMail(expiry), expiryVerification, 'gmail-verification-metadata', 7);
  const expiryResetWindow = client.beginResetWindow();
  await until(() => f.handoff.status().state === 'reader-needed'); f.handoff.request(); await expiryResetWindow;
  const expiryResetAt = Date.now(), expiryReset = { ...expiry, requestedAtMs: expiryResetAt, deadlineMs: expiryResetAt + 5000 };
  await deliver(client.acquireMail(expiryReset), message(expiryReset), 'gmail-metadata', 10);
  await client.confirmMailLease();
  assert.ok(await fs.stat(f.lease));
  await fs.unlink(f.lease); await client.closeAfterVerifiedCleanup();
  assert.equal(f.handoff.status().state, 'idle');
});

test('real private channel waits for reader, carries validated metadata/body and closes only after lease release', async t => {
  const f = await fixture(t), client = await f.open();
  assert.equal(f.handoff.status().state, 'reader-needed');
  const reader = client.waitForReader();
  assert.equal(f.handoff.request().state, 'reader-ready'); await reader;
  const requestedAtMs = Date.now();
  const binding = { namespace, recipient: `operator+${namespace}-reset@example.test`,
    target: 'https://staging2.optimallearning.org', requestedAtMs, deadlineMs: requestedAtMs + 5000 };
  const mail = message(binding), metadata = structuredClone(mail); delete metadata.payload.body;
  const acquisition = client.acquireMail(binding);
  await until(() => f.handoff.status().state === 'metadata-requested');
  const first = f.handoff.request(); assert.equal(first.maximumResults, 10);
  assert.deepEqual(first.binding, binding);
  f.handoff.submit({ requestId: first.requestId, response: [metadata] });
  await until(() => f.handoff.status().state === 'body-requested');
  const second = f.handoff.request(); assert.equal(second.messageId, mail.id);
  f.handoff.submit({ requestId: second.requestId, response: mail });
  const result = await acquisition;
  assert.equal(result.plainText, mail.payload.body.content);
  assert.equal(result.receipt.exactRecipientMatched, true);
  assert.equal(JSON.stringify(result.receipt).includes('a'.repeat(64)), false);
  assert.equal(JSON.stringify(result.receipt).includes(binding.recipient), false);
  // Synthetic fixture has no accounts; explicit release represents independent
  // cleanup by the caller. This is transport proof, not live fixture cleanup.
  await fs.unlink(f.lease);
  await client.closeAfterVerifiedCleanup();
  assert.deepEqual(f.handoff.status(), { state: 'idle', auditExecutionComplete: false });
  assert.equal(f.store.read().handoff, null);
});

test('cleanup with a retained lease fails, preserving the lease and recovery marker', async t => {
  const f = await fixture(t), client = await f.open();
  await assert.rejects(client.closeAfterVerifiedCleanup(), /requires owned recovery/);
  await until(() => f.handoff.status().state === 'recovery-required');
  assert.equal(JSON.parse(await fs.readFile(f.lease, 'utf8')).namespace, namespace);
  assert.equal(f.store.read().handoff.namespace, namespace);
});

test('private lease confirmation cannot keep an expired owner alive or clear its recovery marker', async t => {
  const f = await fixture(t), client = await f.open();
  const reader = client.waitForReader(); f.handoff.request(); await reader;
  const requestedAtMs=Date.now(), binding={namespace,recipient:`operator+${namespace}-reset@example.test`,
    target:'https://staging2.optimallearning.org',requestedAtMs,deadlineMs:requestedAtMs+5000};
  const acquisition=client.acquireMail(binding), full=message(binding), metadata=structuredClone(full);delete metadata.payload.body;
  await until(()=>f.handoff.status().state==='metadata-requested');f.handoff.submit({requestId:1,response:[metadata]});
  await until(()=>f.handoff.status().state==='body-requested');f.handoff.submit({requestId:2,response:full});await acquisition;
  const time=Date.now();
  await fs.writeFile(f.lease,canonicalAuditJson({schema:'MoFaCTSAuditAuthenticationLeaseV1',target:binding.target,
    namespace,startedAtMs:time-2000,deadlineMs:time-1000})+'\n');
  await assert.rejects(client.confirmMailLease(),/requires owned recovery/);
  await until(()=>f.handoff.status().state==='recovery-required');
  assert.ok(await fs.stat(f.lease));assert.equal(f.store.read().handoff.namespace,namespace);
});

test('a different namespace cannot attach to another scanner lease', async t => {
  const f = await fixture(t);
  await assert.rejects(f.open({ namespace: 'mofacts_audit_fixture_aaaaaaaaaaaa' }), /requires owned recovery/);
  assert.equal(JSON.parse(await fs.readFile(f.lease, 'utf8')).namespace, namespace);
});

test('missing reader and acquisition before readiness cannot issue a metadata request', async t => {
  const f = await fixture(t), client = await f.open();
  const requestedAtMs = Date.now();
  await assert.rejects(client.acquireMail({ namespace, recipient: `operator+${namespace}-reset@example.test`,
    target: 'https://staging2.optimallearning.org', requestedAtMs, deadlineMs: requestedAtMs + 1000 }));
  await until(() => f.handoff.status().state === 'recovery-required');
  assert.equal(f.store.read().handoff.namespace, namespace);
});

test('reader timeout destroys the channel and retains the recovery obligation', async t => {
  const f = await fixture(t), client = await f.open({ deadlineMs: Date.now() + 150 });
  await assert.rejects(client.waitForReader(), /requires owned recovery/);
  await until(() => f.handoff.status().state === 'recovery-required');
  assert.ok(await fs.stat(f.lease));
});

for (const mode of ['foreign-namespace', 'production', 'mail-timeout']) {
  test(`${mode} cannot cross the mail ownership or original deadline boundary`, async t => {
    const f = await fixture(t), client = await f.open();
    const ready = client.waitForReader(); f.handoff.request(); await ready;
    const requestedAtMs = Date.now();
    const other = 'mofacts_audit_fixture_aaaaaaaaaaaa';
    const binding = { namespace: mode === 'foreign-namespace' ? other : namespace,
      recipient: `operator+${mode === 'foreign-namespace' ? other : namespace}-reset@example.test`,
      target: mode === 'production' ? 'https://optimallearning.org' : 'https://staging2.optimallearning.org',
      requestedAtMs, deadlineMs: requestedAtMs + 150 };
    await assert.rejects(client.acquireMail(binding), /requires owned recovery/);
    await until(() => f.handoff.status().state === 'recovery-required');
    assert.equal(JSON.parse(await fs.readFile(f.lease, 'utf8')).namespace, namespace);
  });
}

test('socket symlinks and expired deadlines fail before attachment', async t => {
  const f = await fixture(t), link = path.join(f.directory, 'alias.sock');
  await fs.symlink(f.socketPath, link);
  await assert.rejects(f.open({ socketPath: link }), /requires owned recovery/);
  await assert.rejects(f.open({ deadlineMs: Date.now() - 1 }), /requires owned recovery/);
  assert.equal(f.handoff.status().state, 'idle');
});

for (const mode of ['success', 'scenario-error', 'cleanup-error']) {
  test(`existing lease composition ${mode} starts only after reader readiness and verifies cleanup`, async t => {
    const f = await fixture(t); await fs.unlink(f.lease);
    let started = false, cleanup = false;
    const operation = withScannerMailHandoffV2({ socketPath: f.socketPath, leaseDirectory: f.leaseDirectory,
      namespace, deadlineMs: f.deadlineMs,
      run: async owner => {
        started = true; assert.equal(owner.namespace, namespace);
        assert.equal(typeof owner.acquireMail, 'function');
        if (mode === 'scenario-error') throw new Error('PRIVATE_SCENARIO_DETAIL');
        return { state: 'synthetic-scenario-complete' };
      },
      verifyClean: async owner => { cleanup = true; assert.equal(owner.namespace, namespace); return mode !== 'cleanup-error'; },
    });
    operation.catch(() => {});
    await until(() => f.handoff.status().state === 'reader-needed');
    assert.equal(started, false);
    assert.equal(JSON.parse(await fs.readFile(f.lease, 'utf8')).namespace, namespace);
    f.handoff.request();
    if (mode === 'success') assert.deepEqual(await operation, { state: 'synthetic-scenario-complete' });
    else await assert.rejects(operation, error => {
      assert.equal(error.message, 'Scanner mail connection requires owned recovery');
      assert.equal(error.cause, undefined); return true;
    });
    assert.equal(started, true); assert.equal(cleanup, true);
    if (mode === 'cleanup-error') {
      await until(() => f.handoff.status().state === 'recovery-required');
      assert.ok(await fs.stat(f.lease));
    } else {
      assert.equal(f.handoff.status().state, 'idle');
      await assert.rejects(fs.stat(f.lease), { code: 'ENOENT' });
    }
  });
}

for (const mode of ['unsolicited', 'malformed', 'oversized', 'disconnect']) {
  test(`invalid peer ${mode} never leaks its payload or leaves a pending attachment`, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-peer-'));
    const socketPath = path.join(directory, 'peer.sock');
    const server = net.createServer(socket => {
      socket.on('error', () => {});
      socket.once('data', () => {
        if (mode === 'disconnect') socket.end();
        else if (mode === 'malformed') socket.write('PRIVATE_PEER_DETAIL\n');
        else if (mode === 'oversized') socket.write('PRIVATE_PEER_DETAIL'.repeat(9000));
        else socket.write(JSON.stringify({ requestId: 7, response: 'PRIVATE_PEER_DETAIL' }) + '\n');
      });
    });
    await listenScannerChannel(server, socketPath);
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
    await assert.rejects(openScannerMailClientV2({ socketPath, namespace, deadlineMs: Date.now() + 2000 }), error => {
      assert.equal(error.message, 'Scanner mail connection requires owned recovery');
      assert.equal(error.cause, undefined); assert.equal(String(error.stack).includes('PRIVATE_PEER_DETAIL'), false);
      return true;
    });
  });
}
