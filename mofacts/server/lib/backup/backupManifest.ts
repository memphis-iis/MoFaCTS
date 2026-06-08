import crypto from 'crypto';
import type { BackupManifest, BackupComponentStatus } from './backupTypes';

export const BACKUP_FORMAT_VERSION = 1;

export function sha256Hex(body: Buffer): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function createBackupManifest(args: {
  createdAt: Date;
  createdByUserId: string;
  mongoDatabaseName: string;
  storageBackend: 'local' | 's3';
  entries: Array<{ name: string; body: Buffer }>;
  includedComponents: BackupComponentStatus[];
  excludedComponents: BackupComponentStatus[];
  warnings: string[];
}): BackupManifest {
  const checksums: Record<string, string> = {};
  let sizeBytes = 0;
  for (const entry of args.entries) {
    checksums[entry.name] = sha256Hex(entry.body);
    sizeBytes += entry.body.length;
  }
  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    createdAt: args.createdAt.toISOString(),
    createdByUserId: args.createdByUserId,
    mofactsVersion: String(process.env.npm_package_version || 'unknown'),
    gitCommit: String(process.env.GIT_COMMIT || process.env.SOURCE_COMMIT || 'unknown'),
    imageTag: String(process.env.IMAGE_TAG || 'unknown'),
    mongoDatabaseName: args.mongoDatabaseName,
    storageBackend: args.storageBackend,
    includedComponents: args.includedComponents,
    excludedComponents: args.excludedComponents,
    includedPaths: args.entries.map((entry) => entry.name),
    checksums,
    fileCount: args.entries.length,
    sizeBytes,
    warnings: args.warnings,
    compatibilityNotes: [
      'Open Core backup format v1 stores archives outside MongoDB and stores metadata in MongoDB.',
      'Same-server local backups must be copied off-server to protect against server or disk loss.',
    ],
  };
}

export function parseManifest(body: Buffer): BackupManifest {
  const parsed = JSON.parse(body.toString('utf8')) as BackupManifest;
  if (parsed.backupFormatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${String(parsed.backupFormatVersion)}`);
  }
  if (!parsed.createdAt || !parsed.mongoDatabaseName || !parsed.checksums) {
    throw new Error('Backup manifest is missing required fields');
  }
  return parsed;
}
