import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { openConnectionStore } from './store.mjs';
import { createAuditAuthorization, CONNECTION_BASE, CONNECTION_RESOURCE, CONNECTION_SCOPES } from './authorization.mjs';
import { createMailHandoff } from './handoff.mjs';
import { createConnectionApp } from './server.mjs';
import { createScannerChannel, listenScannerChannel } from './scannerChannel.mjs';
import { writeAuditFileV2 } from '../../../mofacts/scripts/security-audit/core/producerFilesV2.mjs';
import { recoverAuthenticationLeaseV2 } from '../../../mofacts/scripts/security-audit/authentication/leaseV2.mjs';

const callback = 'https://chatgpt.com/connector/oauth/test-audit';
const verifier = 'A'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
test('the actual serve entry point reaches HTTP readiness and terminates cleanly', { timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-entry-'));
  await fs.chmod(directory, 0o700);
  const lease = path.join(directory, 'lease'); await fs.mkdir(lease, { mode: 0o700 });
  const httpSocket = path.join(directory, 'http.sock');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./main.mjs', import.meta.url)), 'serve',
    directory, path.join(directory, 'scanner.sock'), lease, httpSocket], { stdio: ['ignore', 'pipe', 'pipe'] });
  let closed = false, exit, startupStage = 'not-reported';
  child.stderr.on('data', bytes => {
    const stage = /initialization rejected at (runtime|state|authorization|scanner-channel|http-listener)\./.exec(String(bytes));
    if (stage) startupStage = stage[1];
  });
  const done = new Promise(resolve => child.once('close', (code, signal) => { closed = true; exit = { code, signal }; resolve(); }));
  t.after(async () => { if (!closed) { child.kill('SIGKILL'); await done; } await fs.rm(directory, { recursive: true, force: true }); });
  let ready = false;
  // Windows-mounted Linux source can take over ten seconds to load the shared
  // modules. Keep readiness bounded inside this case's 30-second limit.
  for (let attempt = 0; attempt < 250 && !closed; attempt++) {
    try {
      ready = await new Promise((resolve, reject) => {
        const request = http.get({ socketPath: httpSocket, path: '/.well-known/oauth-protected-resource/audit-connection/mcp',
          headers: { Host: 'staging2.optimallearning.org' } }, response => {
          let body = ''; response.on('data', chunk => { body += chunk; });
          response.on('end', () => { try { resolve(response.statusCode === 200 && JSON.parse(body).resource === CONNECTION_RESOURCE); } catch { reject(new Error('Invalid metadata')); } });
        });
        request.setTimeout(500, () => request.destroy()); request.on('error', reject);
      });
      if (ready) break;
    } catch { /* The listener may not yet exist; readiness remains unproven. */ }
    await delay(100);
  }
  assert.equal(ready, true, `Actual entry point did not become ready (${closed ? 'exited' : 'running'}; ${startupStage})`);
  assert.equal((await fs.stat(httpSocket)).mode & 0o777, 0o660);
  child.kill('SIGTERM'); await done;
  assert.deepEqual(exit, { code: 0, signal: null });
});
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-connection-'));
  await fs.chmod(directory, 0o700);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let clock = Date.now();
  const now = () => clock, store = await openConnectionStore(directory);
  const auth = createAuditAuthorization({ store, now });
  const client = await auth.provider.clientsStore.registerClient({ redirect_uris: [callback], token_endpoint_auth_method: 'none' });
  async function code(selected = CONNECTION_SCOPES) {
    let cookie, location;
    const enrollment = await auth.enroll();
    await auth.provider.authorize(client, { resource: new URL(CONNECTION_RESOURCE), redirectUri: callback,
      scopes: selected, state: 'opaque-client-state', codeChallenge: challenge }, {
      cookie: (_name, value) => { cookie = value; }, redirect: value => { location = value; },
    });
    const requestId = new URL(location).searchParams.get('request');
    const redirected = await auth.consent({ requestId, csrf: cookie, enrollmentCode: enrollment });
    return new URL(redirected).searchParams.get('code');
  }
  async function tokens(selected) {
    return auth.provider.exchangeAuthorizationCode(client, await code(selected), undefined, callback, new URL(CONNECTION_RESOURCE));
  }
  return { store, directory, auth, client, code, tokens, now, advance: ms => { clock += ms; } };
}

