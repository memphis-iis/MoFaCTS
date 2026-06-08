import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createBackupMethods } from './backupMethods';

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
  it('requires admin access for backup configuration', async function() {
    const methods = createBackupMethods(createDeps({
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
    const methods = createBackupMethods(createDeps() as any);

    try {
      await methods['admin.backups.restore'].call({ userId: 'admin-user' }, 'backup-job', 'WRONG');
      throw new Error('Expected restore method to require RESTORE confirmation');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('restore-confirmation-required');
    }
  });

  it('requires explicit delete confirmation before deleting an archive', async function() {
    const methods = createBackupMethods(createDeps() as any);

    try {
      await methods['admin.backups.delete'].call({ userId: 'admin-user' }, 'backup-job', 'WRONG');
      throw new Error('Expected delete method to require DELETE confirmation');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('delete-confirmation-required');
    }
  });

  it('does not let non-admin callers mint backup download tokens', async function() {
    const methods = createBackupMethods(createDeps({
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
    const methods = createBackupMethods(createDeps({
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
