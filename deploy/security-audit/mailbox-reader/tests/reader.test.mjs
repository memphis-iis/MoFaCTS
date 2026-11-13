import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { readResetMailImapsV2 as read, selectPlainTextPartV2 as part, MailboxReaderError } from '../reader.mjs';

const namespace = 'mofacts_audit_fixture_0123456789ab';
const binding = { namespace, recipient: `operator+${namespace}-reset@example.test`, target: 'https://staging2.optimallearning.org', requestedAtMs: 1000, deadlineMs: 121000 };
const input = () => ({ binding: { ...binding }, imaps: { host: 'imap.example.test', username: 'PRIVATE-mail-user', mailbox: 'INBOX' }, password: 'PRIVATE-password' });
const capability = 'b'.repeat(64);
const body = `${binding.target}/auth/reset-password?email=${encodeURIComponent(binding.recipient)}&token=${capability}`;
const structure = () => ({ type: 'text/plain', parameters: { charset: 'UTF-8' }, encoding: '7bit', size: body.length });
const message = (uid = 101) => ({ uid, seq: 2, envelope: { to: [{ address: binding.recipient }] }, internalDate: new Date(2000), bodyStructure: structure() });

function fixture(overrides = {}) {
  const calls = [];
  class Client extends EventEmitter {
    constructor(options) { super(); this.options = options; this.mailbox = { path: 'INBOX', readOnly: true, uidValidity: 999n }; }
    async connect() { calls.push('connect'); }
    async mailboxOpen(path, options) { calls.push(['open', path, options]); return this.mailbox; }
    async search(query, options) { calls.push(['search', query, options]); return [101]; }
    async fetchAll(ids, query, options) { calls.push(['metadata', ids, query, options]); return [message()]; }
    async fetchOne(id, query, options) { calls.push(['selected', id, query, options]); return message(); }
    async download(id, selectedPart, options) { calls.push(['body', id, selectedPart, options]); return { meta: { contentType: 'text/plain', charset: 'utf-8' }, content: Readable.from([Buffer.from(body)]) }; }
    async logout() { calls.push('logout'); this.close(); return true; }
    close() { calls.push('close'); this.emit('close'); }
  }
  let client;
  return { calls, get client() { return client; },
    dependencies: { createClient(options) { client = Object.assign(new Client(options), overrides); return client; } } };
}
const category = expected => error => error instanceof MailboxReaderError && error.category === expected && !error.message.includes('PRIVATE');

test('uses verified TLS, read-only selection, stable UID, bounded parts and sanitized receipt', async () => {
  const f = fixture(), result = await read(input(), f.dependencies);
  assert.equal(result.token, capability); assert.equal(JSON.stringify(result.receipt).includes(capability), false);
  assert.equal(f.client.options.secure, true); assert.equal(f.client.options.port, 993);
  assert.equal(f.client.options.tls.rejectUnauthorized, true); assert.equal(f.client.options.logger, false);
  assert.equal(f.client.options.logRaw, false); assert.equal(f.client.options.disableAutoIdle, true);
  assert.deepEqual(f.calls.find(row => row[0] === 'open'), ['open', 'INBOX', { readOnly: true }]);
  assert.deepEqual(f.calls.find(row => row[0] === 'search').slice(1), [{ to: binding.recipient }, { uid: true }]);
  assert.equal(f.calls.find(row => row[0] === 'metadata')[1], '101');
  assert.equal(f.calls.find(row => row[0] === 'selected')[1], 101);
  assert.deepEqual(f.calls.find(row => row[0] === 'body').slice(1), [101, '1', { uid: true, maxBytes: 16385, chunkSize: 8192 }]);
  assert.deepEqual(f.calls.slice(-2), ['logout', 'close']);
});

test('invalid scope, credential/config extras and plaintext transports fail before client construction', async () => {
  for (const change of [value => { value.binding.target = 'https://optimallearning.org'; },
    value => { value.imaps.host = 'imap.example.test\r\nINJECT'; }, value => { value.password = ''; },
    value => { value.imaps.secure = false; }, value => { value.imaps.password = 'PRIVATE'; },
    value => { value.imaps.mailbox = ''; }]) {
    const value = input(); change(value); let created = false;
    await assert.rejects(read(value, { createClient() { created = true; } }), category('configuration'));
    assert.equal(created, false);
  }
});