test('OAuth state persists only hashes; single-use codes and exact audience/redirect are enforced', async t => {
  const f = await fixture(t), code = await f.code();
  assert.equal(await f.auth.provider.challengeForAuthorizationCode(f.client, code), challenge);
  await assert.rejects(f.auth.provider.exchangeAuthorizationCode(f.client, code, undefined, 'https://evil.invalid', new URL(CONNECTION_RESOURCE)));
  await assert.rejects(f.auth.provider.exchangeAuthorizationCode(f.client, code, undefined, callback, new URL('https://evil.invalid')));
  const tokens = await f.auth.provider.exchangeAuthorizationCode(f.client, code, undefined, callback, new URL(CONNECTION_RESOURCE));
  await assert.rejects(f.auth.provider.exchangeAuthorizationCode(f.client, code, undefined, callback, new URL(CONNECTION_RESOURCE)));
  const text = await fs.readFile(path.join(f.directory, 'connection.json'), 'utf8');
  for (const value of [code, tokens.access_token, tokens.refresh_token]) assert.equal(text.includes(value), false);
  const restarted = createAuditAuthorization({ store: await openConnectionStore(f.directory), now: f.now });
  assert.equal((await restarted.provider.verifyAccessToken(tokens.access_token)).resource, CONNECTION_RESOURCE);
});

test('refresh rotates, replay revokes the family, scope escalation and wrong client are denied', async t => {
  const f = await fixture(t), first = await f.tokens(['audit:status']);
  await assert.rejects(f.auth.provider.exchangeRefreshToken(f.client, first.refresh_token, ['audit:mail'], new URL(CONNECTION_RESOURCE)));
  await assert.rejects(f.auth.provider.exchangeRefreshToken({ client_id: 'wrong' }, first.refresh_token, undefined, new URL(CONNECTION_RESOURCE)));
  const next = await f.auth.provider.exchangeRefreshToken(f.client, first.refresh_token, undefined, new URL(CONNECTION_RESOURCE));
  assert.deepEqual((await f.auth.provider.verifyAccessToken(next.access_token)).scopes, ['audit:status']);
  await assert.rejects(f.auth.provider.exchangeRefreshToken(f.client, first.refresh_token, undefined, new URL(CONNECTION_RESOURCE)));
  await assert.rejects(f.auth.provider.verifyAccessToken(next.access_token));
  await assert.rejects(f.auth.provider.verifyAccessToken(first.access_token));
});

test('expiry, explicit revocation and malformed grants fail closed', async t => {
  const f = await fixture(t), tokens = await f.tokens();
  f.advance(900001);
  await assert.rejects(f.auth.provider.verifyAccessToken(tokens.access_token));
  const renewed = await f.auth.provider.exchangeRefreshToken(f.client, tokens.refresh_token, undefined, new URL(CONNECTION_RESOURCE));
  await f.auth.provider.revokeToken(f.client, { token: renewed.refresh_token });
  await assert.rejects(f.auth.provider.verifyAccessToken(renewed.access_token));
  for (const token of ['', '__proto__', 'x'.repeat(10000)]) await assert.rejects(f.auth.provider.verifyAccessToken(token));
  const code = await f.code(); f.advance(60001);
  await assert.rejects(f.auth.provider.challengeForAuthorizationCode(f.client, code));
});

