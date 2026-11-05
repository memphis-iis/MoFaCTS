import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { authenticateAuditRequestV2, signAuditRequestV2 } from '../../../server/securityAudit/securityAuditIngestionV2.ts';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { errorReport, ingestionContext } from './fixtures/v2Fixtures.mjs';

async function request() {
  const report = await errorReport();
  const body = Buffer.from(canonicalAuditJson(report));
  const secret = 'synthetic-only-'.repeat(4), timestamp = '1793880120', nonce = 'synthetic-contract-nonce-0001';
  const signature = signAuditRequestV2(secret, timestamp, nonce, body);
  return { report, args: { body, secret, headers: { timestamp, nonce, signature }, now: new Date(Number(timestamp) * 1000),
    receiver: { targetOrigin: ingestionContext.targetOrigin, receiverRevision: ingestionContext.receiverRevision, receiverImage: ingestionContext.receiverImage } } };
}

test('V2 signed ingestion: same HMAC wire formula with strict shared parsing and independent receiver context', async () => {
  const { report, args } = await request();
  const digest = crypto.createHash('sha256').update(args.body).digest('hex');
  assert.equal(args.headers.signature, crypto.createHmac('sha256', args.secret)
    .update(`${args.headers.timestamp}.${args.headers.nonce}.${digest}`).digest('hex'));
  const authenticated = await authenticateAuditRequestV2(args);
  assert.deepEqual(authenticated.report, report);
  assert.equal(authenticated.nonce, args.headers.nonce);
});

test('V2 signed ingestion: stale/future/bad headers, body tampering, oversize and wrong target are rejected', async () => {
  const { args } = await request();
  for (const mutate of [
    a => { a.secret = 'short'; },
    a => { a.headers.timestamp = 'bad'; },
    a => { a.headers.nonce = 'short'; },
    a => { a.headers.signature = 'bad'; },
    a => { a.headers.signature = '0'.repeat(64); },
    a => { a.now = new Date(Number(a.headers.timestamp) * 1000 + 300001); },
    a => { a.now = new Date(Number(a.headers.timestamp) * 1000 - 300001); },
    a => { a.now = new Date(NaN); },
    a => { a.body = Buffer.concat([a.body, Buffer.from(' ')]); },
    a => { a.body = Buffer.alloc(2 * 1024 * 1024 + 1); },
    a => { a.receiver.targetOrigin = 'https://unapproved.example'; },
  ]) {
    const candidate = { ...args, body: Buffer.from(args.body), headers: { ...args.headers }, receiver: { ...args.receiver } };
    mutate(candidate);
    await assert.rejects(authenticateAuditRequestV2(candidate));
  }
});

test('V2 signed ingestion: an authenticated, digest-correct but incomplete report still fails independently', async () => {
  const { args, report } = await request();
  report.sections.external.controls.pop(); report.counts.error--;
  const { digestSha256: _old, ...payload } = report;
  report.digestSha256 = await auditDigest(payload);
  args.body = Buffer.from(canonicalAuditJson(report));
  args.headers.signature = signAuditRequestV2(args.secret, args.headers.timestamp, args.headers.nonce, args.body);
  await assert.rejects(authenticateAuditRequestV2(args));
});
