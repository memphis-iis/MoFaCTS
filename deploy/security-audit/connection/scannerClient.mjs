import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fixtureNamespaceV2 } from '../../../mofacts/scripts/security-audit/authentication/stagingFixturesV2.mjs';
import { parseResetMailboxBindingV2 } from '../../../mofacts/scripts/security-audit/authentication/mailboxV2.mjs';
import { acquireConnectedGmailResetMessageV2, acquireConnectedGmailVerificationMessageV2 } from '../../../mofacts/scripts/security-audit/authentication/connectedGmailV2.mjs';
import { withAuthenticationLeaseV2 } from '../../../mofacts/scripts/security-audit/authentication/leaseV2.mjs';

const unavailable = () => new Error('Scanner mail connection requires owned recovery');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // A disconnect can precede the caller reaching its next protocol stage.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

// Scanner-side adapter for the existing protected channel. The caller owns the
// real environment lease, fixture recovery and independent cleanup. No cloud
// credential, mailbox reader, fixture creation or lease release is supplied here.
export async function openScannerMailClientV2({ socketPath, namespace, deadlineMs, now = Date.now }) {
  fixtureNamespaceV2(namespace);
  const started = now();
  if (typeof socketPath !== 'string' || !path.isAbsolute(socketPath) || !socketPath.endsWith('.sock')
    || !Number.isSafeInteger(started) || !Number.isSafeInteger(deadlineMs)
    || deadlineMs <= started || deadlineMs - started > 7200000) throw unavailable();
  const location = path.resolve(socketPath);
  try {
    const stat = await fs.lstat(location);
    if (!stat.isSocket() || stat.isSymbolicLink() || await fs.realpath(location) !== location) throw unavailable();
  } catch { throw unavailable(); }
  const attached = deferred(), closed = deferred();
  let ready = deferred(), readerDeadline = started + 120000, transition, purpose, recipient, expectedPurpose, heartbeat, expiryStarted = false;
  const socket = net.createConnection({ path: location });
  let phase = 'attaching', pending, sequence = 0, buffer = Buffer.alloc(0), used = false;
  const timers = new Set();
  const fail = () => {
    if (phase === 'closed' || phase === 'failed') return;
    phase = 'failed'; buffer.fill(0); buffer = Buffer.alloc(0);
    attached.reject(unavailable()); ready.reject(unavailable()); closed.reject(unavailable()); transition?.reject(unavailable());
    heartbeat?.reject(unavailable());
    if (pending) { pending.reject(unavailable()); pending = undefined; }
    for (const timer of timers) clearTimeout(timer);
    timers.clear(); socket.destroy();
  };
  const wait = async (promise, until) => {
    const remaining = Math.min(until, deadlineMs) - now();
    if (remaining <= 0 || phase === 'failed') { fail(); throw unavailable(); }
    const timer = setTimeout(fail, remaining); timers.add(timer);
    try { return await promise; }
    finally { clearTimeout(timer); timers.delete(timer); }
  };
  const send = frame => {
    if (phase === 'failed' || phase === 'closed') throw unavailable();
    socket.write(JSON.stringify(frame) + '\n', error => { if (error) fail(); });
  };
  socket.on('connect', () => { try { send({ operation: 'open', namespace }); } catch { fail(); } });
  socket.on('error', fail);
  socket.on('close', () => { if (phase !== 'closed') fail(); });
  socket.on('data', bytes => {
    try {
      if (buffer.length + bytes.length > 131072) throw unavailable();
      const previous = buffer;
      buffer = Buffer.concat([buffer, bytes]); previous.fill(0);
      while (buffer.includes(10)) {
        const end = buffer.indexOf(10), previous = buffer;
        const frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end)));
        buffer = Buffer.from(buffer.subarray(end + 1)); previous.fill(0);
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw unavailable();
        const keys = Object.keys(frame).sort().join(',');
        if (keys === 'operation' && frame.operation === 'attached' && phase === 'attaching') {
          phase = 'reader-needed'; attached.resolve();
        } else if (keys === 'operation' && frame.operation === 'reader-ready' && phase === 'reader-needed') {
          phase = 'ready'; ready.resolve();
        } else if (keys === 'operation' && frame.operation === 'reset-window-ready' && phase === 'reset-transition') {
          phase = 'reader-needed'; transition.resolve();
        } else if (keys === 'operation' && frame.operation === 'expiry-window-ready' && phase === 'expiry-transition') {
          phase = 'reader-needed'; transition.resolve();
        } else if (keys === 'operation' && frame.operation === 'lease-held' && phase === 'mail-handed-off' && heartbeat) {
          const current = heartbeat; heartbeat = undefined; current.resolve();
        } else if (keys === 'requestId,response' && phase === 'acquiring' && pending?.id === frame.requestId) {
          const current = pending; pending = undefined; current.resolve(frame.response);
        } else if (keys === 'operation' && frame.operation === 'closed' && phase === 'closing') {
          phase = 'closed'; closed.resolve(); socket.end();
        } else throw unavailable();
      }
    } catch { fail(); }
  });
  try { await wait(attached.promise, started + 120000); }
  catch { fail(); throw unavailable(); }
  const acquire = async (value, requestedPurpose) => {
      try {
        const binding = parseResetMailboxBindingV2(value);
        if (used || phase !== 'ready' || binding.namespace !== namespace || binding.deadlineMs > deadlineMs
          || recipient && binding.recipient !== recipient || expectedPurpose && requestedPurpose !== expectedPurpose) throw unavailable();
        used = true; purpose = requestedPurpose; recipient = binding.recipient; phase = 'acquiring';
        const request = async (operation, fields) => {
          if (pending || phase !== 'acquiring') throw unavailable();
          const response = deferred(); pending = { ...response, id: ++sequence };
          send({ requestId: sequence, operation, ...fields });
          return wait(response.promise, binding.deadlineMs);
        };
        const verification = requestedPurpose === 'verification';
        const result = await (verification ? acquireConnectedGmailVerificationMessageV2 : acquireConnectedGmailResetMessageV2)({ binding, now,
          listMessages: () => request(verification ? 'gmail-verification-metadata' : 'gmail-metadata', { binding, maximumResults: 10 }),
          readMessage: messageId => request(verification ? 'gmail-verification-full' : 'gmail-full', { messageId }),
        });
        if (!result?.plainText) throw unavailable();
        phase = 'mail-handed-off';
        return result;
      } catch { fail(); throw unavailable(); }
  };
  return {
    async waitForReader() {
      try { await wait(ready.promise, readerDeadline); }
      catch { fail(); throw unavailable(); }
    },
    acquireMail: value => acquire(value, 'reset'),
    acquireVerificationMail: value => acquire(value, 'verification'),
    // The fixture owner calls this only after native verification succeeds.
    // The old message deadline is never extended by this transition.
    async beginResetWindow() {
      try {
        if (phase !== 'mail-handed-off' || purpose !== 'verification' || heartbeat) throw unavailable();
        phase = 'reset-transition'; ready = deferred(); transition = deferred();
        readerDeadline = now() + 120000;
        send({ operation: 'begin-reset', requestId: ++sequence });
        await wait(transition.promise, now() + 5000);
        purpose = 'reset'; expectedPurpose = 'reset'; used = false;
        await wait(ready.promise, readerDeadline);
      } catch { fail(); throw unavailable(); }
    },
    async beginExpiryWindow() {
      try {
        if (phase !== 'mail-handed-off' || purpose !== 'reset' || expiryStarted || heartbeat
          || !recipient.includes(`+${namespace}-reset@`)) throw unavailable();
        expiryStarted = true; phase = 'expiry-transition'; ready = deferred(); transition = deferred();
        readerDeadline = now() + 120000;
        send({ operation: 'begin-expiry', requestId: ++sequence });
        await wait(transition.promise, now() + 5000);
        recipient = recipient.replace(`+${namespace}-reset@`, `+${namespace}-expiry@`);
        purpose = 'verification'; expectedPurpose = 'verification'; used = false;
        await wait(ready.promise, readerDeadline);
      } catch { fail(); throw unavailable(); }
    },
    async confirmMailLease() {
      try {
        if (phase !== 'mail-handed-off' || heartbeat) throw unavailable();
        const confirmation = deferred(); heartbeat = confirmation;
        send({ operation: 'hold' }); await wait(confirmation.promise, now() + 5000);
      } catch { fail(); throw unavailable(); }
    },
    async closeAfterVerifiedCleanup() {
      try {
        if (!['ready', 'reader-needed', 'mail-handed-off'].includes(phase) || heartbeat) throw unavailable();
        phase = 'closing'; send({ operation: 'cleanup-complete' });
        await wait(closed.promise, now() + 5000);
      } catch { fail(); throw unavailable(); }
    },
    // Disconnect never releases a lease or clears the server's persisted marker.
    abort: fail,
  };
}

