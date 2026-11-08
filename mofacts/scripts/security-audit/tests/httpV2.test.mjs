import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomBytes, createHash } from 'node:crypto';
import test from 'node:test';
import { createSecurityAuditHttpV2, readAuditBodyV2 } from '../../../server/securityAudit/securityAuditHttpV2.ts';
import { AUDIT_V2_MAX_BODY_BYTES, AuditV2RequestError, signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { canonicalAuditJson, auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { errorReport } from './fixtures/v2Fixtures.mjs';
import { receiverFixture, receiverClock, receiverSecret } from './helpers/receiverFixture.mjs';

const prefix = '/internal/security-audits/v2', downloads = '/admin/security-audits/download';
function signed(body) {
  const timestamp = String(receiverClock.getTime() / 1000), nonce = randomBytes(24).toString('base64url');
  return { 'content-type': 'application/json', 'x-mofacts-audit-timestamp': timestamp, 'x-mofacts-audit-nonce': nonce,
    'x-mofacts-audit-signature': signAuditRequestV2(receiverSecret, timestamp, nonce, body) };
}
async function server(t, options = {}) {
  const value = receiverFixture(options), handler = createSecurityAuditHttpV2({ receiver: options.receiver || value.receiver,
    ingestionConfigured: () => options.configured !== false });
  const server = http.createServer((req, res) => {
    const path = String(req.url || ''); let operation;
    if (path.startsWith(prefix)) { req.url = path.slice(prefix.length); operation = handler.ingest(req, res); }
    else if (path.startsWith(downloads)) { req.url = path.slice(downloads.length); operation = handler.download(req, res); }
    else { res.writeHead(404); res.end(); return; }
    operation.catch(() => { res.destroy(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); const closed = once(server, 'close'); server.close(); await closed; });
  const request = (path = prefix, method = 'POST', body = Buffer.alloc(0), headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
      const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); req.destroy(); });
    });
    req.once('error', reject);
    if (Array.isArray(body)) { for (const part of body) req.write(part); req.end(); } else req.end(body);
  });
  return { ...value, request };
}

test('V2 HTTP is inert, uses exact mounted paths/methods/types and reports unavailable ingestion before reading', async t => {
  const value = await server(t);
  for (const [path, method, headers, status] of [[prefix, 'GET', {}, 405], [prefix + '/extra', 'POST', {}, 404],
    [prefix, 'POST', { 'content-type': 'application/json; charset=utf-8' }, 415]]) {
    const result = await value.request(path, method, Buffer.alloc(0), headers); assert.equal(result.status, status);
    assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.headers['x-content-type-options'], 'nosniff');
  }
  const unavailable = await server(t, { configured: false });
  assert.equal((await unavailable.request(prefix, 'POST', Buffer.from('{}'), { 'content-type': 'application/json' })).status, 503);
  assert.equal(value.calls.length, 0); assert.equal(unavailable.calls.length, 0);
});

test('V2 HTTP authenticates before identity/storage, stores complete reports and rejects replay, V1 and target contradictions', async t => {
  const value = await server(t, { protectedMetadata: true });
  const report = await errorReport(), body = Buffer.from(canonicalAuditJson(report));
  const stored = await value.request(prefix, 'POST', body, signed(body));
  assert.equal(stored.status, 201); assert.equal(stored.body.toString(), '{"stored":true}\n'); assert.equal(value.rows.length, 1);
  assert.equal((await value.request(prefix, 'POST', body, signed(body))).status, 409);
  assert.equal((await value.request(prefix, 'POST', body, { ...signed(body), 'x-mofacts-audit-signature': 'f'.repeat(64) })).status, 401);
  for (const candidate of [{ schema: 'SecurityAuditReportV1' }, { ...report, reportId: 'synthetic-wrong-target', target: 'https://other.example' }]) {
    const { digestSha256: _prior, ...payload } = candidate; void _prior;
    const invalid = Buffer.from(canonicalAuditJson({ ...payload, digestSha256: await auditDigest(payload) }));
    assert.equal((await value.request(prefix, 'POST', invalid, signed(invalid))).status, 400);
  }
  assert.equal(value.rows.length, 1);
});

