import { contentDigest, proofRecord, proofString, sourceCommit } from '../../common/securityAudit/proofFields.ts';
import { parseAuditIdentity } from '../../common/securityAudit/reportIdentity.ts';
import type { AuditReportSummaryV2 } from '../../common/securityAudit/summaryTypes.ts';

type AuditReportSnapshotV2 = {
  reports: AuditReportSummaryV2[];
  latestExposure: AuditReportSummaryV2 | null;
  latestFull: AuditReportSummaryV2 | null;
};

const summaryKeys = [
  'schema', 'catalogId', 'catalogVersion', 'catalogDigestSha256', 'reportId', 'reportType',
  'startedAt', 'completedAt', 'target', 'scannerSourceRevision', 'deployedApplicationRevision',
  'deployedImageDigest', 'digestSha256', 'counts', 'sectionStatuses', 'overallStatus',
  'executionErrorCount', 'ingestedAt',
] as const satisfies readonly (keyof AuditReportSummaryV2)[];
const countKeys = ['pass', 'fail', 'error', 'notApplicable', 'info', 'low', 'medium', 'high', 'critical'] as const;
const sectionKeys = ['external', 'authentication', 'internal', 'repository'] as const;

function invalid(): never { throw new Error('Security audit summary response is invalid'); }
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isStatus(value: unknown): boolean {
  return value === 'PASS' || value === 'FAIL' || value === 'ERROR' || value === 'NOT_APPLICABLE';
}
function summary(value: unknown): AuditReportSummaryV2 {
  const row = proofRecord(value, summaryKeys);
  if (row.schema !== 'SecurityAuditReportV2' || (row.reportType !== 'exposure' && row.reportType !== 'full')
    || !isCount(row.catalogVersion) || row.catalogVersion === 0 || !isCount(row.executionErrorCount)
    || !isStatus(row.overallStatus)) invalid();

  proofString(row.catalogId, /^[a-z][a-z0-9.-]*(?![\s\S])/, 120);
  proofString(row.reportId, /^[A-Za-z0-9][A-Za-z0-9._-]*(?![\s\S])/, 160);
  if (typeof row.target !== 'string' || row.target.length > 300) invalid();
  let target: URL;
  try { target = new URL(row.target); } catch { return invalid(); }
  if (target.protocol !== 'https:' || target.origin !== row.target) invalid();
  for (const date of [row.startedAt, row.completedAt, row.ingestedAt]) {
    if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) invalid();
  }
  contentDigest(row.catalogDigestSha256);
  contentDigest(row.digestSha256);
  sourceCommit(row.scannerSourceRevision);
  const counts = proofRecord(row.counts, countKeys);
  const statuses = proofRecord(row.sectionStatuses, sectionKeys);
  if (!countKeys.every(key => isCount(counts[key])) || !sectionKeys.every(key => isStatus(statuses[key]))) invalid();

  const revision = parseAuditIdentity(row.deployedApplicationRevision, 'revision');
  const image = parseAuditIdentity(row.deployedImageDigest, 'platform-image');
  if ([revision, image].some(identity => identity.state !== 'observed' && typeof identity.reason !== 'string')) invalid();
  return { ...row, deployedApplicationRevision: revision, deployedImageDigest: image } as AuditReportSummaryV2;
}

// The V2 admin cutover consumes the projected list response. The full report
// and catalog remain with the server-side verification and download owners.
export function normalizeSecurityAuditSnapshotV2(value: unknown): AuditReportSnapshotV2 {
  const snapshot = proofRecord(value, ['reports', 'latestExposure', 'latestFull']);
  if (!Array.isArray(snapshot.reports)) invalid();
  const latestExposure = snapshot.latestExposure === null ? null : summary(snapshot.latestExposure);
  const latestFull = snapshot.latestFull === null ? null : summary(snapshot.latestFull);
  if ((latestExposure && latestExposure.reportType !== 'exposure') || (latestFull && latestFull.reportType !== 'full')) invalid();
  return { reports: snapshot.reports.map(summary), latestExposure, latestFull };
}
