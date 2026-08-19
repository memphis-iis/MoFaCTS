import { expect } from 'chai';
import { normalizeSecurityAuditSnapshot, securityAuditIsStale } from './adminSecurityAuditsState';

function summary(reportType: 'exposure' | 'full', completedAt: string) {
  return {
    reportId: `audit-${reportType}`,
    reportType,
    startedAt: completedAt,
    completedAt,
    target: 'https://mofacts.optimallearning.org',
    sourceRevision: 'unknown',
    productionImage: 'unknown',
    digestSha256: 'a'.repeat(64),
    overallStatus: 'PASS' as const,
    sectionStatuses: { external: 'PASS' as const },
    counts: { pass: 1 },
    executionErrorCount: 0,
    ingestedAt: completedAt,
  };
}

describe('admin security audit state', function() {
  it('normalizes summary-only responses', function() {
    const exposure = summary('exposure', '2026-08-19T00:00:00.000Z');
    const result = normalizeSecurityAuditSnapshot({
      generatedAt: '2026-08-19T01:00:00.000Z',
      latestExposure: exposure,
      latestFull: null,
      reports: [exposure],
    });
    expect(result.reports).to.deep.equal([exposure]);
  });

  it('marks exposure stale after 36 hours and full reports stale after eight days', function() {
    const completed = '2026-08-01T00:00:00.000Z';
    expect(securityAuditIsStale(summary('exposure', completed), Date.parse('2026-08-02T12:00:01.000Z'))).to.equal(true);
    expect(securityAuditIsStale(summary('full', completed), Date.parse('2026-08-09T00:00:01.000Z'))).to.equal(true);
    expect(securityAuditIsStale(summary('full', completed), Date.parse('2026-08-08T23:59:59.000Z'))).to.equal(false);
  });
});
