import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { BACKUP_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { consumeBackupDownloadToken } from '../lib/backup/backupDownloadTokens';
import type { BackupJobDocument, BackupRegistry } from '../lib/backup/backupTypes';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { createBackupMethodRegistration } from './backupMethods';

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      openCore: {
        backups: {
          enabled: false,
          backend: 'local',
        },
      },
    },
    backupJobs: {
      insert: async () => 'backup-job',
      update: async () => undefined,
      find: () => ({ fetchAsync: async () => [] }),
      findOne: async () => null,
    },
    rawDatabase: () => ({
      databaseName: 'MoFACT-meteor3',
      collections: async () => [],
    }),
    usersCollection: {
      findOneAsync: async () => null,
    },
    auditLog: {
      insertAsync: async () => undefined,
    },
    requireAdminUser: async () => undefined,
    ...overrides,
  };
}

describe('backupMethods', function() {
  it('binds all backup methods and authorizes before validation or unblocking', async function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const handlers = (Meteor as any).server.method_handlers;
    for (const verification of Object.values(BACKUP_METHOD_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      expect(entries[0]?.policy).to.deep.equal({ kind: 'role', role: 'admin' });
      const handler = handlers[verification.method];
      expect(handler).to.be.a('function');
      for (const userId of [null, 'synthetic-missing-backup-user']) {
        let error: unknown;
        let unblocked = false;
        try { await handler.call({ userId, unblock() { unblocked = true; } }, '', ''); }
        catch (caught) { error = caught; }
        expect(error).to.be.instanceOf(Meteor.Error);
        expect(error).to.include({ error: 'not-authorized', reason: 'Only admins can manage backups' });
        expect(unblocked).to.equal(false);
      }
    }
  });

  it('preserves authorized operations on a disposable backup archive', async function() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-method-backup-'));
    const jobs = new Map<string, BackupJobDocument>();
    const backupJobs: BackupRegistry = {
      async insert(job) {
        const id = String(jobs.size + 1);
        jobs.set(id, { ...job, _id: id });
        return id;
      },
      async update(id, modifier) {
        Object.assign(jobs.get(id)!, modifier.$set);
      },
      find() {
        return { fetchAsync: async () => [...jobs.values()].filter(job => job.jobType === 'backup' && job.status !== 'deleted') };
      },
      async findOne(selector) {
        return jobs.get(String(selector._id)) ?? null;
      },
    };
    const events: string[] = [];
    const { methods } = createBackupMethodRegistration({
      env: {},
      settings: { openCore: { backups: {
        enabled: true,
        localBackupPath: directory,
        includeSettings: false,
        includeEnvironmentFile: false,
        includeKeyMaterial: false,
        includeLocalAssetFiles: false,
      } } },
      backupJobs,
      rawDatabase: () => ({
        databaseName: 'synthetic-backup-method-test',
        async collections() { return []; },
        collection() { throw new Error('This fixture never writes to MongoDB'); },
      }),
      usersCollection: { async findOneAsync() { return null; } },
      auditLog: { async insertAsync() { return undefined; } },
      async requireAdminUser(userId) {
        expect(userId).to.equal('synthetic-backup-admin');
        events.push('authorize');
      },
    });
    const context = { userId: 'synthetic-backup-admin', unblock() { events.push('unblock'); } };
    try {
      expect(await methods['admin.backups.config'].call(context)).to.include({ enabled: true, includeSettings: false });
      events.length = 0;
      const created = await methods['admin.backups.create'].call(context);
      expect(events).to.deep.equal(['authorize', 'unblock']);
      expect(created).to.include({ status: 'complete', createdByUserId: context.userId });
      expect(await methods['admin.backups.list'].call(context)).to.deep.equal([created]);
      expect(await methods['admin.backups.get'].call(context, ` ${created._id} `)).to.deep.equal(created);
      events.length = 0;
      const verified = await methods['admin.backups.verify'].call(context, created._id);
      expect(events).to.deep.equal(['authorize', 'unblock']);
      expect(verified.status).to.equal('verified');
      const capability = await methods['admin.backups.downloadToken'].call(context, created._id);
      const token = decodeURIComponent(capability.url.split('/')[4] ?? '');
      expect(consumeBackupDownloadToken(token)?.backupJobId).to.equal(created._id);
      expect(consumeBackupDownloadToken(token)).to.equal(null);
      events.length = 0;
      const deleted = await methods['admin.backups.delete'].call(context, created._id, ' delete ');
      expect(events).to.deep.equal(['authorize', 'unblock']);
      expect(deleted.status).to.equal('deleted');
      expect(await fs.readdir(directory)).to.have.length(0);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('lists visible primary backup jobs without verify operation or deleted rows', async function() {
    let listSelector: Record<string, unknown> | undefined;
    const { methods } = createBackupMethodRegistration(createDeps({
      backupJobs: {
        insert: async () => 'backup-job',
        update: async () => undefined,
        find: (selector: Record<string, unknown>) => {
          listSelector = selector;
          return { fetchAsync: async () => [] };
        },
        findOne: async () => null,
      },
    }) as any);

    await methods['admin.backups.list'].call({ userId: 'admin-user' });

    expect(listSelector).to.deep.equal({ jobType: 'backup', status: { $ne: 'deleted' } });
  });

  it('requires admin access for backup configuration', async function() {
    const { methods } = createBackupMethodRegistration(createDeps({
      requireAdminUser: async () => {
        throw new Meteor.Error('not-authorized', 'Only admins can manage backups');
      },
    }) as any);

    try {
      await methods['admin.backups.config'].call({ userId: 'teacher-user' });
      throw new Error('Expected config method to reject non-admin caller');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });

  it('requires explicit restore confirmation before guarded restore work starts', async function() {
    const { methods } = createBackupMethodRegistration(createDeps() as any);

    try {
      await methods['admin.backups.restore'].call({ userId: 'admin-user' }, 'backup-job', 'WRONG');
      throw new Error('Expected restore method to require RESTORE confirmation');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('restore-confirmation-required');
    }
  });

  it('requires explicit delete confirmation before deleting an archive', async function() {
    const { methods } = createBackupMethodRegistration(createDeps() as any);

    try {
      await methods['admin.backups.delete'].call({ userId: 'admin-user' }, 'backup-job', 'WRONG');
      throw new Error('Expected delete method to require DELETE confirmation');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('delete-confirmation-required');
    }
  });

  it('accepts delete confirmation case-insensitively with surrounding whitespace', async function() {
    let deletedJobId = '';
    const { methods } = createBackupMethodRegistration(createDeps({
      settings: {
        openCore: {
          backups: {
            enabled: true,
            backend: 'local',
            localBackupPath: '/tmp',
          },
        },
      },
      backupJobs: {
        insert: async () => 'delete-job',
        update: async () => undefined,
        find: () => ({ fetchAsync: async () => [] }),
        findOne: async (selector: Record<string, unknown>) => {
          deletedJobId = String(selector._id || '');
          return {
            _id: selector._id,
            jobType: 'backup',
            status: 'failed',
            createdAt: new Date('2026-06-07T00:00:00.000Z'),
            createdByUserId: 'admin-user',
            archiveFileName: 'mofacts-backup-20260607-010203-confirmtest.tar.gz',
            destination: { backend: 'local', path: '/tmp' },
          };
        },
      },
    }) as any);

    await methods['admin.backups.delete'].call({ userId: 'admin-user' }, 'backup-job', ' delete ');

    expect(deletedJobId).to.equal('backup-job');
  });

  it('does not let non-admin callers mint backup download tokens', async function() {
    const { methods } = createBackupMethodRegistration(createDeps({
      requireAdminUser: async () => {
        throw new Meteor.Error('not-authorized', 'Only admins can manage backups');
      },
    }) as any);

    try {
      await methods['admin.backups.downloadToken'].call({ userId: 'teacher-user' }, 'backup-job');
      throw new Error('Expected download token method to reject non-admin caller');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });

  it('does not let non-admin callers delete backup archives', async function() {
    const { methods } = createBackupMethodRegistration(createDeps({
      requireAdminUser: async () => {
        throw new Meteor.Error('not-authorized', 'Only admins can manage backups');
      },
    }) as any);

    try {
      await methods['admin.backups.delete'].call({ userId: 'teacher-user' }, 'backup-job', 'DELETE');
      throw new Error('Expected delete method to reject non-admin caller');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });
});
