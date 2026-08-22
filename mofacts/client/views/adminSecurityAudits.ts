import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import './adminSecurityAudits.html';
import './adminSecurityAudits.css';
import './shared/adminUi/adminUi';
import { meteorCallAsync } from '..';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime } from '../lib/interfaceFormatting';
import {
  normalizeSecurityAuditSnapshot,
  securityAuditIsStale,
  type SecurityAuditSnapshot,
  type SecurityAuditSummary,
} from './adminSecurityAuditsState';

type ViewState = { status: 'loading' | 'ready' | 'error'; snapshot?: SecurityAuditSnapshot; message?: string };
type AdminSecurityAuditsInstance = Blaze.TemplateInstance & {
  viewState: ReactiveVar<ViewState>;
  announcement: ReactiveVar<string>;
  refreshInterval?: ReturnType<typeof setInterval>;
};

let activeInstance: AdminSecurityAuditsInstance | null = null;

function instance(): AdminSecurityAuditsInstance {
  if (!activeInstance) throw new Error('Security audit admin state is not initialized');
  return activeInstance;
}

function auditText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || auditText('securityAudits.unknownError'));
}

async function refreshAudits(target: AdminSecurityAuditsInstance): Promise<void> {
  const previousSnapshot = target.viewState.get().snapshot;
  target.viewState.set(previousSnapshot ? { status: 'loading', snapshot: previousSnapshot } : { status: 'loading' });
  try {
    const result = normalizeSecurityAuditSnapshot(await meteorCallAsync('admin.securityAudits.list'));
    target.viewState.set({ status: 'ready', snapshot: result });
    target.announcement.set(auditText('securityAudits.loaded'));
  } catch (error) {
    target.viewState.set({ status: 'error', message: auditText('securityAudits.loadFailed', { error: errorMessage(error) }) });
    target.announcement.set(auditText('securityAudits.loadFailed', { error: errorMessage(error) }));
  }
}

function statusText(status: string): string {
  const keys = {
    PASS: 'securityAudits.statusPass', FAIL: 'securityAudits.statusFail', ERROR: 'securityAudits.statusError', NOT_APPLICABLE: 'securityAudits.statusNotApplicable',
  } as const;
  return auditText(keys[status as keyof typeof keys] || 'securityAudits.statusError');
}

Template.adminSecurityAudits.onCreated(function(this: AdminSecurityAuditsInstance) {
  activeInstance = this;
  this.viewState = new ReactiveVar<ViewState>({ status: 'loading' });
  this.announcement = new ReactiveVar('');
  void refreshAudits(this);
  this.refreshInterval = setInterval(() => void refreshAudits(this), 5 * 60 * 1000);
});

Template.adminSecurityAudits.onDestroyed(function(this: AdminSecurityAuditsInstance) {
  if (this.refreshInterval) clearInterval(this.refreshInterval);
  if (activeInstance === this) activeInstance = null;
});

const helpers = {
  auditText: (
    key: Parameters<typeof translatePlatformString>[1],
    options?: { hash?: Parameters<typeof translatePlatformString>[2] }
  ) => auditText(key, options?.hash),
  auditAnnouncement: () => instance().announcement.get(),
  auditLoading: () => instance().viewState.get().status === 'loading',
  auditLoadError: () => instance().viewState.get().message || '',
  latestExposure: () => instance().viewState.get().snapshot?.latestExposure || null,
  latestFull: () => instance().viewState.get().snapshot?.latestFull || null,
  auditReports: () => instance().viewState.get().snapshot?.reports || [],
  hasAuditReports: () => Boolean(instance().viewState.get().snapshot?.reports.length),
  auditStatusClass: (status: string) => status === 'PASS' ? 'success' : status === 'FAIL' ? 'error' : status === 'ERROR' ? 'error' : 'info',
  auditStatusText: statusText,
  auditIsStale: (report: SecurityAuditSummary) => securityAuditIsStale(report),
  formatAuditDate: (value: string) => formatActiveInterfaceDateTime(value),
  reportTypeText: (reportType: string) => auditText(reportType === 'full' ? 'securityAudits.full' : 'securityAudits.exposure'),
  auditSectionRows: (report: SecurityAuditSummary) => [
    ['external', 'securityAudits.sectionExternal'],
    ['authentication', 'securityAudits.sectionAuthentication'],
    ['internal', 'securityAudits.sectionInternal'],
    ['repository', 'securityAudits.sectionRepository'],
  ].map(([id, key]) => ({ label: auditText(key as Parameters<typeof translatePlatformString>[1]), statusText: statusText(report.sectionStatuses[id!] || 'ERROR') })),
  auditCountRows: (report: SecurityAuditSummary) => [
    ['critical', 'securityAudits.critical'], ['high', 'securityAudits.high'], ['medium', 'securityAudits.medium'],
    ['low', 'securityAudits.low'], ['fail', 'securityAudits.failed'], ['error', 'securityAudits.errors'],
  ].map(([id, key]) => ({ label: auditText(key as Parameters<typeof translatePlatformString>[1]), value: report.counts[id!] ?? 0 })),
};

Template.adminSecurityAudits.helpers(helpers);
Template.securityAuditLatestCard.helpers(helpers);

Template.adminSecurityAudits.events({
  'click .securityAuditRetry'(event: Event) {
    event.preventDefault();
    void refreshAudits(instance());
  },
  async 'click .securityAuditDownload'(event: Event) {
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    const reportId = button.dataset.reportId || '';
    const format = button.dataset.format === 'html' ? 'html' : 'json';
    button.disabled = true;
    try {
      const result = await meteorCallAsync('admin.securityAudits.downloadToken', reportId, format) as { url?: string };
      if (!result.url) throw new Error(auditText('securityAudits.downloadFailed'));
      const link = document.createElement('a');
      link.href = result.url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
      instance().announcement.set(auditText('securityAudits.downloadReady'));
    } catch (error) {
      instance().announcement.set(auditText('securityAudits.downloadFailedWithError', { error: errorMessage(error) }));
    } finally {
      button.disabled = false;
      button.focus();
    }
  },
});