test('read-only mailbox identity and UID validity must match throughout acquisition', async () => {
  for (const patch of [{ readOnly: false }, { path: 'Other' }, { uidValidity: 0n }, { uidValidity: '999' }]) {
    const f = fixture({ async mailboxOpen() { Object.assign(this.mailbox, patch); return this.mailbox; } });
    await assert.rejects(read(input(), f.dependencies), category('identity-conflict'));
    assert.equal(f.calls.some(row => row[0] === 'body'), false);
  }
  const f = fixture({ async fetchOne() { this.mailbox.uidValidity = 1000n; return message(); } });
  await assert.rejects(read(input(), f.dependencies), category('identity-conflict'));
});

test('search refusal, excess/duplicate/invalid UIDs and incomplete metadata do not become missing or passing mail', async () => {
  for (const ids of [false, null, [101, 101], [0], [2 ** 32], Array.from({ length: 11 }, (_, i) => i + 1)]) {
    const f = fixture({ async search() { return ids; } });
    await assert.rejects(read(input(), f.dependencies), category('evidence-incomplete'));
    assert.equal(f.calls.some(row => row[0] === 'body'), false);
  }
  for (const values of [[], [message(2)], [message(), message()]]) {
    const f = fixture({ async fetchAll() { return values; } });
    await assert.rejects(read(input(), f.dependencies), category('identity-conflict'));
  }
});

test('no match is explicit and stale/foreign/multi-recipient messages never get a body read', async () => {
  for (const values of [[], [{ ...message(), internalDate: new Date(999) }],
    [{ ...message(), envelope: { to: [{ address: 'other@example.test' }] } }],
    [{ ...message(), envelope: { to: [{ address: binding.recipient }], cc: [{ address: 'other@example.test' }] } }]]) {
    const f = values.length ? fixture({ async fetchAll() { return values; } }) : fixture({ async search() { return []; } });
    assert.deepEqual(await read(input(), f.dependencies), { state: 'not-observed' });
    assert.equal(f.calls.some(row => row[0] === 'selected' || row[0] === 'body'), false);
    assert.deepEqual(f.calls.slice(-2), ['logout', 'close']);
  }
});

test('metadata is checked again before downloading the selected UID', async () => {
  for (const changed of [{ ...message(), uid: 2 }, { ...message(), internalDate: new Date(122000) },
    { ...message(), envelope: { to: [{ address: 'other@example.test' }] } }]) {
    const f = fixture({ async fetchOne() { return changed; } });
    await assert.rejects(read(input(), f.dependencies), category('identity-conflict'));
    assert.equal(f.calls.some(row => row[0] === 'body'), false);
  }
});

test('plain MIME part selection is exact, bounded and never guesses attachments or unsupported charsets', () => {
  assert.equal(part(structure()), '1');
  assert.equal(part({ type: 'multipart/alternative', childNodes: [
    { ...structure(), part: '1' }, { type: 'text/html', part: '2', size: 20 },
  ] }), '1');
  for (const invalid of [{ type: 'text/html', part: '1', size: 20 },
    { ...structure(), disposition: 'attachment' }, { ...structure(), parameters: { charset: 'unknown' } },
    { ...structure(), encoding: 'unknown' }, { ...structure(), parameters: { format: 'flowed' } }, { ...structure(), part: '../../bad' },
    { type: 'multipart/mixed', childNodes: [structure(), structure()] },
    { type: 'multipart/alternative', childNodes: [{ ...structure(), part: undefined }] },
    { type: 'message/rfc822', size: 100 }, { ...structure(), size: 100000 },
    { type: 'multipart/mixed', childNodes: Array.from({ length: 17 }, () => structure()) }]) assert.throws(() => part(invalid));
});

