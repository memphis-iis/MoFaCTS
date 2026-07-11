import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './adminBackups.html';
import './adminBackups.css';
import './shared/adminUi/adminUi';
import { meteorCallAsync } from '..';
import { clientConsole } from '../lib/userSessionHelpers';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime } from '../lib/interfaceFormatting';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../lib/adminUi/loadableState';
import {
  createTemplateLifetime,
  type TemplateLifetime,
} from '../lib/adminUi/templateLifetime';
import {
  createInlineConfirmationController,
  type InlineConfirmationController,
  type InlineConfirmationView,
} from '../lib/adminUi/inlineConfirmationController';
import {
  backupSnapshotIsEmpty,
  getBackupLoadPresentation,
  normalizeBackupSnapshot,
  type BackupConfig,
  type BackupJob,
  type BackupSnapshot,
} from './adminBackupsState';

const BACKUP_MESSAGE_KEY = 'adminBackupsMessage';
const BACKUP_BUSY_KEY = 'adminBackupsBusy';
const BACKUP_SELECTED_MANIFEST_KEY = 'adminBackupsSelectedManifest';

type BackupConfirmationContext = Readonly<{
  action: 'restore' | 'delete';
  job: BackupJob;
}>;

type AdminBackupsInstance = Blaze.TemplateInstance & {
  loadState: ReactiveVar<LoadableState<BackupSnapshot>>;
  lifetime: TemplateLifetime;
  confirmationState: ReactiveVar<InlineConfirmationView>;
  confirmationController: InlineConfirmationController<BackupConfirmationContext>;
};

let activeAdminBackupsInstance: AdminBackupsInstance | null = null;

function currentAdminBackupsInstance(): AdminBackupsInstance {
  if (!activeAdminBackupsInstance) {
    throw new Error('Admin Backups template state is not initialized.');
  }
  return activeAdminBackupsInstance;
}

function backupText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return err ? String(err) : backupText('admin.unknownError');
}

function setBackupMessage(text: string | null, level = 'info'): void {
  if (!text) {
    Session.set(BACKUP_MESSAGE_KEY, null);
    return;
  }
  Session.set(BACKUP_MESSAGE_KEY, {
    text,
    level,
  });
}

function backupSnapshotFromState(
  state: LoadableState<BackupSnapshot>,
): BackupSnapshot | undefined {
  if (
    state.status === 'ready'
    || state.status === 'empty'
    || state.status === 'refreshing'
    || state.status === 'refresh-error'
  ) {
    return state.value;
  }
  return undefined;
}

async function refreshBackups(instance: AdminBackupsInstance): Promise<boolean> {
  const requestId = instance.lifetime.begin();
  instance.loadState.set(startLoad(instance.loadState.get(), requestId));
  try {
    const [config, jobs] = await Promise.all([
      meteorCallAsync('admin.backups.config'),
      meteorCallAsync('admin.backups.list'),
    ]);
    if (!instance.lifetime.isCurrent(requestId)) {
      return false;
    }
    const snapshot = normalizeBackupSnapshot(config, jobs);
    instance.loadState.set(resolveLoad(
      instance.loadState.get(),
      requestId,
      snapshot,
      backupSnapshotIsEmpty,
    ));
    return true;
  } catch (error: unknown) {
    if (!instance.lifetime.isCurrent(requestId)) {
      return false;
    }
    instance.loadState.set(rejectLoad(instance.loadState.get(), requestId, {
      message: backupText('admin.failedLoadBackups', { error: formatError(error) }),
      retryable: true,
    }));
    return false;
  }
}

Template.adminBackups.onCreated(function(this: AdminBackupsInstance) {
  activeAdminBackupsInstance = this;
  this.loadState = new ReactiveVar<LoadableState<BackupSnapshot>>({ status: 'idle' });
  this.lifetime = createTemplateLifetime();
  this.confirmationController = createInlineConfirmationController<BackupConfirmationContext>(
    (view) => this.confirmationState.set(view),
    () => this.find('[data-confirmation-return-fallback]') as HTMLElement | null,
  );
  this.confirmationState = new ReactiveVar(this.confirmationController.getView());
  Session.set(BACKUP_BUSY_KEY, false);
  Session.set(BACKUP_SELECTED_MANIFEST_KEY, null);
  setBackupMessage(null);
  void refreshBackups(this);
});

Template.adminBackups.onDestroyed(function(this: AdminBackupsInstance) {
  this.lifetime.destroy();
  this.confirmationController.destroy();
  if (activeAdminBackupsInstance === this) {
    activeAdminBackupsInstance = null;
  }
  Session.set(BACKUP_BUSY_KEY, false);
  Session.set(BACKUP_SELECTED_MANIFEST_KEY, null);
  setBackupMessage(null);
});