test('consent requires operator enrollment, bound cookie, exact scope and permitted redirect', async t => {
  const f = await fixture(t);
  for (const uri of ['https://evil.invalid', callback + '?x=y', 'http://localhost/callback']) {
    await assert.rejects(f.auth.provider.clientsStore.registerClient({ redirect_uris: [uri], token_endpoint_auth_method: 'none' }));
  }
  await assert.rejects(f.auth.provider.authorize(f.client, { resource: new URL(CONNECTION_RESOURCE), scopes: ['admin'],
    redirectUri: callback, state: 'state', codeChallenge: challenge }, {}));
  await assert.rejects(f.auth.consent({ requestId: 'unknown', csrf: 'A'.repeat(43), enrollmentCode: await f.auth.enroll() }));
  assert.deepEqual((await f.tokens()).scope, 'audit:mail audit:status');
  await f.auth.revokeAll();
  assert.equal(Object.values(f.store.read().grants).every(row => row.revoked), true);
});

const namespace = 'mofacts_audit_fixture_0123456789ab';
function mail(binding) {
  const content = `${binding.target}/auth/reset-password?email=${encodeURIComponent(binding.recipient)}&token=${'a'.repeat(64)}`;
  return { id: 'a123', payload: { mime_type: 'text/plain', filename: null, parts: null,
    headers: [{ name: 'To', value: binding.recipient }, { name: 'Delivered-To', value: binding.recipient },
      { name: 'X-Received', value: `by 2002:a17:903:1c6:b0:2ed:2e3a:1faf with SMTP id test.47.${binding.requestedAtMs + 1}; Sun, 15 Nov 2026 11:00:00 -0600` }],
    body: { content, size: Buffer.byteLength(content), attachment_id: null } } };
}
async function pendingMail(f) {
  const sent = [], handoff = createMailHandoff({ store: f.store, now: f.now });
  await handoff.open(namespace, frame => sent.push(frame));
  assert.equal(handoff.request().state, 'reader-ready');
  const binding = { namespace, recipient: `audit+${namespace}-reset@gmail.com`, target: 'https://staging2.optimallearning.org',
    requestedAtMs: f.now(), deadlineMs: f.now() + 120000 };
  await handoff.acceptScannerRequest({ operation: 'gmail-metadata', binding, maximumResults: 10, requestId: 1 });
  return { handoff, sent, binding };
}

test('mail remains private and only exact staged metadata then full-message carriage succeeds', async t => {
  const f = await fixture(t), { handoff, sent, binding } = await pendingMail(f);
  const full = mail(binding), metadata = structuredClone(full); delete metadata.payload.body;
  assert.equal(handoff.submit({ requestId: 1, response: [metadata] }).state, 'waiting-body');
  await handoff.acceptScannerRequest({ operation: 'gmail-full', requestId: 2, messageId: full.id });
  assert.deepEqual(handoff.submit({ requestId: 2, response: full }), { state: 'mail-handed-off', auditExecutionComplete: false });
  assert.deepEqual(sent[2], { requestId: 2, response: full });
  assert.equal(JSON.stringify(handoff.status()).includes(binding.recipient), false);
  const disk = await fs.readFile(path.join(f.directory, 'connection.json'), 'utf8');
  for (const value of [binding.recipient, 'a'.repeat(64), full.id]) assert.equal(disk.includes(value), false);
  assert.throws(() => handoff.submit({ requestId: 2, response: full }));
  await assert.rejects(handoff.closeAfterVerifiedCleanup(namespace, async () => false));
  await handoff.closeAfterVerifiedCleanup(namespace, async () => true);
  assert.equal(handoff.status().state, 'idle');
});

