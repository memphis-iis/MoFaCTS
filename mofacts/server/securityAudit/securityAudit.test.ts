import crypto from 'node:crypto';
import { expect } from 'chai';
import {
  canonicalJson,
  parseSecurityAuditReport,
  reportPayloadForDigest,
  type SecurityAuditReportV1,
} from '../../common/securityAuditReport';
import {
  acceptsSecurityAuditContentType,
  authenticateSecurityAuditRequest,
  SECURITY_AUDIT_MAX_BODY_BYTES,
  signSecurityAuditRequest,
} from './securityAuditIngestion';
import {
  consumeSecurityAuditDownloadToken,
  issueSecurityAuditDownloadToken,
} from './securityAuditDownloadTokens';
import { renderSecurityAuditHtml, securityAuditDownloadBytes } from './securityAuditPresentation';
import { ensureSecurityAuditIndexes } from './securityAuditStorage';

function reportFixture(): SecurityAuditReportV1 {
  const control = (sectionId: string) => ({
    controlId: `${sectionId}.control`,
    title: `${sectionId} control`,
    status: 'PASS' as const,
    severity: 'INFO' as const,
    evidence: { summary: 'The deterministic check passed.' },
  });
  const payload = {
    schema: 'SecurityAuditReportV1' as const,
    reportId: 'audit-123-full',
    reportType: 'full' as const,
    startedAt: '2026-08-19T06:00:00.000Z',
    completedAt: '2026-08-19T06:10:00.000Z',
    target: 'https://mofacts.optimallearning.org',
    sourceRevision: 'a'.repeat(40),
    productionImage: `sha256:${'b'.repeat(64)}`,
    toolVersions: { node: 'v24.15.0' },
    sections: {
      external: { sectionId: 'external' as const, status: 'PASS' as const, controls: [control('external')] },
      authentication: { sectionId: 'authentication' as const, status: 'PASS' as const, controls: [control('authentication')] },
      internal: { sectionId: 'internal' as const, status: 'PASS' as const, controls: [control('internal')] },
      repository: { sectionId: 'repository' as const, status: 'PASS' as const, controls: [control('repository')] },
    },
    executionErrors: [],
    counts: { pass: 4, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 },
  };
  return {
    ...payload,
    digestSha256: crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex'),
  };
}

describe('security audit report ingestion', function() {
  it('accepts only the exact JSON content type', function() {
    expect(acceptsSecurityAuditContentType('application/json')).to.equal(true);
    expect(acceptsSecurityAuditContentType('application/json; charset=utf-8')).to.equal(false);
    expect(acceptsSecurityAuditContentType('text/plain')).to.equal(false);
  });

  it('validates canonical schema and digest-authenticated HMAC requests', function() {
    const report = reportFixture();
    const body = Buffer.from(canonicalJson(report));
    const timestamp = '1787137200';
    const nonce = 'abcdefghijklmnopqrstuv';
    const secret = 's'.repeat(48);
    const signature = signSecurityAuditRequest(secret, timestamp, nonce, body);
    const authenticated = authenticateSecurityAuditRequest({
      body,
      secret,
      now: new Date(Number(timestamp) * 1000),
      headers: { timestamp, nonce, signature },
    });
    expect(authenticated.report).to.deep.equal(report);
    expect(authenticated.nonce).to.equal(nonce);
  });

  it('rejects stale timestamps, changed bodies, oversized bodies, and invalid report digests', function() {
    const report = reportFixture();
    const body = Buffer.from(canonicalJson(report));
    const timestamp = '1787137200';
    const nonce = 'abcdefghijklmnopqrstuv';
    const secret = 's'.repeat(48);
    const signature = signSecurityAuditRequest(secret, timestamp, nonce, body);
    const base = { body, secret, headers: { timestamp, nonce, signature } };
    expect(() => authenticateSecurityAuditRequest({ ...base, now: new Date((Number(timestamp) * 1000) + 300001) })).to.throw('timestamp');
    expect(() => authenticateSecurityAuditRequest({ ...base, body: Buffer.from(`${body.toString()} `), now: new Date(Number(timestamp) * 1000) })).to.throw('signature');
    expect(() => authenticateSecurityAuditRequest({ ...base, body: Buffer.alloc(SECURITY_AUDIT_MAX_BODY_BYTES + 1), now: new Date(Number(timestamp) * 1000) })).to.throw('too large');
    const invalidReport = { ...report, digestSha256: '0'.repeat(64) };
    const invalidBody = Buffer.from(canonicalJson(invalidReport));
    expect(() => authenticateSecurityAuditRequest({
      body: invalidBody,
      secret,
      now: new Date(Number(timestamp) * 1000),
      headers: { timestamp, nonce, signature: signSecurityAuditRequest(secret, timestamp, nonce, invalidBody) },
    })).to.throw('digest');
  });

  it('rejects sensitive evidence and unexpected fields', function() {
    const report = reportFixture();
    const unsafe = structuredClone(report) as SecurityAuditReportV1;
    unsafe.sections.external.controls[0]!.evidence.summary = 'user@example.org';
    expect(() => parseSecurityAuditReport(unsafe)).to.throw('forbidden sensitive');
    expect(() => parseSecurityAuditReport({ ...report, rawOutput: 'forbidden' })).to.throw('unexpected or missing');
    expect(canonicalJson(reportPayloadForDigest(report))).not.to.include('digestSha256');
  });

  it('creates unique replay indexes and a 90-day TTL index contract', async function() {
    const calls: Array<{ keys: Record<string, number>; options?: Record<string, unknown> }> = [];
    await ensureSecurityAuditIndexes({
      async createIndex(keys, options) {
        calls.push(options ? { keys, options } : { keys });
        return 'index';
      },
    });
    expect(calls).to.deep.include({ keys: { reportId: 1 }, options: { unique: true } });
    expect(calls).to.deep.include({ keys: { digestSha256: 1 }, options: { unique: true } });
    expect(calls).to.deep.include({ keys: { ingestNonce: 1 }, options: { unique: true } });
    expect(calls).to.deep.include({ keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } });
  });

  it('issues single-use five-minute download tokens', function() {
    const issued = issueSecurityAuditDownloadToken({
      reportId: 'audit-123-full', format: 'json', createdByUserId: 'admin',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(consumeSecurityAuditDownloadToken(issued.token, new Date('2026-08-19T00:04:59.000Z'))?.reportId).to.equal('audit-123-full');
    expect(consumeSecurityAuditDownloadToken(issued.token, new Date('2026-08-19T00:04:59.000Z'))).to.equal(null);
    const expired = issueSecurityAuditDownloadToken({
      reportId: 'audit-expired', format: 'html', createdByUserId: 'admin',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(consumeSecurityAuditDownloadToken(expired.token, new Date('2026-08-19T00:05:01.000Z'))).to.equal(null);
  });

  it('escapes standalone HTML and hashes exact download bytes', function() {
    const report = reportFixture();
    report.sections.external.controls[0]!.title = '<script>alert(1)</script>';
    const html = renderSecurityAuditHtml(report);
    expect(html).not.to.include('<script>alert(1)</script>');
    expect(html).to.include('&lt;script&gt;alert(1)&lt;/script&gt;');
    const download = securityAuditDownloadBytes(reportFixture(), 'json');
    expect(download.sha256).to.equal(crypto.createHash('sha256').update(download.body).digest('hex'));
  });
});
