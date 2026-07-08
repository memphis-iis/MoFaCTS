import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './adminBackups.html';
import { meteorCallAsync } from '..';
import { clientConsole } from '../lib/userSessionHelpers';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime } from '../lib/interfaceFormatting';

const BACKUP_MESSAGE_KEY = 'adminBackupsMessage';
const BACKUP_CONFIG_KEY = 'adminBackupsConfig';
const BACKUP_JOBS_KEY = 'adminBackupsJobs';
const BACKUP_BUSY_KEY = 'adminBackupsBusy';
const BACKUP_SELECTED_MANIFEST_KEY = 'adminBackupsSelectedManifest';
const BACKUP_SELECTED_RESTORE_JOB_KEY = 'adminBackupsSelectedRestoreJob';
const BACKUP_SELECTED_DELETE_JOB_KEY = 'adminBackupsSelectedDeleteJob';

type BackupJob = {
  _id?: string;
  jobType?: string;
  status?: string;
  createdAt?: Date | string;
  archiveFileName?: string;
  archiveSizeBytes?: number;
  manifest?: unknown;
  error?: { phase?: string; message?: string };
};

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
    icon: level === 'error'
      ? 'fa-times-circle'
      : level === 'success'
        ? 'fa-check-circle'
        : 'fa-info-circle',
  });
}

async function refreshBackups(): Promise<void> {
  const [config, jobs] = await Promise.all([
    meteorCallAsync('admin.backups.config'),
    meteorCallAsync('admin.backups.list'),
  ]);
  Session.set(BACKUP_CONFIG_KEY, config);
  Session.set(BACKUP_JOBS_KEY, jobs);
}

Template.adminBackups.onCreated(async function() {
  Session.set(BACKUP_BUSY_KEY, false);
  Session.set(BACKUP_SELECTED_MANIFEST_KEY, null);
  Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
  Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
  setBackupMessage(null);
  try {
    await refreshBackups();
  } catch (error) {
    setBackupMessage(backupText('admin.failedLoadBackups', { error: formatError(error) }), 'error');
  }
});

Template.adminBackups.onDestroyed(function() {
  Session.set(BACKUP_BUSY_KEY, false);
  Session.set(BACKUP_SELECTED_MANIFEST_KEY, null);
  Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
  Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
  setBackupMessage(null);
});

Template.adminBackups.helpers({
  backupMessage() {
    return Session.get(BACKUP_MESSAGE_KEY);
  },
  backupConfig() {
    return Session.get(BACKUP_CONFIG_KEY);
  },
  backupJobs() {
    return Session.get(BACKUP_JOBS_KEY) || [];
  },
  hasBackupJobs() {
    return (Session.get(BACKUP_JOBS_KEY) || []).length > 0;
  },
  isBusy() {
    return Session.get(BACKUP_BUSY_KEY) === true;
  },
  selectedManifest() {
    return Session.get(BACKUP_SELECTED_MANIFEST_KEY);
  },
  selectedRestoreJob() {
    return Session.get(BACKUP_SELECTED_RESTORE_JOB_KEY);
  },
  selectedDeleteJob() {
    return Session.get(BACKUP_SELECTED_DELETE_JOB_KEY);
  },
  backupText(key: Parameters<typeof translatePlatformString>[1]) {
    return backupText(key);
  },
  enabledLabel(value: unknown) {
    return value ? backupText('admin.enabled') : backupText('admin.disabled');
  },
  destinationLabel(destination: { backend?: string; path?: string; bucket?: string; prefix?: string } | undefined) {
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

Template.adminBackups.events({
  'click #createBackupButton': async function() {
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.creatingBackup'), 'info');
    try {
      await meteorCallAsync('admin.backups.create');
      await refreshBackups();
      setBackupMessage(backupText('admin.backupCompleted'), 'success');
    } catch (error) {
      clientConsole(1, '[Backups] Create failed:', error);
      await refreshBackups().catch(() => undefined);
      setBackupMessage(backupText('admin.backupFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
  'click .verifyBackupButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.verifyingBackupArchive'), 'info');
    try {
      await meteorCallAsync('admin.backups.verify', jobId);
      await refreshBackups();
      setBackupMessage(backupText('admin.backupVerificationFinished'), 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
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
  'click .restoreBackupButton': function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const job = ((Session.get(BACKUP_JOBS_KEY) || []) as BackupJob[]).find((candidate) => candidate._id === jobId);
    Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, job || { _id: jobId });
    setBackupMessage(backupText('admin.typeRestoreToRun'), 'info');
  },
  'click .cancelRestoreButton': function() {
    Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
    setBackupMessage(backupText('admin.restoreCancelled'), 'info');
  },
  'click .deleteBackupButton': function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const job = ((Session.get(BACKUP_JOBS_KEY) || []) as BackupJob[]).find((candidate) => candidate._id === jobId);
    Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, job || { _id: jobId });
    setBackupMessage(backupText('admin.typeDeleteToRemove'), 'info');
  },
  'click .cancelDeleteButton': function() {
    Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
    setBackupMessage(backupText('admin.deleteCancelled'), 'info');
  },
  'click .confirmDeleteButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    const confirmation = (document.getElementById('deleteConfirmationInput') as HTMLInputElement | null)?.value || '';
    if (!jobId) {
      return;
    }
    const normalizedConfirmation = confirmation.trim().toUpperCase();
    if (normalizedConfirmation !== 'DELETE') {
      setBackupMessage(backupText('admin.deletePhraseMismatch'), 'info');
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.deletingBackupArchive'), 'info');
    try {
      await meteorCallAsync('admin.backups.delete', jobId, normalizedConfirmation);
      Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
      await refreshBackups();
      setBackupMessage(backupText('admin.backupArchiveDeleted'), 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
      setBackupMessage(backupText('admin.deleteFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
  'click .confirmRestoreButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    const confirmation = (document.getElementById('restoreConfirmationInput') as HTMLInputElement | null)?.value || '';
    if (!jobId) {
      return;
    }
    if (confirmation !== 'RESTORE') {
      setBackupMessage(backupText('admin.restorePhraseMismatch'), 'info');
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage(backupText('admin.restoringBackup'), 'info');
    try {
      await meteorCallAsync('admin.backups.restore', jobId, confirmation);
      Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
      await refreshBackups();
      setBackupMessage(backupText('admin.restoreCompleted'), 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
      setBackupMessage(backupText('admin.restoreFailed', { error: formatError(error) }), 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
});