test('V2 HTTP bounds declared and chunked bodies without touching identity or storage', async t => {
  const value = await server(t), headers = { 'content-type': 'application/json' };
  assert.equal((await value.request(prefix, 'POST', Buffer.alloc(0), { ...headers, 'content-length': String(AUDIT_V2_MAX_BODY_BYTES + 1) })).status, 413);
  const chunks = [Buffer.alloc(AUDIT_V2_MAX_BODY_BYTES / 2 + 1), Buffer.alloc(AUDIT_V2_MAX_BODY_BYTES / 2 + 1)];
  assert.equal((await value.request(prefix, 'POST', chunks, headers)).status, 413);
  assert.equal(value.identityCalls(), 0); assert.equal(value.calls.length, 0); assert.equal(value.rows.length, 0);
});

test('V2 body cancellation and already-closed streams reject clearly and release listeners', async () => {
  for (const event of ['aborted', 'close', 'error']) {
    const req = new PassThrough(); req.headers = {}; req.complete = false;
    const pending = readAuditBodyV2(req); req.emit(event, new Error('synthetic private diagnostic'));
    await assert.rejects(pending); assert.equal(req.listenerCount('data'), 0); assert.equal(req.listenerCount('end'), 0); req.destroy();
  }
  const closed = new PassThrough(); closed.headers = {}; closed.destroy(); await assert.rejects(readAuditBodyV2(closed));
});

test('V2 HTTP downloads preserve verified JSON/HTML checksums, one-use tokens, admin revocation and corrupt-record denial', async t => {
  const value = await server(t), body = Buffer.from(canonicalAuditJson(await errorReport()));
  assert.equal((await value.request(prefix, 'POST', body, signed(body))).status, 201);
  const id = value.rows[0].reportId;
  for (const format of ['json', 'html']) {
    const token = await value.receiver.issueDownload('synthetic-admin', id, format), result = await value.request(token.url, 'GET');
    assert.equal(result.status, 200); assert.equal(result.headers['content-security-policy'], "default-src 'none'; sandbox");
    const hash = createHash('sha256').update(result.body).digest();
    assert.equal(result.headers['x-content-sha256'], hash.toString('hex')); assert.equal(result.headers.digest, 'sha-256=' + hash.toString('base64'));
    assert.equal((await value.request(token.url, 'GET')).status, 404);
  }
  const corrupt = await value.receiver.issueDownload('synthetic-admin', id, 'json'); value.rows[0].digestSha256 = 'f'.repeat(64);
  assert.equal((await value.request(corrupt.url, 'GET')).status, 500);
  value.rows[0].digestSha256 = JSON.parse(body).digestSha256;
  const revoked = await value.receiver.issueDownload('synthetic-admin', id, 'json'); value.revoke();
  assert.equal((await value.request(revoked.url, 'GET')).status, 403);
  assert.equal((await value.request(downloads + '/bad/path', 'GET')).status, 404);
});

test('V2 HTTP maps typed failures independently of message text and never returns private diagnostics', async t => {
  for (const [error, expected] of [[new AuditV2RequestError('authentication', 'synthetic-private-value'), 401],
    [new AuditV2RequestError('unavailable', 'synthetic-private-value'), 503], [new AuditV2RequestError('report', 'synthetic-private-value'), 400],
    [new Error('synthetic-private-value'), 500]]) {
    const value = await server(t, { receiver: { async receive() { throw error; }, async download() { throw error; } } });
    const result = await value.request(prefix, 'POST', Buffer.from('{}'), { 'content-type': 'application/json' });
    assert.equal(result.status, expected); assert.doesNotMatch(result.body.toString(), /synthetic-private-value/);
  }
});
