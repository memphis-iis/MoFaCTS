import crypto from 'node:crypto';
import {
  SECURITY_AUDIT_SECTION_IDS,
  canonicalJson,
  type SecurityAuditReportV1,
  type SecurityAuditStatus,
} from '../../common/securityAuditReport';
import type { StoredSecurityAuditReport } from './securityAuditStorage';

export type SecurityAuditReportSummary = {
  reportId: string;
  reportType: 'exposure' | 'full';
  startedAt: string;
  completedAt: string;
  target: string;
  sourceRevision: string;
  productionImage: string;
  digestSha256: string;
  overallStatus: SecurityAuditStatus;
  sectionStatuses: Record<string, SecurityAuditStatus>;
  counts: SecurityAuditReportV1['counts'];
  executionErrorCount: number;
  ingestedAt: string;
};

export function securityAuditReportSummary(report: StoredSecurityAuditReport): SecurityAuditReportSummary {
  const sectionStatuses = Object.fromEntries(
    SECURITY_AUDIT_SECTION_IDS.map((sectionId) => [sectionId, report.sections[sectionId].status]),
  );
  const overallStatus: SecurityAuditStatus = report.executionErrors.length || Object.values(sectionStatuses).includes('ERROR')
    ? 'ERROR'
    : Object.values(sectionStatuses).includes('FAIL') ? 'FAIL'
      : Object.values(sectionStatuses).includes('PASS') ? 'PASS' : 'NOT_APPLICABLE';
  return {
    reportId: report.reportId,
    reportType: report.reportType,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    target: report.target,
    sourceRevision: report.sourceRevision,
    productionImage: report.productionImage,
    digestSha256: report.digestSha256,
    overallStatus,
    sectionStatuses,
    counts: report.counts,
    executionErrorCount: report.executionErrors.length,
    ingestedAt: report.ingestedAt.toISOString(),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSecurityAuditHtml(report: SecurityAuditReportV1): string {
  const sectionHtml = SECURITY_AUDIT_SECTION_IDS.map((sectionId) => {
    const section = report.sections[sectionId];
    const rows = section.controls.map((control) => {
      const observations = control.evidence.observations?.length
        ? `<ul>${control.evidence.observations.map((observation) => `<li>${escapeHtml(observation)}</li>`).join('')}</ul>` : '';
      const metrics = control.evidence.metrics
        ? `<dl>${Object.entries(control.evidence.metrics).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>` : '';
      return `
      <tr><td>${escapeHtml(control.controlId)}</td><td>${escapeHtml(control.status)}</td><td>${escapeHtml(control.severity)}</td><td>${escapeHtml(control.title)}</td><td>${escapeHtml(control.evidence.summary)}${observations}${metrics}</td></tr>`;
    }).join('');
    return `<section><h2>${escapeHtml(sectionId)}: ${escapeHtml(section.status)}</h2><table><thead><tr><th>Control</th><th>Status</th><th>Severity</th><th>Title</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const executionErrors = report.executionErrors.length
    ? `<section><h2>Execution errors</h2><ul>${report.executionErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><meta name="viewport" content="width=device-width"><title>Security audit ${escapeHtml(report.reportId)}</title></head><body><main><h1>Security audit report</h1><dl><dt>Report ID</dt><dd>${escapeHtml(report.reportId)}</dd><dt>Type</dt><dd>${escapeHtml(report.reportType)}</dd><dt>Target</dt><dd>${escapeHtml(report.target)}</dd><dt>Started</dt><dd>${escapeHtml(report.startedAt)}</dd><dt>Completed</dt><dd>${escapeHtml(report.completedAt)}</dd><dt>Source revision</dt><dd>${escapeHtml(report.sourceRevision)}</dd><dt>Production image</dt><dd>${escapeHtml(report.productionImage)}</dd><dt>Report digest</dt><dd>${escapeHtml(report.digestSha256)}</dd></dl>${executionErrors}${sectionHtml}</main></body></html>`;
}

export function securityAuditDownloadBytes(
  report: SecurityAuditReportV1,
  format: 'json' | 'html',
): { body: Buffer; contentType: string; fileName: string; sha256: string } {
  const text = format === 'json' ? `${canonicalJson(report)}\n` : `${renderSecurityAuditHtml(report)}\n`;
  const body = Buffer.from(text, 'utf8');
  return {
    body,
    contentType: format === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    fileName: `${report.reportId}.${format}`,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
  };
}
