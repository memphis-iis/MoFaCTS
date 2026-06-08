import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { createBackupManifest } from './backupManifest';
import { createTarGzArchive } from './tarArchive';
import { deleteBackupJob, restoreBackupJob } from './backupService';
import type { BackupJobDocument } from './backupTypes';

describe('backup restore service', function() {
  it('restores application collections while preserving backup and audit control-plane collections', async function() {
    const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-restore-test-'));
    const backupPath = path.join(basePath, 'backups');
    const dynamicAssetsPath = path.join(basePath, 'dynamic-assets');
    const h5pContentPath = path.join(basePath, 'h5p-content');
    const h5pLibrariesPath = path.join(basePath, 'h5p-libraries');
    await fs.mkdir(backupPath);
    await fs.mkdir(dynamicAssetsPath);
    await fs.mkdir(h5pContentPath);
    await fs.mkdir(h5pLibrariesPath);

    const mongoDump = Buffer.from(JSON.stringify({
      databaseName: 'MoFACT-meteor3',
      exportedAt: '2026-06-07T00:00:00.000Z',
      collections: {
        tdfs: [{ _id: 'tdf-1', name: 'Restored TDF' }],
        backup_jobs: [{ _id: 'old-backup-job' }],
        auditLog: [{ _id: 'old-audit-log' }],
      },
    }), 'utf8');
    const manifest = createBackupManifest({
      createdAt: new Date('2026-06-07T00:00:00.000Z'),
      createdByUserId: 'admin-user',
      mongoDatabaseName: 'MoFACT-meteor3',
      storageBackend: 'local',
      entries: [{ name: 'mongo/database.json', body: mongoDump }],
      includedComponents: [],
      excludedComponents: [],
      warnings: [],
    });
    const archive = await createTarGzArchive([
      { name: 'manifest.json', body: Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8') },
      { name: 'mongo/database.json', body: mongoDump },
    ]);
    const archiveFileName = 'mofacts-backup-20260607-000000-restoretest.tar.gz';
    await fs.writeFile(path.join(backupPath, archiveFileName), archive);

    const jobs = new Map<string, BackupJobDocument>([
      ['source-backup', {
        _id: 'source-backup',
        jobType: 'backup',
        status: 'complete',
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
        createdByUserId: 'admin-user',
        archiveFileName,
        destination: { backend: 'local', path: backupPath },
      }],
    ]);
    let insertedJobCount = 0;
    const operations: Array<{ collection: string; operation: string; docs?: unknown[] }> = [];
    const deps = {
      settings: {
        openCore: {
          backups: {
            enabled: true,
            backend: 'local',
            localBackupPath: backupPath,
            requirePreRestoreBackup: false,
          },
        },
        storage: {
          backend: 'local',
          local: {
            dynamicAssetsPath,
            h5pContentPath,
            h5pLibrariesPath,
          },
        },
      },
      backupJobs: {
        insert: async (doc: BackupJobDocument) => {
          insertedJobCount += 1;
          const id = `restore-job-${insertedJobCount}`;
          jobs.set(id, { ...doc, _id: id });
          return id;
        },
        update: async (jobId: string, modifier: Record<string, any>) => {
          const current = jobs.get(jobId);
          if (current && modifier.$set) {
            jobs.set(jobId, { ...current, ...modifier.$set });
          }
        },
        find: () => ({ fetchAsync: async () => Array.from(jobs.values()) }),
        findOne: async (selector: Record<string, unknown>) => jobs.get(String(selector._id)) || null,
      },
      rawDatabase: () => ({
        databaseName: 'MoFACT-meteor3',
        collections: async () => [
          { collectionName: 'tdfs', find: () => ({ toArray: async () => [] }) },
          { collectionName: 'backup_jobs', find: () => ({ toArray: async () => [] }) },
          { collectionName: 'auditLog', find: () => ({ toArray: async () => [] }) },
        ],
        collection: (name: string) => ({
          deleteMany: async () => {
            operations.push({ collection: name, operation: 'deleteMany' });
          },
          insertMany: async (docs: unknown[]) => {
            operations.push({ collection: name, operation: 'insertMany', docs });
          },
        }),
      }),
      usersCollection: {
        findOneAsync: async () => null,
      },
      auditLog: {
        insertAsync: async () => undefined,
      },
    };

    const result = await restoreBackupJob(deps, { userId: 'admin-user', connection: null }, 'source-backup');

    expect(result.status).to.equal('complete');
    expect(operations).to.deep.equal([
      { collection: 'tdfs', operation: 'deleteMany' },
      { collection: 'tdfs', operation: 'insertMany', docs: [{ _id: 'tdf-1', name: 'Restored TDF' }] },
    ]);
  });

  it('deletes the local archive and marks the backup job deleted', async function() {
    const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-delete-test-'));
    const archiveFileName = 'mofacts-backup-20260607-010203-deletetest.tar.gz';
    await fs.writeFile(path.join(basePath, archiveFileName), Buffer.from('archive', 'utf8'));
    const jobs = new Map<string, BackupJobDocument>([
      ['source-backup', {
        _id: 'source-backup',
        jobType: 'backup',
        status: 'complete',
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
        createdByUserId: 'admin-user',
        archiveFileName,
        archivePath: path.join(basePath, archiveFileName),
        archiveSizeBytes: 7,
        destination: { backend: 'local', path: basePath },
      }],
    ]);
    const deps = {
      settings: {
        openCore: {
          backups: {
            enabled: true,
            backend: 'local',
            localBackupPath: basePath,
          },
        },
      },
      backupJobs: {
        insert: async (doc: BackupJobDocument) => {
          jobs.set('delete-job', { ...doc, _id: 'delete-job' });
          return 'delete-job';
        },
        update: async (jobId: string, modifier: Record<string, any>) => {
          const current = jobs.get(jobId);
          if (current && modifier.$set) {
            jobs.set(jobId, { ...current, ...modifier.$set });
          }
        },
        find: () => ({ fetchAsync: async () => Array.from(jobs.values()) }),
        findOne: async (selector: Record<string, unknown>) => jobs.get(String(selector._id)) || null,
      },
      rawDatabase: () => ({
        databaseName: 'MoFACT-meteor3',
        collections: async () => [],
        collection: () => ({
          deleteMany: async () => undefined,
          insertMany: async () => undefined,
        }),
      }),
      usersCollection: {
        findOneAsync: async () => null,
      },
      auditLog: {
        insertAsync: async () => undefined,
      },
    };

    const result = await deleteBackupJob(deps, { userId: 'admin-user', connection: null }, 'source-backup');

    expect(result.status).to.equal('deleted');
    expect(await fs.stat(path.join(basePath, archiveFileName)).then(() => true).catch(() => false)).to.equal(false);
    expect(jobs.get('delete-job')?.status).to.equal('complete');
  });
});
