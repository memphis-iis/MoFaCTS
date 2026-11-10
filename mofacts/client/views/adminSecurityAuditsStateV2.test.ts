import { expect } from 'chai';
import type { AuditReportSummaryV2 } from '../../common/securityAudit/summaryTypes.ts';
import { normalizeSecurityAuditSnapshotV2 } from './adminSecurityAuditsStateV2.ts';

describe('V2 security audit summary in the Meteor client', function () {
  it('keeps the latest report profile and deployed identities distinct', function () {
    const time = '2026-01-01T12:00:00.000Z';
    const exposure: AuditReportSummaryV2 = {
      schema: 'SecurityAuditReportV2', catalogId: 'mofacts.security-audit', catalogVersion: 1,
      catalogDigestSha256: 'a'.repeat(64), reportId: 'synthetic-exposure', reportType: 'exposure',
      startedAt: time, completedAt: time, ingestedAt: time, target: 'https://audit.example.test',
      scannerSourceRevision: 'b'.repeat(40),
      deployedApplicationRevision: { state: 'observed', value: 'c'.repeat(40) },
      deployedImageDigest: { state: 'unavailable', reason: 'not-provided' },
      digestSha256: 'd'.repeat(64), executionErrorCount: 0, overallStatus: 'PASS',
      counts: { pass: 23, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 },
      sectionStatuses: { external: 'PASS', authentication: 'NOT_APPLICABLE', internal: 'PASS', repository: 'NOT_APPLICABLE' },
    };
    const payload = { reports: [exposure], latestExposure: exposure, latestFull: null };
    expect(normalizeSecurityAuditSnapshotV2(payload)).to.deep.equal(payload);
    expect(() => normalizeSecurityAuditSnapshotV2({ ...payload, latestFull: exposure })).to.throw();
  });
});
