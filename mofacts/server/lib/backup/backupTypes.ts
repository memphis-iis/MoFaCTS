export type BackupJobType = 'backup' | 'restore' | 'verify' | 'delete';
export type BackupJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'verified' | 'cancelled' | 'deleted';
export type BackupDestinationBackend = 'local' | 's3';

export type BackupDestination = {
  backend: BackupDestinationBackend;
  path?: string;
  bucket?: string;
  prefix?: string;
};

export type BackupComponentStatus = {
  name: string;
  status: 'included' | 'excluded' | 'warning';
  path?: string;
  message?: string;
  fileCount?: number;
  sizeBytes?: number;
};

export type BackupManifest = {
  backupFormatVersion: 1;
  createdAt: string;
  createdByUserId: string;
  mofactsVersion: string;
  gitCommit: string;
  imageTag: string;
  mongoDatabaseName: string;
  storageBackend: 'local' | 's3';
  includedComponents: BackupComponentStatus[];
  excludedComponents: BackupComponentStatus[];
  includedPaths: string[];
  checksums: Record<string, string>;
  fileCount: number;
  sizeBytes: number;
  warnings: string[];
  compatibilityNotes: string[];
};

export type BackupJobDocument = {
  _id?: string;
  jobType: BackupJobType;
  status: BackupJobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdByUserId: string;
  createdByUsername?: string;
  sourceBackupId?: string;
  backupId?: string;
  archiveFileName?: string;
  archivePath?: string;
  archiveSizeBytes?: number;
  archiveSha256?: string;
  destination: BackupDestination;
  manifest?: BackupManifest;
  verification?: {
    verifiedAt: Date;
    ok: boolean;
    checks: Array<{ name: string; status: 'pass' | 'fail'; message: string }>;
  };
  error?: {
    message: string;
    stack?: string;
    phase: string;
  };
  restore?: {
    restoredAt?: Date;
    restoredByUserId?: string;
    preRestoreBackupId?: string;
    readinessCheckResult?: unknown;
  };
};

export type BackupConfig = {
  enabled: boolean;
  destination: BackupDestination;
  localBackupPath: string;
  includeSettings: boolean;
  includeEnvironmentFile: boolean;
  includeKeyMaterial: boolean;
  maxRetainedBackups: number;
  requirePreRestoreBackup: boolean;
};

export type BackupRegistry = {
  insert(doc: BackupJobDocument): Promise<string>;
  update(jobId: string, modifier: Record<string, unknown>): Promise<void>;
  find(selector?: Record<string, unknown>, options?: Record<string, unknown>): { fetchAsync(): Promise<BackupJobDocument[]> };
  findOne(selector: Record<string, unknown>, options?: Record<string, unknown>): Promise<BackupJobDocument | null>;
};
