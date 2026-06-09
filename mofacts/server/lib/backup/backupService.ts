import fs from 'fs/promises';
import path from 'path';
import { Random } from 'meteor/random';
import { EJSON } from 'meteor/ejson';
import { getLocalStoragePaths, getStorageBackend } from '../storageBoundary';
import { collectionMongoName } from '../../../common/collectionOwnership';
import { readBackupConfig } from './backupConfig';
import { issueBackupDownloadToken } from './backupDownloadTokens';
import { createBackupManifest, sha256Hex } from './backupManifest';
import { createLocalBackupStorage } from './backupStorage';
import { createTarGzArchive, readTarGzArchive, type TarEntry } from './tarArchive';
import { verifyBackupArchive } from './backupVerification';
import type { BackupComponentStatus, BackupJobDocument, BackupRegistry } from './backupTypes';

type UnknownRecord = Record<string, unknown>;

export type BackupServiceDeps = {
  settings: unknown;
  env?: NodeJS.ProcessEnv;
  backupJobs: BackupRegistry;
  rawDatabase: () => {
    databaseName?: string;
    collection(name: string): {
      deleteMany(query: UnknownRecord): Promise<unknown>;
      insertMany(docs: unknown[]): Promise<unknown>;
    };
    collections(): Promise<Array<{
      collectionName: string;
      find(query?: UnknownRecord): { toArray(): Promise<unknown[]> };
    }>>;
  };
  usersCollection: {
    findOneAsync(selector: UnknownRecord, options?: UnknownRecord): Promise<any>;
  };
  auditLog: {
    insertAsync(doc: UnknownRecord): Promise<unknown>;
  };
};

type BackupActor = {
  userId: string;
  connection?: { clientAddress?: string | null } | null;
};

const CONTROL_PLANE_COLLECTIONS = new Set([
  collectionMongoName('BackupJobs'),
  collectionMongoName('AuditLog'),
]);

function timestampPart(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
}

function backupArchiveFileName(date: Date, id: string): string {
  return `mofacts-backup-${timestampPart(date)}-${id}.tar.gz`;
}

function toJsonBuffer(value: unknown): Buffer {
  const ejsonValue = value as Parameters<typeof EJSON.stringify>[0];
  return Buffer.from(`${EJSON.stringify(ejsonValue, { indent: 2 })}\n`, 'utf8');
}

function entryPath(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}

async function collectFiles(rootPath: string, archivePrefix: string): Promise<{ entries: TarEntry[]; fileCount: number; sizeBytes: number }> {
  const entries: TarEntry[] = [];
  let fileCount = 0;
  let sizeBytes = 0;

  async function walk(currentPath: string, relativePath: string): Promise<void> {
    const stat = await fs.stat(currentPath);
    if (stat.isDirectory()) {
      const children = await fs.readdir(currentPath);
      for (const child of children) {
        await walk(path.join(currentPath, child), path.join(relativePath, child));
      }
      return;
    }
    if (!stat.isFile()) {
      return;
    }
    const body = await fs.readFile(currentPath);
    entries.push({
      name: entryPath(archivePrefix, relativePath),
      body,
      mtime: stat.mtime,
    });
    fileCount += 1;
    sizeBytes += body.length;
  }

  try {
    await walk(rootPath, '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries, fileCount, sizeBytes };
    }
    throw error;
  }

  return { entries, fileCount, sizeBytes };
}

async function dumpMongoDatabase(deps: BackupServiceDeps): Promise<TarEntry> {
  const db = deps.rawDatabase();
  const collections = await db.collections();
  const dump: Record<string, unknown[]> = {};
  for (const collection of collections) {
    dump[collection.collectionName] = await collection.find({}).toArray();
  }
  return {
    name: 'mongo/database.json',
    body: toJsonBuffer({
      databaseName: db.databaseName || process.env.EXPECTED_MONGO_DB_NAME || 'MoFACT-meteor3',
      exportedAt: new Date().toISOString(),
      collections: dump,
    }),
  };
}

