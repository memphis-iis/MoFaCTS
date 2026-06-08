import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import type { BackupConfig } from './backupTypes';

export type StoredBackupArchive = {
  archivePath: string;
  sizeBytes: number;
};

function assertSafeArchiveName(fileName: string): string {
  if (!/^mofacts-backup-\d{8}-\d{6}-[A-Za-z0-9_-]+\.tar\.gz$/.test(fileName)) {
    throw new Error('Backup archive file name is invalid');
  }
  return fileName;
}

function assertInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Backup path escapes configured backup directory: ${target}`);
  }
  return resolvedTarget;
}

export function createLocalBackupStorage(config: BackupConfig) {
  if (config.destination.backend !== 'local') {
    throw new Error('Only local backup storage is implemented in Open Core');
  }
  const rootPath = path.resolve(config.localBackupPath);
  return {
    backend: 'local' as const,
    rootPath,
    async ensureReady(): Promise<void> {
      await fs.mkdir(rootPath, { recursive: true, mode: 0o700 });
      await fs.access(rootPath, fsConstants.R_OK | fsConstants.W_OK);
    },
    async writeArchive(fileName: string, body: Buffer): Promise<StoredBackupArchive> {
      assertSafeArchiveName(fileName);
      await this.ensureReady();
      const archivePath = assertInside(rootPath, path.join(rootPath, fileName));
      await fs.writeFile(archivePath, body, { mode: 0o600 });
      const stat = await fs.stat(archivePath);
      return { archivePath, sizeBytes: stat.size };
    },
    async readArchive(fileName: string): Promise<Buffer> {
      assertSafeArchiveName(fileName);
      const archivePath = assertInside(rootPath, path.join(rootPath, fileName));
      return await fs.readFile(archivePath);
    },
    archivePath(fileName: string): string {
      assertSafeArchiveName(fileName);
      return assertInside(rootPath, path.join(rootPath, fileName));
    },
    async deleteArchive(fileName: string): Promise<boolean> {
      assertSafeArchiveName(fileName);
      const archivePath = assertInside(rootPath, path.join(rootPath, fileName));
      try {
        await fs.unlink(archivePath);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    },
    async archiveExists(fileName: string): Promise<boolean> {
      try {
        assertSafeArchiveName(fileName);
        const archivePath = assertInside(rootPath, path.join(rootPath, fileName));
        const stat = await fs.stat(archivePath);
        return stat.isFile();
      } catch {
        return false;
      }
    },
  };
}