// Compose the existing lease owner rather than introducing a second lock or
// cleanup convention. The caller still bounds/cancels its browser/scanner job.
// Its real scenario cannot begin until the cloud reader has signalled readiness.
export async function withScannerMailHandoffV2({ socketPath, leaseDirectory, namespace, deadlineMs, run, verifyClean }) {
  if (typeof run !== 'function' || typeof verifyClean !== 'function') throw unavailable();
  let client;
  try {
    const outcome = await withAuthenticationLeaseV2({ directory: leaseDirectory, namespace, deadlineMs,
      run: async lease => {
        try {
          client = await openScannerMailClientV2({ socketPath, namespace, deadlineMs });
          await client.waitForReader();
          return { completed: true, value: await run({ ...lease, acquireMail: client.acquireMail,
            acquireVerificationMail: client.acquireVerificationMail, beginResetWindow: client.beginResetWindow,
            beginExpiryWindow: client.beginExpiryWindow, confirmMailLease: client.confirmMailLease }) };
        } catch { return { completed: false }; }
      },
      verifyClean,
    });
    // withAuthenticationLeaseV2 returns only after independent cleanup and its
    // identity-bound lease release. The server verifies that release again.
    if (client) await client.closeAfterVerifiedCleanup();
    if (!outcome.completed) throw unavailable();
    return outcome.value;
  } catch { throw unavailable(); }
  finally { client?.abort(); }
}