async function readOptionalFile(filePath: string, archiveName: string, warnings: string[]): Promise<TarEntry | null> {
  if (!filePath) {
    return null;
  }
  try {
    const body = await fs.readFile(filePath);
    return { name: archiveName, body };
  } catch (error) {
    warnings.push(`Could not include ${archiveName}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function writeAudit(deps: BackupServiceDeps, action: string, actor: BackupActor, details: UnknownRecord): Promise<void> {
  await deps.auditLog.insertAsync({
    action,
    actorUserId: actor.userId,
    targetUserId: null,
    timestamp: new Date(),
    details: {
      ...details,
      clientAddress: actor.connection?.clientAddress || null,
    },
  });
}

type DownloadableBackupJob = BackupJobDocument & { archiveFileName: string };

function assertDownloadableBackup(job: BackupJobDocument | null): DownloadableBackupJob {
  if (!job || job.jobType !== 'backup' || !job.archiveFileName) {
    throw new Error('Backup job not found');
  }
  if (job.status !== 'complete' && job.status !== 'verified') {
    throw new Error('Only complete or verified backup archives can be downloaded');
  }
  return job as DownloadableBackupJob;
}

async function updateFailed(deps: BackupServiceDeps, jobId: string, phase: string, error: unknown): Promise<void> {
  await deps.backupJobs.update(jobId, {
    $set: {
      status: 'failed',
      completedAt: new Date(),
      error: {
        phase,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      },
    },
  });
}

export async function reconcileInterruptedBackupJobs(deps: Pick<BackupServiceDeps, 'backupJobs'>): Promise<number> {
  const interruptedJobs = await deps.backupJobs.find({
    status: { $in: ['queued', 'running'] },
  }).fetchAsync();
  const completedAt = new Date();
  await Promise.all(interruptedJobs.map(async (job) => {
    if (!job._id) {
      return;
    }
    await deps.backupJobs.update(job._id, {
      $set: {
        status: 'failed',
        completedAt,
        error: {
          phase: 'startup-reconcile',
          message: 'Backup operation did not finish before the server process stopped. Start a new backup to create a fresh archive.',
        },
      },
    });
  }));
  return interruptedJobs.filter((job) => Boolean(job._id)).length;
}

function entryMap(entries: TarEntry[]): Map<string, Buffer> {
  return new Map(entries.map((entry) => [entry.name, entry.body]));
}

function parseMongoDump(body: Buffer): { collections: Record<string, unknown[]> } {
  const parsed = EJSON.parse(body.toString('utf8')) as { collections?: unknown };
  if (!parsed.collections || typeof parsed.collections !== 'object' || Array.isArray(parsed.collections)) {
    throw new Error('Backup archive Mongo dump is missing collections');
  }
  const collections: Record<string, unknown[]> = {};
  for (const [name, docs] of Object.entries(parsed.collections as Record<string, unknown>)) {
    if (!Array.isArray(docs)) {
      throw new Error(`Backup archive Mongo collection ${name} is not an array`);
    }
    collections[name] = docs;
  }
  return { collections };
}

function manifestIncludesComponent(manifest: { includedComponents?: BackupComponentStatus[] } | undefined, name: string): boolean {
  return Array.isArray(manifest?.includedComponents)
    && manifest.includedComponents.some((component) => component.name === name && component.status === 'included');
}

function assertRestorableRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error(`Refusing to restore files into filesystem root: ${resolved}`);
  }
  return resolved;
}

function assertInsideRoot(rootPath: string, targetPath: string): string {
  const root = assertRestorableRoot(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Backup file path escapes restore directory: ${targetPath}`);
  }
  return target;
}

