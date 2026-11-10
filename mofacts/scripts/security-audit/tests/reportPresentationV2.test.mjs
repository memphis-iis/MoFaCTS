import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { auditDownloadBytesV2 } from '../../../server/securityAudit/securityAuditPresentationV2.ts';
import { errorReport } from './fixtures/v2Fixtures.mjs';

test('V2 downloads preserve exact JSON and render escaped HTML with independent byte checksums', async () => {
  const report = await errorReport();
  report.sections.external.controls[0].evidence.summary = '<img src=x onerror=alert(1)>';
  const { digestSha256: _old, ...payload } = report;
  const valid = { ...payload, digestSha256: await auditDigest(payload) };

  const json = await auditDownloadBytesV2(valid, 'json');
  assert.deepEqual(JSON.parse(json.body.toString()), valid);
  assert.equal(json.sha256, crypto.createHash('sha256').update(json.body).digest('hex'));

  const exported = await auditDownloadBytesV2(valid, 'html');
  const html = exported.body.toString();
  assert.ok(html.includes("content=\"default-src 'none'\""));
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes(valid.digestSha256));
  assert.ok(html.includes(valid.catalogDigestSha256));
  assert.ok(html.includes('Execution errors'));
  assert.ok(html.includes('external.dns-addresses'));

  await assert.rejects(auditDownloadBytesV2({ ...valid, digestSha256: '0'.repeat(64) }, 'json'));
  await assert.rejects(auditDownloadBytesV2(valid, 'pdf'));
});