test('late/cross-run/production/ambiguous mail is rejected and restart retains recovery obligation', async t => {
  const f = await fixture(t), { handoff, binding } = await pendingMail(f);
  const full = mail(binding), metadata = structuredClone(full); delete metadata.payload.body;
  assert.throws(() => handoff.submit({ requestId: 2, response: [metadata] }));
  assert.throws(() => handoff.submit({ requestId: 1, response: [metadata, metadata] }));
  const wrong = structuredClone(metadata); wrong.payload.headers[0].value = 'other@gmail.com';
  assert.throws(() => handoff.submit({ requestId: 1, response: [wrong] }));
  f.advance(120000);
  assert.throws(() => handoff.submit({ requestId: 1, response: [metadata] }));
  await handoff.interrupt();
  const restarted = createMailHandoff({ store: await openConnectionStore(f.directory), now: f.now });
  assert.equal(restarted.status().state, 'recovery-required');
  await assert.rejects(restarted.open(namespace, () => {}));
  await restarted.closeAfterVerifiedCleanup(namespace, async () => true);
  await restarted.open(namespace, () => {}); restarted.request();
  await assert.rejects(restarted.acceptScannerRequest({ operation: 'gmail-metadata', maximumResults: 10, requestId: 1,
    binding: { ...binding, requestedAtMs: f.now(), deadlineMs: f.now() + 120000, target: 'https://mofacts.optimallearning.org' } }));
});