async function restoreLocalDirectory(entries: TarEntry[], archivePrefix: string, rootPath: string): Promise<{ fileCount: number; sizeBytes: number }> {
  const root = assertRestorableRoot(rootPath);
  const prefix = `${archivePrefix}/`;
  const matchingEntries = entries.filter((entry) => entry.name.startsWith(prefix));
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  let sizeBytes = 0;
  for (const entry of matchingEntries) {
    const relativeName = entry.name.slice(prefix.length);
    if (!relativeName) {
      continue;
    }
    const target = assertInsideRoot(root, path.join(root, relativeName));
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, entry.body, { mode: entry.mode || 0o600 });
    sizeBytes += entry.body.length;
  }
  return { fileCount: matchingEntries.length, sizeBytes };
}

async function restoreMongoDatabase(deps: BackupServiceDeps, dump: { collections: Record<string, unknown[]> }) {
  const db = deps.rawDatabase();
  const existingCollections = await db.collections();
  const currentNames = new Set(existingCollections.map((collection) => collection.collectionName));
  const dumpNames = new Set(Object.keys(dump.collections));
  const targetNames = new Set([...currentNames, ...dumpNames]);
  for (const collectionName of targetNames) {
    if (collectionName.startsWith('system.') || CONTROL_PLANE_COLLECTIONS.has(collectionName)) {
      continue;
    }
    const collection = db.collection(collectionName);
    await collection.deleteMany({});
    const docs = dump.collections[collectionName] || [];
    if (docs.length > 0) {
      await collection.insertMany(docs);
    }
  }
}

