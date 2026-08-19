import { Meteor } from 'meteor/meteor';
import { issueSecurityAuditDownloadToken, type SecurityAuditDownloadFormat } from '../securityAudit/securityAuditDownloadTokens';
import { securityAuditReportSummary } from '../securityAudit/securityAuditPresentation';
import type { StoredSecurityAuditReport } from '../securityAudit/securityAuditStorage';

type MethodContext = { userId?: string | null };
type SecurityAuditRegistry = {
  find(selector?: Record<string, unknown>, options?: Record<string, unknown>): { fetchAsync(): Promise<StoredSecurityAuditReport[]> };
  findOneAsync(selector: Record<string, unknown>): Promise<StoredSecurityAuditReport | null | undefined>;
};

export function createSecurityAuditMethods(deps: {
  reports: SecurityAuditRegistry;
  requireAdminUser: (userId: string | null | undefined, message?: string, code?: string | number) => Promise<void>;
}) {
  async function requireAdmin(context: MethodContext): Promise<string> {
    await deps.requireAdminUser(context.userId, 'Only admins can view security audits', 'not-authorized');
    return String(context.userId);
  }

  return {
    'admin.securityAudits.list': async function(this: MethodContext) {
      await requireAdmin(this);
      const reports = await deps.reports.find({}, { sort: { completedAt: -1 }, limit: 200 }).fetchAsync();
      const summaries = reports.map(securityAuditReportSummary);
      return {
        generatedAt: new Date().toISOString(),
        latestExposure: summaries.find((report) => report.reportType === 'exposure') || null,
        latestFull: summaries.find((report) => report.reportType === 'full') || null,
        reports: summaries,
      };
    },

    'admin.securityAudits.get': async function(this: MethodContext, reportId: unknown) {
      await requireAdmin(this);
      const normalized = typeof reportId === 'string' ? reportId.trim() : '';
      if (!normalized) throw new Meteor.Error('invalid-report-id', 'Security audit report ID is required');
      const report = await deps.reports.findOneAsync({ reportId: normalized });
      if (!report) throw new Meteor.Error('not-found', 'Security audit report not found');
      return securityAuditReportSummary(report);
    },

    'admin.securityAudits.downloadToken': async function(
      this: MethodContext,
      reportId: unknown,
      format: unknown,
    ) {
      const userId = await requireAdmin(this);
      const normalized = typeof reportId === 'string' ? reportId.trim() : '';
      if (!normalized) throw new Meteor.Error('invalid-report-id', 'Security audit report ID is required');
      if (format !== 'json' && format !== 'html') throw new Meteor.Error('invalid-download-format', 'Security audit download format is invalid');
      const report = await deps.reports.findOneAsync({ reportId: normalized });
      if (!report) throw new Meteor.Error('not-found', 'Security audit report not found');
      const issued = issueSecurityAuditDownloadToken({
        reportId: report.reportId,
        format: format as SecurityAuditDownloadFormat,
        createdByUserId: userId,
      });
      return {
        url: `/admin/security-audits/download/${encodeURIComponent(issued.token)}/${encodeURIComponent(report.reportId)}.${format}`,
        expiresAt: issued.expiresAt.toISOString(),
      };
    },
  };
}
