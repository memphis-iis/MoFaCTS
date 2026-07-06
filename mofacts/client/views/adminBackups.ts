import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './adminBackups.html';
import { meteorCallAsync } from '..';
import { clientConsole } from '../lib/userSessionHelpers';

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

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return err ? String(err) : 'Unknown error';
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
    setBackupMessage(`Failed to load backups: ${formatError(error)}`, 'error');
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
  enabledLabel(value: unknown) {
    return value ? 'enabled' : 'disabled';
  },
  destinationLabel(destination: { backend?: string; path?: string; bucket?: string; prefix?: string } | undefined) {
    if (!destination) {
      return 'not configured';
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
    return new Date(value).toLocaleString();
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
    setBackupMessage('Creating backup. This can take several minutes; keep this page open for status.', 'info');
    try {
      await meteorCallAsync('admin.backups.create');
      await refreshBackups();
      setBackupMessage('Backup completed.', 'success');
    } catch (error) {
      clientConsole(1, '[Backups] Create failed:', error);
      await refreshBackups().catch(() => undefined);
      setBackupMessage(`Backup failed: ${formatError(error)}`, 'error');
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
    setBackupMessage('Verifying backup archive.', 'info');
    try {
      await meteorCallAsync('admin.backups.verify', jobId);
      await refreshBackups();
      setBackupMessage('Backup verification finished.', 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
      setBackupMessage(`Verification failed: ${formatError(error)}`, 'error');
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
      setBackupMessage(`Could not load manifest: ${formatError(error)}`, 'error');
    }
  },
  'click .downloadBackupButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage('Preparing one-time download link.', 'info');
    try {
      const result = await meteorCallAsync('admin.backups.downloadToken', jobId) as { url?: string };
      if (!result.url) {
        throw new Error('Download URL was not returned');
      }
      setBackupMessage('Download starting. Backup archives may contain sensitive data.', 'success');
      window.location.assign(result.url);
    } catch (error) {
      setBackupMessage(`Download failed: ${formatError(error)}`, 'error');
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
    setBackupMessage('Type RESTORE in the confirmation box to run the restore.', 'info');
  },
  'click .cancelRestoreButton': function() {
    Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
    setBackupMessage('Restore cancelled.', 'info');
  },
  'click .deleteBackupButton': function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    if (!jobId) {
      return;
    }
    const job = ((Session.get(BACKUP_JOBS_KEY) || []) as BackupJob[]).find((candidate) => candidate._id === jobId);
    Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, job || { _id: jobId });
    setBackupMessage('Type DELETE in the confirmation box to remove the archive.', 'info');
  },
  'click .cancelDeleteButton': function() {
    Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
    setBackupMessage('Delete cancelled.', 'info');
  },
  'click .confirmDeleteButton': async function(event: Event) {
    const jobId = (event.currentTarget as HTMLElement | null)?.getAttribute('data-job-id') || '';
    const confirmation = (document.getElementById('deleteConfirmationInput') as HTMLInputElement | null)?.value || '';
    if (!jobId) {
      return;
    }
    const normalizedConfirmation = confirmation.trim().toUpperCase();
    if (normalizedConfirmation !== 'DELETE') {
      setBackupMessage('Delete cancelled. Confirmation phrase did not match DELETE.', 'info');
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage('Deleting backup archive.', 'info');
    try {
      await meteorCallAsync('admin.backups.delete', jobId, normalizedConfirmation);
      Session.set(BACKUP_SELECTED_DELETE_JOB_KEY, null);
      await refreshBackups();
      setBackupMessage('Backup archive deleted. Registry history was preserved.', 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
      setBackupMessage(`Delete failed: ${formatError(error)}`, 'error');
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
      setBackupMessage('Restore cancelled. Confirmation phrase did not match RESTORE.', 'info');
      return;
    }
    Session.set(BACKUP_BUSY_KEY, true);
    setBackupMessage('Restoring backup. This verifies the archive and can take several minutes.', 'info');
    try {
      await meteorCallAsync('admin.backups.restore', jobId, confirmation);
      Session.set(BACKUP_SELECTED_RESTORE_JOB_KEY, null);
      await refreshBackups();
      setBackupMessage('Restore completed.', 'success');
    } catch (error) {
      await refreshBackups().catch(() => undefined);
      setBackupMessage(`Restore failed: ${formatError(error)}`, 'error');
    } finally {
      Session.set(BACKUP_BUSY_KEY, false);
    }
  },
});