export async function createBackupJob(deps: BackupServiceDeps, actor: BackupActor): Promise<BackupJobDocument> {
  const config = readBackupConfig(deps.settings, deps.env || process.env);
  if (!config.enabled) {
    throw new Error('Open Core backups are disabled by configuration');
  }
  const createdAt = new Date();
  const backupId = Random.id(8);
  const archiveFileName = backupArchiveFileName(createdAt, backupId);
  const user = await deps.usersCollection.findOneAsync({ _id: actor.userId }, { fields: { username: 1, emails: 1 } });
  const createdByUsername = String(user?.username || user?.emails?.[0]?.address || '').trim();
  const jobId = await deps.backupJobs.insert({
    jobType: 'backup',
    status: 'queued',
    createdAt,
    createdByUserId: actor.userId,
    ...(createdByUsername ? { createdByUsername } : {}),
    backupId,
    archiveFileName,
    destination: config.destination,
  });

  try {
    await deps.backupJobs.update(jobId, { $set: { status: 'running', startedAt: new Date() } });
    await writeAudit(deps, 'backup.created', actor, { backupId, jobId });

    const warnings: string[] = [
      'This archive is stored on the same server by default. Copy it off-server to protect against server or disk loss.',
    ];
    const entries: TarEntry[] = [await dumpMongoDatabase(deps)];
    const includedComponents: BackupComponentStatus[] = [{
      name: 'mongo',
      status: 'included',
      path: 'mongo/database.json',
      fileCount: 1,
      sizeBytes: entries[0]?.body.length || 0,
    }];
    const excludedComponents: BackupComponentStatus[] = [{
      name: 'redis',
      status: 'excluded',
      message: 'Redis is treated as reconstructable coordination/runtime state and is not included in Open Core backup format v1.',
    }];

    const storageBackend = getStorageBackend(deps.settings);
    if (storageBackend === 'local' && config.includeLocalAssetFiles) {
      const localPaths = getLocalStoragePaths(deps.settings, deps.env || process.env);
      for (const [name, rootPath, archivePrefix] of [
        ['dynamic-assets', localPaths.dynamicAssetsPath, 'dynamic-assets'],
        ['h5p-content', localPaths.h5pContentPath, 'h5p-content'],
        ['h5p-libraries', localPaths.h5pLibrariesPath, 'h5p-libraries'],
      ] as const) {
        const collected = await collectFiles(rootPath, archivePrefix);
        entries.push(...collected.entries);
        includedComponents.push({
          name,
          status: collected.fileCount > 0 ? 'included' : 'warning',
          path: rootPath,
          fileCount: collected.fileCount,
          sizeBytes: collected.sizeBytes,
          ...(collected.fileCount > 0 ? {} : { message: `${rootPath} did not contain files at backup time` }),
        });
      }
      warnings.push('Local asset-file backup is enabled. Large dynamic-assets or H5P directories can degrade the live app while the archive is created.');
    } else if (storageBackend === 'local') {
      excludedComponents.push(
        {
          name: 'dynamic-assets',
          status: 'excluded',
          message: 'Local content files are excluded from in-app backups. Use host-level snapshots or off-server asset sync for /dynamic-assets.',
        },
        {
          name: 'h5p-content',
          status: 'excluded',
          message: 'H5P content files are excluded from in-app backups. Use host-level snapshots or off-server asset sync for /h5p-content.',
        },
        {
          name: 'h5p-libraries',
          status: 'excluded',
          message: 'H5P library files are excluded from in-app backups. Use host-level snapshots or off-server asset sync for /h5p-libraries.',
        },
      );
      warnings.push('This in-app backup excludes local content asset files to avoid degrading the live app. Back up /dynamic-assets, /h5p-content, and /h5p-libraries outside Meteor.');
    } else {
      excludedComponents.push({
        name: 'object-storage-assets',
        status: 'excluded',
        message: 'S3-compatible object storage snapshots must be taken outside backup format v1 and recorded with the archive.',
      });
      warnings.push('Configured S3-compatible storage is not copied by local backup format v1. Snapshot the bucket/prefix separately.');
    }

    if (config.includeSettings) {
      const settingsEntry = await readOptionalFile(
        String(process.env.METEOR_SETTINGS_WORKAROUND || '/run/mofacts/settings.json'),
        'config/settings.json',
        warnings,
      );
      if (settingsEntry) {
        entries.push(settingsEntry);
        includedComponents.push({ name: 'settings', status: 'included', path: 'config/settings.json', fileCount: 1, sizeBytes: settingsEntry.body.length });
      }
    } else {
      excludedComponents.push({ name: 'settings', status: 'excluded', message: 'openCore.backups.includeSettings is false' });
    }

    if (config.includeEnvironmentFile) {
      const envEntry = await readOptionalFile(String(process.env.MOFACTS_ENV_FILE_PATH || '/run/mofacts/env.self-hosted'), 'config/env.self-hosted', warnings);
      if (envEntry) {
        entries.push(envEntry);
        includedComponents.push({ name: 'environment', status: 'included', path: 'config/env.self-hosted', fileCount: 1, sizeBytes: envEntry.body.length });
      }
    }

    if (config.includeKeyMaterial) {
      const keyMaterial = await collectFiles('/mofactsAssets_override', 'keys/mofactsAssets_override');
      entries.push(...keyMaterial.entries);
      includedComponents.push({
        name: 'key-material',
        status: keyMaterial.fileCount > 0 ? 'included' : 'warning',
        path: '/mofactsAssets_override',
        fileCount: keyMaterial.fileCount,
        sizeBytes: keyMaterial.sizeBytes,
        ...(keyMaterial.fileCount > 0 ? {} : { message: 'No key material files were found in /mofactsAssets_override' }),
      });
    } else {
      excludedComponents.push({ name: 'key-material', status: 'excluded', message: 'openCore.backups.includeKeyMaterial is false' });
    }

    const manifest = createBackupManifest({
      createdAt,
      createdByUserId: actor.userId,
      mongoDatabaseName: process.env.EXPECTED_MONGO_DB_NAME || process.env.MOFACTS_MONGO_APP_DATABASE || 'MoFACT-meteor3',
      storageBackend,
      entries,
      includedComponents,
      excludedComponents,
      warnings,
    });
    const checksumText = Object.entries(manifest.checksums)
      .map(([name, checksum]) => `${checksum}  ${name}`)
      .join('\n');
    entries.push({ name: 'checksums/sha256sums.txt', body: Buffer.from(`${checksumText}\n`, 'utf8') });
    const finalManifest = {
      ...manifest,
      checksums: {
        ...manifest.checksums,
        'checksums/sha256sums.txt': sha256Hex(entries[entries.length - 1]!.body),
      },
      includedPaths: [...manifest.includedPaths, 'checksums/sha256sums.txt'],
      fileCount: manifest.fileCount + 1,
      sizeBytes: manifest.sizeBytes + entries[entries.length - 1]!.body.length,
    };
    entries.unshift({ name: 'manifest.json', body: toJsonBuffer(finalManifest) });

    const archive = await createTarGzArchive(entries);
    const storage = createLocalBackupStorage(config);
    const stored = await storage.writeArchive(archiveFileName, archive);
    const archiveSha256 = sha256Hex(archive);

    await deps.backupJobs.update(jobId, {
      $set: {
        status: 'complete',
        completedAt: new Date(),
        archivePath: stored.archivePath,
        archiveSizeBytes: stored.sizeBytes,
        archiveSha256,
        manifest: finalManifest,
      },
    });
    await writeAudit(deps, 'backup.completed', actor, { backupId, jobId, archiveFileName, sizeBytes: stored.sizeBytes });
    const completed = await deps.backupJobs.findOne({ _id: jobId });
    return completed || { _id: jobId, jobType: 'backup', status: 'complete', createdAt, createdByUserId: actor.userId, destination: config.destination };
  } catch (error) {
    await updateFailed(deps, jobId, 'create', error);
    await writeAudit(deps, 'backup.failed', actor, { backupId, jobId, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function verifyBackupJob(deps: BackupServiceDeps, actor: BackupActor, backupJobId: string): Promise<BackupJobDocument> {
  const job = await deps.backupJobs.findOne({ _id: backupJobId });
  if (!job || job.jobType !== 'backup' || !job.archiveFileName) {
    throw new Error('Backup job not found');
  }
  const verifyJob: BackupJobDocument = {
    jobType: 'verify',
    status: 'running',
    createdAt: new Date(),
    startedAt: new Date(),
    createdByUserId: actor.userId,
    sourceBackupId: backupJobId,
    archiveFileName: job.archiveFileName,
    destination: job.destination,
    ...(job.backupId ? { backupId: job.backupId } : {}),
    ...(job.archivePath ? { archivePath: job.archivePath } : {}),
  };
  const verifyJobId = await deps.backupJobs.insert(verifyJob);
  try {
    const config = readBackupConfig(deps.settings, deps.env || process.env);
    const storage = createLocalBackupStorage(config);
    const archive = await storage.readArchive(job.archiveFileName);
    const result = await verifyBackupArchive(archive);
    const completedAt = new Date();
    await deps.backupJobs.update(verifyJobId, {
      $set: {
        status: result.ok ? 'verified' : 'failed',
        completedAt,
        verification: { verifiedAt: completedAt, ok: result.ok, checks: result.checks },
        ...(result.manifest ? { manifest: result.manifest } : {}),
      },
    });
    await deps.backupJobs.update(backupJobId, {
      $set: {
        status: result.ok ? 'verified' : job.status,
        verification: { verifiedAt: completedAt, ok: result.ok, checks: result.checks },
        ...(result.manifest ? { manifest: result.manifest } : {}),
      },
    });
    await writeAudit(deps, result.ok ? 'backup.verified' : 'backup.verify_failed', actor, { backupId: job.backupId, jobId: backupJobId, verifyJobId });
    const updated = await deps.backupJobs.findOne({ _id: backupJobId });
    return updated || job;
  } catch (error) {
    await updateFailed(deps, verifyJobId, 'verify', error);
    await writeAudit(deps, 'backup.verify_failed', actor, { backupId: job.backupId, jobId: backupJobId, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function createBackupDownloadToken(deps: BackupServiceDeps, actor: BackupActor, backupJobId: string): Promise<{ url: string; expiresAt: Date }> {
  const job = assertDownloadableBackup(await deps.backupJobs.findOne({ _id: backupJobId }));
  const config = readBackupConfig(deps.settings, deps.env || process.env);
  const storage = createLocalBackupStorage(config);
  if (!await storage.archiveExists(job.archiveFileName!)) {
    throw new Error('Backup archive file was not found in the configured backup destination');
  }
  const issued = issueBackupDownloadToken({
    backupJobId,
    archiveFileName: job.archiveFileName,
    createdByUserId: actor.userId,
  });
  await writeAudit(deps, 'backup.download_token_created', actor, { backupId: job.backupId, jobId: backupJobId, expiresAt: issued.expiresAt });
  return {
    url: `/admin/backups/download/${encodeURIComponent(issued.token)}/${encodeURIComponent(job.archiveFileName)}`,
    expiresAt: issued.expiresAt,
  };
}

export async function deleteBackupJob(deps: BackupServiceDeps, actor: BackupActor, backupJobId: string): Promise<BackupJobDocument> {
  const sourceJob = assertDownloadableBackup(await deps.backupJobs.findOne({ _id: backupJobId }));
  const config = readBackupConfig(deps.settings, deps.env || process.env);
  const createdAt = new Date();
  const deleteJobId = await deps.backupJobs.insert({
    jobType: 'delete',
    status: 'running',
    createdAt,
    startedAt: createdAt,
    createdByUserId: actor.userId,
    sourceBackupId: backupJobId,
    archiveFileName: sourceJob.archiveFileName,
    destination: sourceJob.destination,
  });
  try {
    const storage = createLocalBackupStorage(config);
    const archiveDeleted = await storage.deleteArchive(sourceJob.archiveFileName);
    const completedAt = new Date();
    await deps.backupJobs.update(backupJobId, {
      $set: {
        status: 'deleted',
        completedAt,
        archivePath: null,
        archiveSizeBytes: 0,
      },
    });
    await deps.backupJobs.update(deleteJobId, {
      $set: {
        status: 'complete',
        completedAt,
        restore: {
          readinessCheckResult: {
            archiveDeleted,
          },
        },
      },
    });
    await writeAudit(deps, 'backup.deleted', actor, {
      backupId: sourceJob.backupId,
      jobId: backupJobId,
      deleteJobId,
      archiveFileName: sourceJob.archiveFileName,
      archiveDeleted,
    });
    const deleted = await deps.backupJobs.findOne({ _id: backupJobId });
    const fallbackDeleted: BackupJobDocument = {
      ...sourceJob,
      status: 'deleted',
      archiveSizeBytes: 0,
    };
    delete fallbackDeleted.archivePath;
    return deleted || fallbackDeleted;
  } catch (error) {
    await updateFailed(deps, deleteJobId, 'delete', error);
    await writeAudit(deps, 'backup.delete_failed', actor, {
      backupId: sourceJob.backupId,
      jobId: backupJobId,
      deleteJobId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function restoreBackupJob(deps: BackupServiceDeps, actor: BackupActor, backupJobId: string): Promise<BackupJobDocument> {
  const sourceJob = await deps.backupJobs.findOne({ _id: backupJobId });
  if (!sourceJob || sourceJob.jobType !== 'backup' || !sourceJob.archiveFileName) {
    throw new Error('Backup job not found');
  }

  const config = readBackupConfig(deps.settings, deps.env || process.env);
  if (!config.enabled) {
    throw new Error('Open Core backups are disabled by configuration');
  }
  if (config.destination.backend !== 'local') {
    throw new Error('Open Core restore currently supports local backup archive storage only');
  }

  let preRestoreBackup: BackupJobDocument | null = null;
  if (config.requirePreRestoreBackup) {
    preRestoreBackup = await createBackupJob(deps, actor);
  }

  const createdAt = new Date();
  const restoreJobId = await deps.backupJobs.insert({
    jobType: 'restore',
    status: 'running',
    createdAt,
    startedAt: createdAt,
    createdByUserId: actor.userId,
    sourceBackupId: backupJobId,
    archiveFileName: sourceJob.archiveFileName,
    destination: sourceJob.destination,
    restore: {
      ...(preRestoreBackup?._id ? { preRestoreBackupId: preRestoreBackup._id } : {}),
    },
  });

  try {
    await writeAudit(deps, 'backup.restore_started', actor, {
      jobId: restoreJobId,
      sourceBackupId: backupJobId,
      preRestoreBackupId: preRestoreBackup?._id || null,
    });

    const storage = createLocalBackupStorage(config);
    const archive = await storage.readArchive(sourceJob.archiveFileName);
    const verification = await verifyBackupArchive(archive);
    if (!verification.ok) {
      throw new Error(`Backup archive verification failed: ${verification.checks.filter((check) => check.status === 'fail').map((check) => check.name).join(', ')}`);
    }

    const entries = await readTarGzArchive(archive);
    const entriesByName = entryMap(entries);
    const databaseBody = entriesByName.get('mongo/database.json');
    if (!databaseBody) {
      throw new Error('Backup archive is missing mongo/database.json');
    }

    await restoreMongoDatabase(deps, parseMongoDump(databaseBody));

    const restoredComponents: BackupComponentStatus[] = [{
      name: 'mongo',
      status: 'included',
      path: 'mongo/database.json',
      message: 'Mongo application collections restored; backup_jobs and auditLog were preserved as restore control-plane collections.',
    }];

    if (getStorageBackend(deps.settings) === 'local') {
      const localPaths = getLocalStoragePaths(deps.settings, deps.env || process.env);
      for (const [name, rootPath, archivePrefix] of [
        ['dynamic-assets', localPaths.dynamicAssetsPath, 'dynamic-assets'],
        ['h5p-content', localPaths.h5pContentPath, 'h5p-content'],
        ['h5p-libraries', localPaths.h5pLibrariesPath, 'h5p-libraries'],
      ] as const) {
        if (!manifestIncludesComponent(verification.manifest, name)) {
          restoredComponents.push({
            name,
            status: 'excluded',
            path: rootPath,
            message: `${name} was not included in this archive; existing local files were left unchanged.`,
          });
          continue;
        }
        const restored = await restoreLocalDirectory(entries, archivePrefix, rootPath);
        restoredComponents.push({
          name,
          status: restored.fileCount > 0 ? 'included' : 'warning',
          path: rootPath,
          fileCount: restored.fileCount,
          sizeBytes: restored.sizeBytes,
          ...(restored.fileCount > 0 ? {} : { message: `${archivePrefix} had no files in the backup archive` }),
        });
      }
    }

    const completedAt = new Date();
    await deps.backupJobs.update(restoreJobId, {
      $set: {
        status: 'complete',
        completedAt,
        manifest: verification.manifest,
        verification: {
          verifiedAt: completedAt,
          ok: true,
          checks: verification.checks,
        },
        restore: {
          restoredAt: completedAt,
          restoredByUserId: actor.userId,
          ...(preRestoreBackup?._id ? { preRestoreBackupId: preRestoreBackup._id } : {}),
          readinessCheckResult: {
            restoredComponents,
            skippedComponents: [
              'backup_jobs',
              'auditLog',
              'settings',
              'environment',
              'key-material',
              'redis',
            ],
          },
        },
      },
    });
    await writeAudit(deps, 'backup.restore_completed', actor, {
      jobId: restoreJobId,
      sourceBackupId: backupJobId,
      preRestoreBackupId: preRestoreBackup?._id || null,
    });
    const completed = await deps.backupJobs.findOne({ _id: restoreJobId });
    return completed || {
      _id: restoreJobId,
      jobType: 'restore',
      status: 'complete',
      createdAt,
      createdByUserId: actor.userId,
      sourceBackupId: backupJobId,
      archiveFileName: sourceJob.archiveFileName,
      destination: sourceJob.destination,
    };
  } catch (error) {
    await updateFailed(deps, restoreJobId, 'restore', error);
    await writeAudit(deps, 'backup.restore_failed', actor, {
      jobId: restoreJobId,
      sourceBackupId: backupJobId,
      preRestoreBackupId: preRestoreBackup?._id || null,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
