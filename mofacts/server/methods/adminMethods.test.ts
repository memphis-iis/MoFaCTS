import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createAdminMethods } from './adminMethods';

function createAdminDeps() {
  return {
    serverConsole: () => undefined,
    usersCollection: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async () => ({ _id: 'target-user', username: 'target@example.test' }),
      removeAsync: async () => 1,
    },
    Tdfs: {
      find: () => ({ countAsync: async () => 0, fetchAsync: async () => [] }),
      removeAsync: async () => 0,
    },
    DynamicAssets: {
      find: () => ({ countAsync: async () => 0, fetchAsync: async () => [] }),
      removeAsync: async () => 0,
    },
    Courses: { find: () => ({ countAsync: async () => 0 }) },
    DynamicSettings: { findOneAsync: async () => null },
    Histories: { removeAsync: async () => 0 },
    GlobalExperimentStates: { removeAsync: async () => 0 },
    SectionUserMap: { removeAsync: async () => 0 },
    UserTimesLog: { removeAsync: async () => 0 },
    UserMetrics: { removeAsync: async () => 0 },
    PasswordResetTokens: { removeAsync: async () => 0 },
    UserDashboardCache: { removeAsync: async () => 0 },
    UserUploadQuota: { removeAsync: async () => 0 },
    requireAdminUser: async () => undefined,
    normalizeCanonicalEmail: (rawEmail: unknown) => {
      const original = String(rawEmail || '').trim();
      return { original, canonical: original.toLowerCase() };
    },
    assertStrongPassword: () => undefined,
    withSignUpLock: async <T>(_username: string, work: () => Promise<T>) => await work(),
    findNormalAccountUserByCanonicalEmail: async () => null,
    createUserWithRetry: async () => 'created-user',
    enforceCanonicalEmailIdentity: async () => undefined,
    writeAuditLog: async () => undefined,
    syncUserAuthState: async () => undefined,
    isEmailVerificationRequired: () => false,
    sendVerificationEmailForUser: async () => false,
    getUserDisplayIdentifier: (user: any) => String(user?.username || user?._id || ''),
    syncUsernameCaches: () => undefined,
    deleteTdfRuntimeData: async () => undefined,
    clearStimDisplayTypeMap: () => undefined,
  };
}

describe('adminMethods', function() {
  it('does not let a non-admin caller grant roles', async function() {
    const deps = {
      ...createAdminDeps(),
      requireAdminUser: async () => {
        throw new Meteor.Error('not-authorized', 'You are not authorized to do that');
      },
    };
    const methods = createAdminMethods(deps);

    try {
      await methods.userAdminRoleChange.call({ userId: 'teacher-user' }, 'target-user', 'add', 'admin');
      throw new Error('Expected role grant to fail for non-admin caller');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });
});
