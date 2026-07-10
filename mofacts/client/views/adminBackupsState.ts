import type { LoadableState } from '../lib/adminUi/loadableState';

export type BackupJob = Readonly<{
  _id?: string;
  jobType?: string;
  status?: string;
  createdAt?: Date | string;
  archiveFileName?: string;
  archiveSizeBytes?: number;
  manifest?: unknown;
  error?: { phase?: string; message?: string };
}>;

export type BackupConfig = Readonly<{
  enabled?: boolean;
  destination?: {
    backend?: string;
    path?: string;
    bucket?: string;
    prefix?: string;
  };
  includeSettings?: boolean;
  includeKeyMaterial?: boolean;
}>;

export type BackupSnapshot = Readonly<{
  config: BackupConfig;
  jobs: readonly BackupJob[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeBackupSnapshot(config: unknown, jobs: unknown): BackupSnapshot {
  if (!isRecord(config)) {
    throw new Error('Backup configuration returned an invalid result.');
  }
  if (!Array.isArray(jobs) || jobs.some((job) => !isRecord(job))) {
    throw new Error('Backup history returned an invalid result.');
  }
  return {
    config: config as BackupConfig,
    jobs: jobs as readonly BackupJob[],
  };
}

export function backupSnapshotIsEmpty(snapshot: BackupSnapshot): boolean {
  return snapshot.jobs.length === 0;
}

export type BackupLoadPresentation = Readonly<{
  busy: boolean;
  showLoading: boolean;
  showError: boolean;
  showEmpty: boolean;
  showRows: boolean;
  showRefreshing: boolean;
  showRefreshError: boolean;
  message: string;
}>;

export function getBackupLoadPresentation(
  state: LoadableState<BackupSnapshot>,
): BackupLoadPresentation {
  return {
    busy: state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing',
    showLoading: state.status === 'idle' || state.status === 'loading',
    showError: state.status === 'error',
    showEmpty: state.status === 'empty',
    showRows: state.status === 'ready' || state.status === 'refreshing' || state.status === 'refresh-error',
    showRefreshing: state.status === 'refreshing',
    showRefreshError: state.status === 'refresh-error',
    message: state.status === 'error' || state.status === 'refresh-error' ? state.message : '',
  };
}