Template.adminBackups.helpers({
  backupMessage() {
    return Session.get(BACKUP_MESSAGE_KEY);
  },
  backupConfig() {
    const state = currentAdminBackupsInstance().loadState.get();
    return backupSnapshotFromState(state)?.config;
  },
  parentBackupJobs() {
    const state = currentAdminBackupsInstance().loadState.get();
    return backupSnapshotFromState(state)?.jobs ?? [];
  },
  backupParentReadyClass() {
    return currentBackupPresentation().showRows ? '' : 'admin-async-state-hidden';
  },
  backupAsyncBusy() {
    return currentBackupPresentation().busy ? 'true' : 'false';
  },
  isBusy() {
    const state = currentAdminBackupsInstance().loadState.get();
    return Session.get(BACKUP_BUSY_KEY) === true || !backupSnapshotFromState(state);
  },
  selectedManifest() {
    return Session.get(BACKUP_SELECTED_MANIFEST_KEY);
  },
  backupConfirmationView() {
    return currentAdminBackupsInstance().confirmationState.get();
  },
  backupText(key: Parameters<typeof translatePlatformString>[1]) {
    return backupText(key);
  },
  enabledLabel(value: unknown) {
    return value ? backupText('admin.enabled') : backupText('admin.disabled');
  },
  destinationLabel(destination: BackupConfig['destination']) {
    if (!destination) {
      return backupText('admin.notConfigured');
    }
    if (destination.backend === 's3') {
      return `s3://${destination.bucket || '<bucket>'}/${destination.prefix || ''}`;
    }
    return `${destination.backend || 'local'} ${destination.path || ''}`.trim();
  },
  formatDate(value: Date | string | undefined) {
    if (!value) {
      return '';
    }
    return formatActiveInterfaceDateTime(value);
  },
  formatBytes(value: number | undefined) {
    if (!Number.isFinite(value || NaN)) {
      return '';
    }
    const bytes = Number(value);
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
  statusLevel(status: string | undefined) {
    if (status === 'complete' || status === 'verified') {
      return 'success';
    }
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'running') {
      return 'warning';
    }
    return '';
  },
  canVerify(jobType: string | undefined, status: string | undefined) {
    return jobType === 'backup' && (status === 'complete' || status === 'verified' || status === 'failed');
  },
  canRestore(jobType: string | undefined, status: string | undefined) {
    return jobType === 'backup' && (status === 'complete' || status === 'verified');
  },
  canDelete(jobType: string | undefined, status: string | undefined, archiveFileName: string | undefined) {
    return jobType === 'backup'
      && Boolean(archiveFileName)
      && (status === 'complete' || status === 'verified' || status === 'failed');
  },
});

function currentBackupPresentation() {
  return getBackupLoadPresentation(currentAdminBackupsInstance().loadState.get());
}

function visibilityClass(visible: boolean): string {
  return visible ? '' : 'admin-async-state-hidden';
}

Template.adminBackupsAsyncContent.helpers({
  backupText(key: Parameters<typeof translatePlatformString>[1]) {
    return backupText(key);
  },
  backupLoadingClass() {
    return visibilityClass(currentBackupPresentation().showLoading);
  },
  backupErrorClass() {
    return visibilityClass(currentBackupPresentation().showError);
  },
  backupEmptyClass() {
    return visibilityClass(currentBackupPresentation().showEmpty);
  },
  backupRefreshingClass() {
    return visibilityClass(currentBackupPresentation().showRefreshing);
  },
  backupRefreshErrorClass() {
    return visibilityClass(currentBackupPresentation().showRefreshError);
  },
  backupLoadError() {
    return currentBackupPresentation().message;
  },
});

