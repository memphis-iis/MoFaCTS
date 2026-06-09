import path from 'path';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import type { BackupConfig } from './backupTypes';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function readInteger(value: unknown, defaultValue: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : defaultValue;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readBackupConfig(settings: unknown, env: NodeJS.ProcessEnv = process.env): BackupConfig {
  const root = isRecord(settings) ? settings : {};
  const openCore = isRecord(root.openCore) ? root.openCore : {};
  const backups = isRecord(openCore.backups) ? openCore.backups : {};
  const configuredPath =
    readString(backups.localBackupPath) ||
    readString(env.MOFACTS_BACKUP_LOCAL_PATH) ||
    '/backups';
  const localBackupPath = path.resolve(configuredPath);
  const backend = readString(backups.backend) || 'local';
  if (backend !== 'local' && backend !== 's3') {
    throw new Error('openCore.backups.backend must be local or s3');
  }
  return {
    enabled: readBoolean(backups.enabled, true),
    destination: backend === 'local'
      ? { backend, path: localBackupPath }
      : {
          backend,
          bucket: readString(backups.s3Bucket),
          prefix: readString(backups.s3Prefix),
        },
    localBackupPath,
    includeSettings: readBoolean(backups.includeSettings, true),
    includeEnvironmentFile: readBoolean(backups.includeEnvironmentFile, true),
    includeKeyMaterial: readBoolean(backups.includeKeyMaterial, true),
    includeLocalAssetFiles: readBoolean(backups.includeLocalAssetFiles, false),
    maxRetainedBackups: readInteger(backups.maxRetainedBackups, 10),
    requirePreRestoreBackup: readBoolean(backups.requirePreRestoreBackup, true),
  };
}

export function publicBackupConfigStatus(config: BackupConfig) {
  return {
    enabled: config.enabled,
    destination: config.destination,
    includeSettings: config.includeSettings,
    includeEnvironmentFile: config.includeEnvironmentFile,
    includeKeyMaterial: config.includeKeyMaterial,
    includeLocalAssetFiles: config.includeLocalAssetFiles,
    maxRetainedBackups: config.maxRetainedBackups,
    requirePreRestoreBackup: config.requirePreRestoreBackup,
    warning: config.includeLocalAssetFiles
      ? 'Local asset-file backup is enabled and can heavily degrade the live app on large installs. Prefer host-level snapshots or off-server asset sync.'
      : 'In-app backups exclude local content asset files. Use host-level snapshots or off-server asset sync for /dynamic-assets and H5P storage.',
  };
}

export async function validateBackupConfig(settings: unknown, env: NodeJS.ProcessEnv = process.env) {
  const checks: Array<{ name: string; status: 'pass' | 'fail'; message: string }> = [];
  try {
    const config = readBackupConfig(settings, env);
    checks.push({
      name: 'backups.enabled',
      status: 'pass',
      message: config.enabled ? 'admin backups are enabled' : 'admin backups are disabled',
    });
    if (!config.enabled) {
      return checks;
    }
    if (config.destination.backend !== 'local') {
      checks.push({
        name: 'backups.backend',
        status: 'fail',
        message: 'Open Core currently supports local backup archive storage only',
      });
      return checks;
    }
    await fs.mkdir(config.localBackupPath, { recursive: true, mode: 0o700 });
    await fs.access(config.localBackupPath, fsConstants.R_OK | fsConstants.W_OK);
    const probePath = path.join(config.localBackupPath, `.mofacts-backup-readiness-${Date.now()}.tmp`);
    await fs.writeFile(probePath, 'mofacts-backup-readiness', { mode: 0o600 });
    await fs.unlink(probePath);
    checks.push({
      name: 'backups.localDestination',
      status: 'pass',
      message: `${config.localBackupPath} is readable and writable`,
    });
  } catch (error) {
    checks.push({
      name: 'backups.localDestination',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return checks;
}