test('invalid/truncated/oversized/unsupported body and wrong reset links cannot produce a delivery receipt', async () => {
  for (const text of ['', body.replace('staging2.optimallearning.org', 'optimallearning.org'), 'x'.repeat(16385)]) {
    const f = fixture({ async download() { return { meta: { contentType: 'text/plain' }, content: Readable.from([Buffer.from(text)]) }; } });
    await assert.rejects(read(input(), f.dependencies), category('evidence-incomplete'));
  }
  for (const meta of [{ contentType: 'text/html' }, { contentType: 'text/plain', filename: 'attachment' },
    { contentType: 'text/plain', charset: 'unknown' }, { contentType: 'text/plain', flowed: true }]) {
    const f = fixture({ async download() { return { meta, content: Readable.from([Buffer.from(body)]) }; } });
    await assert.rejects(read(input(), f.dependencies), category('evidence-incomplete'));
  }
  const f = fixture({ async download() { return { meta: { contentType: 'text/plain' }, content: Readable.from([Buffer.from([0xff])]) }; } });
  await assert.rejects(read(input(), f.dependencies), category('evidence-incomplete'));
});

test('provider errors and stream failures remain sanitized transport failures, with closed ownership', async () => {
  for (const method of ['connect', 'mailboxOpen', 'search', 'fetchAll', 'fetchOne', 'download']) {
    const f = fixture({ async [method]() { throw new Error('PRIVATE-password provider diagnostics'); } });
    await assert.rejects(read(input(), f.dependencies), category('transport'));
    assert.equal(f.calls.includes('close'), true);
  }
  const f = fixture({ async download() { return { meta: { contentType: 'text/plain' }, content: Readable.from((async function*() { yield Buffer.from(body); throw new Error('PRIVATE-body transport error'); })()) }; } });
  await assert.rejects(read(input(), f.dependencies), category('transport'));
});

test('logout failure cannot publish positive evidence even when the socket is forcibly closed', async () => {
  for (const logout of [async function() { throw new Error('PRIVATE logout'); }, async function() { return false; }]) {
    const f = fixture({ logout }); await assert.rejects(read(input(), f.dependencies), category('cleanup-unverified'));
    assert.equal(f.calls.includes('close'), true);
  }
});

test('a provider error event or missing close confirmation prevents positive publication', async () => {
  const fault = fixture({ async search() { this.emit('error', new Error('PRIVATE provider event')); return [101]; } });
  await assert.rejects(read(input(), fault.dependencies), category('transport'));
  const noClose = fixture({ close() {} });
  await assert.rejects(read(input(), noClose.dependencies), category('cleanup-unverified'));
});

test('a total deadline closes a pending connection and prevents late results from starting mailbox I/O', async () => {
  let release;
  const f = fixture({ connect() { return new Promise(resolve => { release = resolve; }); } });
  const callbacks = new Map(); let counter = 0;
  f.dependencies.timers = { setTimeout(callback) { const id = ++counter; callbacks.set(id, callback); return id; }, clearTimeout(id) { callbacks.delete(id); } };
  const result = read(input(), f.dependencies);
  const rejected = assert.rejects(result, category('timeout'));
  await new Promise(resolve => setImmediate(resolve));
  callbacks.get(1)(); await rejected;
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.some(row => row[0] === 'open' || row[0] === 'body'), false);
  assert.equal(f.calls.includes('close'), true);
});

test('the operation deadline destroys a stalled body stream and cannot return a partial capability', async () => {
  const stream = new Readable({ read() {} });
  const f = fixture({ async download() { return { meta: { contentType: 'text/plain' }, content: stream }; } });
  const callbacks = new Map(); let counter = 0;
  f.dependencies.timers = { setTimeout(callback) { const id = ++counter; callbacks.set(id, callback); return id; }, clearTimeout(id) { callbacks.delete(id); } };
  const result = read(input(), f.dependencies), rejected = assert.rejects(result, category('timeout'));
  await new Promise(resolve => setImmediate(resolve)); callbacks.get(1)(); await rejected;
  assert.equal(stream.destroyed, true); assert.equal(f.calls.includes('close'), true);
});
