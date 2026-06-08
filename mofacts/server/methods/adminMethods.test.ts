import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createAdminMethods } from './adminMethods';

function createAdminDeps() {
  let dynamicSettingsDoc: any = null;
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
    DynamicSettings: {
      findOneAsync: async () => dynamicSettingsDoc,
      upsertAsync: async (_selector: any, modifier: any) => {
        dynamicSettingsDoc = {
          key: 'apiKeyAlternatives',
          value: {
            ...(dynamicSettingsDoc?.value || {}),
          },
          ...(modifier.$setOnInsert || {}),
        };
        for (const [path, value] of Object.entries(modifier.$set || {})) {
          const parts = path.split('.');
          let target = dynamicSettingsDoc;
          for (const part of parts.slice(0, -1)) {
            target[part] = target[part] || {};
            target = target[part];
          }
          target[parts[parts.length - 1]!] = value;
        }
        for (const path of Object.keys(modifier.$unset || {})) {
          const parts = path.split('.');
          let target = dynamicSettingsDoc;
          for (const part of parts.slice(0, -1)) {
            target = target?.[part];
          }
          if (target) {
            delete target[parts[parts.length - 1]!];
          }
        }
      },
    },
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
    encryptData: (value: string) => `encrypted:${value}`,
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

  it('stores admin API key alternatives encrypted and returns metadata only', async function() {
    const deps = createAdminDeps();
    const methods = createAdminMethods(deps);

    const result = await methods.saveAdminApiKeyAlternative.call(
      { userId: 'admin-user' },
      'openrouter',
      { apiKey: 'sk-or-v1-test', model: 'openai/test-model' }
    );

    expect(result.openRouter.configured).to.equal(true);
    expect(result.openRouter.model).to.equal('openai/test-model');
    expect(JSON.stringify(result)).to.not.contain('sk-or-v1-test');
    expect(JSON.stringify(result)).to.not.contain('encrypted:');
  });

  it('denies admin API key metadata to non-admin callers', async function() {
    const deps = {
      ...createAdminDeps(),
      requireAdminUser: async () => {
        throw new Meteor.Error('not-authorized', 'Only admins can read API key alternative settings');
      },
    };
    const methods = createAdminMethods(deps);

    try {
      await methods.getAdminApiKeyAlternativeMetadata.call({ userId: 'learner' });
      throw new Error('Expected metadata read to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });
});