test('actual HTTP OAuth middleware verifies PKCE and protects MCP tools with per-tool scope', async t => {
  const f = await fixture(t), handoff = createMailHandoff({ store: f.store, now: f.now });
  const app = createConnectionApp({ authorization: f.auth, handoff }), listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening'); t.after(() => new Promise(resolve => listener.close(resolve)));
  const root = `http://127.0.0.1:${listener.address().port}`;
  const discovery = await fetch(root + '/.well-known/oauth-authorization-server/audit-connection').then(response => response.json());
  assert.equal(discovery.issuer, CONNECTION_BASE); assert.deepEqual(discovery.code_challenge_methods_supported, ['S256']);
  const denied = await fetch(root + '/audit-connection/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 401); assert.match(denied.headers.get('www-authenticate'), /resource_metadata=/);
  const code = await f.code(['audit:status']);
  const exchange = value => fetch(root + '/audit-connection/token', { method: 'POST', body: new URLSearchParams({
    grant_type: 'authorization_code', client_id: f.client.client_id, redirect_uri: callback, code,
    code_verifier: value, resource: CONNECTION_RESOURCE }) });
  assert.equal((await exchange('B'.repeat(43))).status, 400);
  const granted = await exchange(verifier); assert.equal(granted.status, 200); const token = (await granted.json()).access_token;
  // SDK middleware also checks real wall clock; align the fixture clock for HTTP.
  const mcp = async (name, args) => fetch(root + '/audit-connection/mcp', { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  const status = await mcp('audit_connection_status', {});
  assert.equal(status.status, 200); const result = await status.json(); assert.equal(result.result.structuredContent.auditExecutionComplete, false);
  assert.equal((await (await mcp('audit_mail_request', {})).json()).result.isError, true);
  assert.equal((await exchange(verifier)).status, 400);
});

test('HTTP consent retains exact-origin and bound-cookie guards with an origin-only referrer policy', async t => {
  const f = await fixture(t), enrollment = await f.auth.enroll();
  let consentUrl, cookie;
  await f.auth.provider.authorize(f.client, { redirectUri: callback, codeChallenge: challenge, resource: new URL(CONNECTION_RESOURCE),
    scopes: ['audit:status'], state: 'synthetic-origin-check' }, {
    cookie(name, value) { cookie = `${name}=${value}`; }, redirect(value) { consentUrl = new URL(value); },
  });
  const listener = createConnectionApp({ authorization: f.auth, handoff: createMailHandoff({ store: f.store }) }).listen(0, '127.0.0.1');
  await once(listener, 'listening'); t.after(() => new Promise(resolve => listener.close(resolve)));
  const root = `http://127.0.0.1:${listener.address().port}`;
  const form = await fetch(root + consentUrl.pathname + consentUrl.search);
  assert.equal(form.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(form.headers.get('content-security-policy'),
    `default-src 'none'; form-action 'self' ${callback}; frame-ancestors 'none'; base-uri 'none'`);
  const unknown = await fetch(root + '/audit-connection/consent?request=' + 'A'.repeat(43));
  assert.equal(unknown.status, 400);
  assert.equal(unknown.headers.get('content-security-policy'),
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  for (const origin of [undefined, 'null', 'https://other.invalid']) {
    const response = await fetch(root + '/audit-connection/consent', { method: 'POST', headers: { cookie, ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ request: consentUrl.searchParams.get('request'), enrollment }) });
    assert.equal(response.status, 400);
  }
  const noCookie = await fetch(root + '/audit-connection/consent', { method: 'POST', headers: { origin: 'https://staging2.optimallearning.org' },
    body: new URLSearchParams({ request: consentUrl.searchParams.get('request'), enrollment }) });
  assert.equal(noCookie.status, 400); assert.equal(f.store.read().enrollment.attempts, 0);
  assert.equal(Object.keys(f.store.read().codes).length, 0);
});

test('private scanner socket requires the actual lease and independently observed cleanup', { skip: process.platform !== 'linux' }, async t => {
  const f = await fixture(t), leaseDirectory = path.join(f.directory, 'lease');
  await fs.mkdir(leaseDirectory, { mode: 0o700 });
  const leaseFile = path.join(leaseDirectory, 'staging2-authentication.lock.json');
  await writeAuditFileV2(leaseFile, { schema: 'MoFaCTSAuditAuthenticationLeaseV1', target: 'https://staging2.optimallearning.org',
    namespace, startedAtMs: f.now(), deadlineMs: f.now() + 7200000 });
  const handoff = createMailHandoff({ store: f.store, now: f.now });
  const server = createScannerChannel({ handoff, leaseDirectory, now: f.now });
  const socketPath = path.join(f.directory, 'scanner.sock');
  await listenScannerChannel(server, socketPath);
  const socket = net.connect(socketPath); await once(socket, 'connect');
  t.after(() => { socket.destroy(); server.close(); });
  const lines = createInterface({ input: socket })[Symbol.asyncIterator]();
  const next = async () => JSON.parse((await lines.next()).value);
  socket.write(JSON.stringify({ operation: 'open', namespace }) + '\n');
  assert.deepEqual(await next(), { operation: 'attached' });
  handoff.request(); assert.deepEqual(await next(), { operation: 'reader-ready' });
  socket.write(JSON.stringify({ operation: 'cleanup-complete' }) + '\n');
  await once(socket, 'close');
  // The present lease prevented a false cleanup acknowledgement.
  assert.notEqual(handoff.status().state, 'idle');
  assert.equal(await fs.stat(leaseFile).then(() => true), true);
  // Simulate service restart with its persisted marker and a new socket.
  await new Promise(resolve => server.close(resolve));
  const restarted = createMailHandoff({ store: await openConnectionStore(f.directory), now: f.now });
  const nextServer = createScannerChannel({ handoff: restarted, leaseDirectory, now: f.now });
  await listenScannerChannel(nextServer, socketPath);
  t.after(() => nextServer.close());
  async function recover(expected) {
    const released = once(nextServer, 'scanner-idle');
    const recovery = net.connect(socketPath); await once(recovery, 'connect');
    const rows = createInterface({ input: recovery })[Symbol.asyncIterator]();
    recovery.write(JSON.stringify({ operation: 'recover', namespace }) + '\n');
    const result = await rows.next();
    if (expected) assert.deepEqual(JSON.parse(result.value), { operation: 'closed' });
    else assert.equal(result.done, true);
    recovery.destroy();
    // Observe durable completion, not a timing guess, before reconnecting.
    await released;
  }
  await recover(false);
  assert.equal(restarted.status().state, 'recovery-required');
  // Existing scanner owner is the only component allowed to release its lease.
  await recoverAuthenticationLeaseV2({ directory: leaseDirectory, namespace,
    confirmOwnerStopped: async () => true, verifyClean: async () => true });
  await recover(true);
  assert.equal(restarted.status().state, 'idle');
});