Template.adminBackups.events({
  'click .admin-async-retry': function(event: Event, instance: AdminBackupsInstance) {
    event.preventDefault();
    void refreshBackups(instance);
  },
  'click #createBackupButton': async function(_event: Event, instance: AdminBackupsInstance) {
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.creatingBackup'), 'info');
    try {
      await meteorCallAsync('admin.backups.create');
      await refreshBackups(instance);
      setBackupMessage(backupText('admin.backupCompleted'), 'success');
    } catch (error) {
      clientConsole(1, '[Backups] Create failed:', error);
      await refreshBackups(instance);
      setBackupMessage(backupText('admin.backupFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
  'click .verifyBackupButton': async function(event: Event, instance: AdminBackupsInstance) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.verifyingBackupArchive'), 'info');
    try {
      await meteorCallAsync('admin.backups.verify', jobId);
      await refreshBackups(instance);
      setBackupMessage(backupText('admin.backupVerificationFinished'), 'success');
    } catch (error) {
      await refreshBackups(instance);
      setBackupMessage(backupText('admin.verificationFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
  'click .viewManifestButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    try {
      const job = await meteorCallAsync('admin.backups.get', jobId) as BackupJob;
      Session.set(BACKUP_SELECTED_MANIFEST_KEY, JSON.stringify(job.manifest || {}, null, 2));
    } catch (error) {
      setBackupMessage(backupText('admin.manifestLoadFailed', { error: formatError(error) }), 'error');
    }
  },
  'click .downloadBackupButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.preparingDownloadLink'), 'info');
    try {
      const result = await meteorCallAsync('admin.backups.downloadToken', jobId) as { url?: string };
      if (!result.url) {
        throw new Error(backupText('admin.downloadUrlMissing'));
      }
      setBackupMessage(backupText('admin.downloadStartingSensitive'), 'success');
      window.location.assign(result.url);
    } catch (error) {
      setBackupMessage(backupText('admin.downloadFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
  'click .restoreBackupButton': function(event: Event, instance: AdminBackupsInstance) {
    const trigger = event.currentTarget as HTMLElement | null;
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId || !trigger) {
      return;
    }
    const job = backupSnapshotFromState(instance.loadState.get())?.jobs
      .find((candidate) => candidate._id === jobId);
    if (!job) {
      setBackupMessage(backupText('admin.failedLoadBackups', {
        error: `Backup job ${jobId} is no longer available.`,
      }), 'error');
      return;
    }
    instance.confirmationController.open({
      confirmationId: `restore-backup-${jobId}`,
      title: backupText('admin.confirmRestore'),
      message: backupText('admin.restoreWarningDescription'),
      confirmLabel: backupText('admin.restore'),
      cancelLabel: backupText('content.cancel'),
      severity: 'danger',
      context: { action: 'restore', job },
      inputLabel: backupText('admin.restoreConfirmationPhrase'),
      inputValueRequired: true,
    }, trigger);
    setBackupMessage(backupText('admin.typeRestoreToRun'), 'info');
    Tracker.afterFlush(() => instance.confirmationController.focusInitial());
  },
  'click .deleteBackupButton': function(event: Event, instance: AdminBackupsInstance) {
    const trigger = event.currentTarget as HTMLElement | null;
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId || !trigger) {
      return;
    }
    const job = backupSnapshotFromState(instance.loadState.get())?.jobs
      .find((candidate) => candidate._id === jobId);
    if (!job) {
      setBackupMessage(backupText('admin.failedLoadBackups', {
        error: `Backup job ${jobId} is no longer available.`,
      }), 'error');
      return;
    }
    instance.confirmationController.open({
      confirmationId: `delete-backup-${jobId}`,
      title: backupText('admin.confirmDelete'),
      message: backupText('admin.deleteWarningDescription'),
      confirmLabel: backupText('admin.delete'),
      cancelLabel: backupText('content.cancel'),
      severity: 'danger',
      context: { action: 'delete', job },
      inputLabel: backupText('admin.deleteConfirmationPhrase'),
      inputValueRequired: true,
    }, trigger);
    setBackupMessage(backupText('admin.typeDeleteToRemove'), 'info');
    Tracker.afterFlush(() => instance.confirmationController.focusInitial());
  },
  'click .admin-confirmation-cancel': function(_event: Event, instance: AdminBackupsInstance) {
    const action = instance.confirmationController.getContext()?.action;
    if (!instance.confirmationController.cancel()) {
      return;
    }
    setBackupMessage(
      backupText(action === 'restore' ? 'admin.restoreCancelled' : 'admin.deleteCancelled'),
      'info',
    );
  },
  'keydown .admin-inline-confirmation': function(event: KeyboardEvent, instance: AdminBackupsInstance) {
    instance.confirmationController.handleKeydown(event);
  },
  'click .admin-confirmation-confirm': async function(_event: Event, instance: AdminBackupsInstance) {
    const view = instance.confirmationController.getView();
    const context = instance.confirmationController.getContext();
    if (view.status !== 'open' || view.pending || !context) {
      return;
    }
    const input = document.getElementById(`${view.confirmationId}-input`) as HTMLInputElement | null;
    const confirmation = (input?.value || '').trim().toUpperCase();
    const expectedPhrase = context.action === 'restore' ? 'RESTORE' : 'DELETE';
    if (confirmation !== expectedPhrase) {
      instance.confirmationController.cancel();
      setBackupMessage(backupText(
        context.action === 'restore'
          ? 'admin.restorePhraseMismatch'
          : 'admin.deletePhraseMismatch',
      ), 'info');
      return;
    }
    instance.confirmationController.setPending(true);
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText(
      context.action === 'restore'
        ? 'admin.restoringBackup'
        : 'admin.deletingBackupArchive',
    ), 'info');
    try {
      await meteorCallAsync(
        context.action === 'restore' ? 'admin.backups.restore' : 'admin.backups.delete',
        context.job._id,
        confirmation,
      );
      await refreshBackups(instance);
      instance.confirmationController.complete();
      setBackupMessage(backupText(
        context.action === 'restore'
          ? 'admin.restoreCompleted'
          : 'admin.backupArchiveDeleted',
      ), 'success');
    } catch (error) {
      await refreshBackups(instance);
      instance.confirmationController.setPending(false);
      setBackupMessage(backupText(
        context.action === 'restore' ? 'admin.restoreFailed' : 'admin.deleteFailed',
        { error: formatError(error) },
      ), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
});
