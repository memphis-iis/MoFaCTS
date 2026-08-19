export type SecurityAuditSummary = Readonly<{
  reportId: string;
  reportType: 'exposure' | 'full';
  startedAt: string;
  completedAt: string;
  target: string;
  sourceRevision: string;
  productionImage: string;
  digestSha256: string;
  overallStatus: 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE';
  sectionStatuses: Record<string, 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE'>;
  counts: Record<string, number>;
  executionErrorCount: number;
  ingestedAt: string;
}>;

export type SecurityAuditSnapshot = Readonly<{
  generatedAt: string;
  latestExposure: SecurityAuditSummary | null;
  latestFull: SecurityAuditSummary | null;
  reports: SecurityAuditSummary[];
}>;

function isSummary(value: unknown): value is SecurityAuditSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.reportId === 'string'
    && (summary.reportType === 'exposure' || summary.reportType === 'full')
    && typeof summary.completedAt === 'string'
    && typeof summary.target === 'string'
    && typeof summary.digestSha256 === 'string'
    && typeof summary.sectionStatuses === 'object'
    && typeof summary.counts === 'object';
}
export function normalizeSecurityAuditSnapshot(value: unknown): SecurityAuditSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Security audit summary response is invalid');
  const record = value as Record<string, unknown>;
  if (typeof record.generatedAt !== 'string' || !Array.isArray(record.reports) || !record.reports.every(isSummary)) {
    throw new Error('Security audit summary response is invalid');
  }
  if (record.latestExposure !== null && !isSummary(record.latestExposure)) throw new Error('Latest exposure report is invalid');
  if (record.latestFull !== null && !isSummary(record.latestFull)) throw new Error('Latest full report is invalid');
  return {
    generatedAt: record.generatedAt,
    latestExposure: record.latestExposure as SecurityAuditSummary | null,
    latestFull: record.latestFull as SecurityAuditSummary | null,
    reports: record.reports,
  };
}

export function securityAuditIsStale(report: SecurityAuditSummary, nowMs = Date.now()): boolean {
  const completedMs = new Date(report.completedAt).getTime();
  if (!Number.isFinite(completedMs)) return true;
  const thresholdMs = report.reportType === 'exposure'
    ? 36 * 60 * 60 * 1000
    : 8 * 24 * 60 * 60 * 1000;
  return nowMs - completedMs > thresholdMs;
}
