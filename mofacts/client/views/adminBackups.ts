import { Template } from 'meteor/templating';
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
  createScopedAsyncCommandRegistry,
  type ScopedAsyncCommandRegistry,
} from '../lib/adminUi/scopedAsyncCommandRegistry';
import {
  type AsyncCommandState,
} from '../lib/adminUi/asyncCommandState';
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

type BackupConfirmationContext = Readonly<{
  action: 'restore' | 'delete';
  job: BackupJob;
}>;

type BackupCommandResult = Readonly<{ message: string; level?: 'info' | 'success' }>;
type BackupMessage = Readonly<{ text: string; level: 'info' | 'success' | 'warning' | 'error' }>;
type SelectedManifest = Readonly<{ jobId: string; text: string }>;

type AdminBackupsInstance = Blaze.TemplateInstance & {
  loadState: ReactiveVar<LoadableState<BackupSnapshot>>;
  lifetime: TemplateLifetime;
  confirmationState: ReactiveVar<InlineConfirmationView>;
  confirmationController: InlineConfirmationController<BackupConfirmationContext>;
  commandStates: ReactiveVar<Record<string, AsyncCommandState<BackupCommandResult>>>;
  commandRegistry: ScopedAsyncCommandRegistry<BackupCommandResult>;
  localMessages: ReactiveVar<Record<string, BackupMessage>>;
  selectedManifest: ReactiveVar<SelectedManifest | null>;
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

function backupScope(action: string, jobId?: string): string {
  return `backup:${action}${jobId ? `:${jobId}` : ''}`;
}

function setBackupLocalMessage(instance: AdminBackupsInstance, scope: string, message: BackupMessage | null): void {
  const messages = { ...instance.localMessages.get() };
  if (message) messages[scope] = message;
  else delete messages[scope];
  instance.localMessages.set(messages);
}

function pendingBackupMessage(scope: string): string {
  if (scope === backupScope('create')) return backupText('admin.creatingBackup');
  if (scope.startsWith(`${backupScope('verify')}:`)) return backupText('admin.verifyingBackupArchive');
  if (scope.startsWith(`${backupScope('manifest')}:`)) return backupText('common.loading');
  if (scope.startsWith(`${backupScope('download')}:`)) return backupText('admin.preparingDownloadLink');
  if (scope.startsWith(`${backupScope('restore')}:`)) return backupText('admin.restoringBackup');
  if (scope.startsWith(`${backupScope('delete')}:`)) return backupText('admin.deletingBackupArchive');
  return backupText('common.loading');
}

function commandMessage(instance: AdminBackupsInstance, scope: string): BackupMessage | null {
  const local = instance.localMessages.get()[scope];
  if (local) return local;
  const state = instance.commandStates.get()[scope];
  if (!state || state.status === 'idle') return null;
  if (state.status === 'pending') return { text: pendingBackupMessage(scope), level: 'info' };
  if (state.status === 'error') return { text: state.message, level: 'error' };
  if (!state.result.message) return null;
  return { text: state.result.message, level: state.result.level ?? 'success' };
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
  this.commandStates = new ReactiveVar({});
  this.commandRegistry = createScopedAsyncCommandRegistry<BackupCommandResult>((scope, state) => {
    this.commandStates.set({ ...this.commandStates.get(), [scope]: state });
  });
  this.localMessages = new ReactiveVar({});
  this.selectedManifest = new ReactiveVar<SelectedManifest | null>(null);
  void refreshBackups(this);
});

Template.adminBackups.onDestroyed(function(this: AdminBackupsInstance) {
  this.lifetime.destroy();
  this.confirmationController.destroy();
  this.commandRegistry.destroy();
  if (activeAdminBackupsInstance === this) {
    activeAdminBackupsInstance = null;
  }
});

