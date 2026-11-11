import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import type { AuditReportSummaryV2 } from '../../common/securityAudit/summaryTypes.ts';
import type { AuditIdentityObservation } from '../../common/securityAudit/reportIdentity.ts';
import './adminSecurityAuditsV2.html';
import './adminSecurityAudits.css';
import './shared/adminUi/adminUi';
import { meteorCallAsync } from '../lib/meteorAsync';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime } from '../lib/interfaceFormatting';
import { normalizeSecurityAuditSnapshotV2, securityAuditIsStaleV2, type AuditReportSnapshotV2 } from './adminSecurityAuditsStateV2';

type ViewState = { status: 'loading' | 'ready' | 'error'; snapshot?: AuditReportSnapshotV2; message?: string };
type AuditInstance = Blaze.TemplateInstance & {
  viewState: ReactiveVar<ViewState>;
  announcement: ReactiveVar<string>;
  refreshInterval?: ReturnType<typeof setInterval>;
  destroyed: boolean;
};
type StringKey = Parameters<typeof translatePlatformString>[1];

function text(key: StringKey, values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : text('securityAudits.unknownError');
}
async function refresh(target: AuditInstance): Promise<void> {
  target.viewState.set({ status: 'loading' });
  try {
    const snapshot = normalizeSecurityAuditSnapshotV2(await meteorCallAsync('admin.securityAudits.list'));
    if (target.destroyed) return;
    target.viewState.set({ status: 'ready', snapshot });
    target.announcement.set(text('securityAudits.loaded'));
  } catch (error) {
    if (target.destroyed) return;
    const message = text('securityAudits.loadFailed', { error: errorMessage(error) });
    target.viewState.set({ status: 'error', message });
    target.announcement.set(message);
  }
}
function statusText(status: string): string {
  const keys = {
    PASS: 'securityAudits.statusPass', FAIL: 'securityAudits.statusFail',
    ERROR: 'securityAudits.statusError', NOT_APPLICABLE: 'securityAudits.statusNotApplicable',
  } as const;
  return text(keys[status as keyof typeof keys]);
}
function identityText(identity: AuditIdentityObservation): string {
  if (identity.state === 'observed') return identity.value;
  return text(identity.state === 'conflicting' ? 'securityAudits.conflictingIdentity' : 'securityAudits.unavailableIdentity');
}
function state(): ViewState { return (Template.instance() as AuditInstance).viewState.get(); }

// The existing admin route loads the V2 receiver's bounded summary presentation.
Template.adminSecurityAuditsV2.onCreated(function(this: AuditInstance) {
  this.destroyed = false;
  this.viewState = new ReactiveVar<ViewState>({ status: 'loading' });
  this.announcement = new ReactiveVar('');
  void refresh(this);
  this.refreshInterval = setInterval(() => void refresh(this), 5 * 60 * 1000);
});
Template.adminSecurityAuditsV2.onDestroyed(function(this: AuditInstance) {
  this.destroyed = true;
  if (this.refreshInterval) clearInterval(this.refreshInterval);
});
const reportHelpers = {
  auditText: (key: StringKey, options?: { hash?: Parameters<typeof translatePlatformString>[2] }) => text(key, options?.hash),
  auditStatusClass: (status: string) => status === 'PASS' ? 'success' : status === 'NOT_APPLICABLE' ? 'info' : 'error',
  auditStatusText: statusText,
  auditIsStale: (report: AuditReportSummaryV2) => securityAuditIsStaleV2(report),
  formatAuditDate: (value: string) => formatActiveInterfaceDateTime(value),
  reportTypeText: (reportType: string) => text(reportType === 'full' ? 'securityAudits.full' : 'securityAudits.exposure'),
  auditMetadataRows: (report: AuditReportSummaryV2) => [
    { label: text('securityAudits.scannerRevision'), value: report.scannerSourceRevision },
    { label: text('securityAudits.applicationRevision'), value: identityText(report.deployedApplicationRevision) },
    { label: text('securityAudits.deployedImage'), value: identityText(report.deployedImageDigest) },
    { label: text('securityAudits.catalogVersion'), value: `${report.catalogId} / ${report.catalogVersion}` },
    { label: text('securityAudits.catalogDigest'), value: report.catalogDigestSha256 },
    { label: text('securityAudits.digest'), value: report.digestSha256 },
  ],
  auditSectionRows: (report: AuditReportSummaryV2) => ([
    ['external', 'securityAudits.sectionExternal'], ['authentication', 'securityAudits.sectionAuthentication'],
    ['internal', 'securityAudits.sectionInternal'], ['repository', 'securityAudits.sectionRepository'],
  ] as const).map(([id, key]) => ({ label: text(key), statusText: statusText(report.sectionStatuses[id]) })),
  auditCountRows: (report: AuditReportSummaryV2) => ([
    ['critical', 'securityAudits.critical'], ['high', 'securityAudits.high'], ['medium', 'securityAudits.medium'],
    ['low', 'securityAudits.low'], ['fail', 'securityAudits.failed'], ['error', 'securityAudits.errors'],
  ] as const).map(([id, key]) => ({ label: text(key), value: report.counts[id] })),
};
Template.securityAuditLatestCardV2.helpers(reportHelpers);
Template.adminSecurityAuditsV2.helpers({
  ...reportHelpers,
  auditAnnouncement: () => (Template.instance() as AuditInstance).announcement.get(),
  auditLoading: () => state().status === 'loading',
  auditLoadError: () => state().message,
  latestExposure: () => state().snapshot?.latestExposure,
  latestFull: () => state().snapshot?.latestFull,
  auditReports: () => state().snapshot?.reports,
  hasAuditReports: () => Boolean(state().snapshot?.reports.length),
});
Template.adminSecurityAuditsV2.events({
  'click .securityAuditRetry'(event: Event, target: AuditInstance) {
    event.preventDefault();
    void refresh(target);
  },
  async 'click .securityAuditDownload'(event: Event, target: AuditInstance) {
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;
    button.disabled = true;
    try {
      const result = await meteorCallAsync('admin.securityAudits.downloadToken', button.dataset.reportId, button.dataset.format) as { url?: string };
      if (!result.url) throw new Error(text('securityAudits.downloadFailed'));
      if (target.destroyed) return;
      const link = document.createElement('a');
      link.href = result.url;
      link.download = '';
      document.body.append(link);
      link.click();
      link.remove();
      target.announcement.set(text('securityAudits.downloadReady'));
    } catch (error) {
      if (!target.destroyed) target.announcement.set(text('securityAudits.downloadFailedWithError', { error: errorMessage(error) }));
    } finally {
      button.disabled = false;
      if (button.isConnected) button.focus();
    }
  },
});
