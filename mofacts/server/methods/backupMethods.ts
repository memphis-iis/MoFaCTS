import { Meteor } from 'meteor/meteor';
import { readBackupConfig, publicBackupConfigStatus } from '../lib/backup/backupConfig';
import {
  createBackupDownloadToken,
  createBackupJob,
  deleteBackupJob,
  restoreBackupJob,
  verifyBackupJob,
  type BackupServiceDeps,
} from '../lib/backup/backupService';
import type { BackupRegistry } from '../lib/backup/backupTypes';

type UnknownRecord = Record<string, unknown>;

type BackupMethodsDeps = BackupServiceDeps & {
  requireAdminUser: (userId: string | null | undefined, errMsg?: string, errorCode?: string | number) => Promise<void>;
};

type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

function publicJobFields() {
  return {
    error: { stack: 0 },
  };
}

async function requireAdmin(deps: BackupMethodsDeps, context: MethodContext): Promise<string> {
  await deps.requireAdminUser(context.userId, 'Only admins can manage backups', 'not-authorized');
  return String(context.userId);
}

function backupJobsCollection(deps: BackupMethodsDeps): BackupRegistry {
  return deps.backupJobs;
}

let activeBackupOperation: Promise<unknown> | null = null;

async function runExclusiveBackupOperation<T>(work: () => Promise<T>): Promise<T> {
  if (activeBackupOperation) {
    throw new Meteor.Error('backup-operation-active', 'Another backup or restore operation is already running');
  }
  const operation = work();
  activeBackupOperation = operation;
  try {
    return await operation;
  } finally {
    if (activeBackupOperation === operation) {
      activeBackupOperation = null;
    }
  }
}

function actorFromContext(userId: string, context: MethodContext) {
  return {
    userId,
    connection: context.connection
      ? { clientAddress: context.connection.clientAddress ?? null }
      : null,
  };
}

export function createBackupMethods(deps: BackupMethodsDeps) {
  return {
    'admin.backups.config': async function(this: MethodContext) {
      await requireAdmin(deps, this);
      return publicBackupConfigStatus(readBackupConfig(deps.settings, deps.env || process.env));
    },

    'admin.backups.list': async function(this: MethodContext) {
      await requireAdmin(deps, this);
      return await backupJobsCollection(deps)
        .find({ jobType: 'backup', status: { $ne: 'deleted' } }, {
          sort: { createdAt: -1 },
          limit: 50,
          fields: publicJobFields(),
        })
        .fetchAsync();
    },

    'admin.backups.get': async function(this: MethodContext, jobId: unknown) {
      await requireAdmin(deps, this);
      const normalizedJobId = typeof jobId === 'string' ? jobId.trim() : '';
      if (!normalizedJobId) {
        throw new Meteor.Error('invalid-backup-job', 'Backup job id is required');
      }
      const job = await backupJobsCollection(deps).findOne({ _id: normalizedJobId }, { fields: publicJobFields() });
      if (!job) {
        throw new Meteor.Error('not-found', 'Backup job not found');
      }
      return job;
    },

    'admin.backups.create': async function(this: MethodContext) {
      const userId = await requireAdmin(deps, this);
      this.unblock?.();
      return await runExclusiveBackupOperation(async () => await createBackupJob(deps, actorFromContext(userId, this)));
    },

    'admin.backups.verify': async function(this: MethodContext, backupJobId: unknown) {
      const userId = await requireAdmin(deps, this);
      const normalizedJobId = typeof backupJobId === 'string' ? backupJobId.trim() : '';
      if (!normalizedJobId) {
        throw new Meteor.Error('invalid-backup-job', 'Backup job id is required');
      }
      this.unblock?.();
      return await runExclusiveBackupOperation(async () => await verifyBackupJob(deps, actorFromContext(userId, this), normalizedJobId));
    },

    'admin.backups.downloadToken': async function(this: MethodContext, backupJobId: unknown) {
      const userId = await requireAdmin(deps, this);
      const normalizedJobId = typeof backupJobId === 'string' ? backupJobId.trim() : '';
      if (!normalizedJobId) {
        throw new Meteor.Error('invalid-backup-job', 'Backup job id is required');
      }
      return await createBackupDownloadToken(deps, actorFromContext(userId, this), normalizedJobId);
    },

    'admin.backups.delete': async function(this: MethodContext, backupJobId: unknown, confirmation: unknown) {
      const userId = await requireAdmin(deps, this);
      const normalizedJobId = typeof backupJobId === 'string' ? backupJobId.trim() : '';
      if (!normalizedJobId) {
        throw new Meteor.Error('invalid-backup-job', 'Backup job id is required');
      }
      const normalizedConfirmation = typeof confirmation === 'string' ? confirmation.trim().toUpperCase() : '';
      if (normalizedConfirmation !== 'DELETE') {
        throw new Meteor.Error('delete-confirmation-required', 'Type DELETE to confirm backup archive deletion');
      }
      this.unblock?.();
      return await runExclusiveBackupOperation(async () => await deleteBackupJob(deps, actorFromContext(userId, this), normalizedJobId));
    },

    'admin.backups.restore': async function(this: MethodContext, backupJobId: unknown, confirmation: unknown) {
      const userId = await requireAdmin(deps, this);
      const normalizedJobId = typeof backupJobId === 'string' ? backupJobId.trim() : '';
      if (!normalizedJobId) {
        throw new Meteor.Error('invalid-backup-job', 'Backup job id is required');
      }
      if (confirmation !== 'RESTORE') {
        throw new Meteor.Error('restore-confirmation-required', 'Type RESTORE to confirm this destructive operation');
      }
      this.unblock?.();
      return await runExclusiveBackupOperation(async () => await restoreBackupJob(deps, actorFromContext(userId, this), normalizedJobId));
    },
  };
}

export type BackupJobsCollectionLike = {
  insertAsync(doc: UnknownRecord): Promise<string>;
  updateAsync(selector: UnknownRecord | string, modifier: UnknownRecord): Promise<unknown>;
  find(selector?: UnknownRecord, options?: UnknownRecord): { fetchAsync(): Promise<any[]> };
  findOneAsync(selector: UnknownRecord, options?: UnknownRecord): Promise<any>;
};

export function createBackupRegistry(collection: BackupJobsCollectionLike): BackupRegistry {
  return {
    async insert(doc) {
      return await collection.insertAsync(doc as unknown as UnknownRecord);
    },
    async update(jobId, modifier) {
      await collection.updateAsync({ _id: jobId }, modifier);
    },
    find(selector = {}, options = {}) {
      return collection.find(selector, options);
    },
    async findOne(selector, options = {}) {
      return await collection.findOneAsync(selector, options);
    },
  };
}