Template.adminBackups.helpers({
  backupMessage(scope = 'create') {
    return commandMessage(currentAdminBackupsInstance(), backupScope(scope));
  },
  backupRowMessages(jobId: string) {
    const instance = currentAdminBackupsInstance();
    return ['manifest', 'verify', 'download', 'restore', 'delete']
      .map((action) => commandMessage(instance, backupScope(action, jobId)))
      .filter((message): message is BackupMessage => Boolean(message));
  },
  backupHistoryMessage() {
    return commandMessage(currentAdminBackupsInstance(), backupScope('history'));
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
  backupUnavailable() {
    const state = currentAdminBackupsInstance().loadState.get();
    return !backupSnapshotFromState(state);
  },
  backupCommandAttrs(action: string, jobId?: string) {
    const scope = backupScope(action, jobId);
    const pending = currentAdminBackupsInstance().commandStates.get()[scope]?.status === 'pending';
    const unavailable = !backupSnapshotFromState(currentAdminBackupsInstance().loadState.get());
    return pending || unavailable
      ? { disabled: true, ...(pending ? { 'aria-busy': 'true' } : {}) }
      : {};
  },
  backupRowManifest(jobId: string) {
    const selected = currentAdminBackupsInstance().selectedManifest.get();
    return selected?.jobId === jobId ? selected.text : null;
  },
  backupConfirmationView() {
    return currentAdminBackupsInstance().confirmationState.get();
  },
  backupRowConfirmation(jobId: string) {
    const instance = currentAdminBackupsInstance();
    const confirmation = instance.confirmationState.get();
    return instance.confirmationController.getContext()?.job._id === jobId
      ? confirmation
      : null;
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
    const scope = backupScope('create');
    setBackupLocalMessage(instance, scope, null);
    await instance.commandRegistry.run(scope, async () => {
      await meteorCallAsync('admin.backups.create');
      await refreshBackups(instance);
      return { message: backupText('admin.backupCompleted') };
    }, {
      getErrorMessage: (error) => backupText('admin.backupFailed', { error: formatError(error) }),
      onFailure: (error) => {
        clientConsole(1, '[Backups] Create failed:', error);
        void refreshBackups(instance);
      },
    });
  },
  'click .verifyBackupButton': async function(event: Event, instance: AdminBackupsInstance) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const scope = backupScope('verify', jobId);
    setBackupLocalMessage(instance, scope, null);
    await instance.commandRegistry.run(scope, async () => {
      await meteorCallAsync('admin.backups.verify', jobId);
      await refreshBackups(instance);
      return { message: backupText('admin.backupVerificationFinished') };
    }, {
      getErrorMessage: (error) => backupText('admin.verificationFailed', { error: formatError(error) }),
      onFailure: () => void refreshBackups(instance),
    });
  },
  'click .viewManifestButton': async function(event: Event, instance: AdminBackupsInstance) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const scope = backupScope('manifest', jobId);
    setBackupLocalMessage(instance, scope, null);
    await instance.commandRegistry.run(scope, async () => {
      const job = await meteorCallAsync('admin.backups.get', jobId) as BackupJob;
      instance.selectedManifest.set({ jobId, text: JSON.stringify(job.manifest || {}, null, 2) });
      return { message: '' };
    }, {
      getErrorMessage: (error) => backupText('admin.manifestLoadFailed', { error: formatError(error) }),
    });
  },
  'click .downloadBackupButton': async function(event: Event, instance: AdminBackupsInstance) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const scope = backupScope('download', jobId);
    setBackupLocalMessage(instance, scope, null);
    await instance.commandRegistry.run(scope, async () => {
      const result = await meteorCallAsync('admin.backups.downloadToken', jobId) as { url?: string };
      if (!result.url) {
        throw new Error(backupText('admin.downloadUrlMissing'));
      }
      window.location.assign(result.url);
      return { message: backupText('admin.downloadStartingSensitive') };
    }, {
      getErrorMessage: (error) => backupText('admin.downloadFailed', { error: formatError(error) }),
    });
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
      setBackupLocalMessage(instance, backupScope('restore', jobId), {
        text: backupText('admin.failedLoadBackups', { error: `Backup job ${jobId} is no longer available.` }),
        level: 'error',
      });
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
    setBackupLocalMessage(instance, backupScope('restore', jobId), {
      text: backupText('admin.typeRestoreToRun'), level: 'info',
    });
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
      setBackupLocalMessage(instance, backupScope('delete', jobId), {
        text: backupText('admin.failedLoadBackups', { error: `Backup job ${jobId} is no longer available.` }),
        level: 'error',
      });
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
    setBackupLocalMessage(instance, backupScope('delete', jobId), {
      text: backupText('admin.typeDeleteToRemove'), level: 'info',
    });
    Tracker.afterFlush(() => instance.confirmationController.focusInitial());
  },
  'click .admin-confirmation-cancel': function(_event: Event, instance: AdminBackupsInstance) {
    const context = instance.confirmationController.getContext();
    const action = context?.action;
    if (!instance.confirmationController.cancel()) {
      return;
    }
    if (context) {
      setBackupLocalMessage(instance, backupScope(context.action, context.job._id), {
        text: backupText(action === 'restore' ? 'admin.restoreCancelled' : 'admin.deleteCancelled'),
        level: 'info',
      });
    }
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
      setBackupLocalMessage(instance, backupScope(context.action, context.job._id), {
        text: backupText(context.action === 'restore' ? 'admin.restorePhraseMismatch' : 'admin.deletePhraseMismatch'),
        level: 'warning',
      });
      return;
    }
    instance.confirmationController.setPending(true);
    const scope = backupScope(context.action, context.job._id);
    setBackupLocalMessage(instance, scope, null);
    await instance.commandRegistry.run(scope, async () => {
      await meteorCallAsync(
        context.action === 'restore' ? 'admin.backups.restore' : 'admin.backups.delete',
        context.job._id,
        confirmation,
      );
      await refreshBackups(instance);
      return {
        message: backupText(context.action === 'restore' ? 'admin.restoreCompleted' : 'admin.backupArchiveDeleted'),
      };
    }, {
      getErrorMessage: (error) => backupText(
        context.action === 'restore' ? 'admin.restoreFailed' : 'admin.deleteFailed',
        { error: formatError(error) },
      ),
      onSuccess: (result) => {
        instance.confirmationController.complete();
        if (context.action === 'delete') {
          setBackupLocalMessage(instance, backupScope('history'), { text: result.message, level: 'success' });
        }
      },
      onFailure: () => {
        instance.confirmationController.setPending(false);
        void refreshBackups(instance);
      },
    });
  },
});
