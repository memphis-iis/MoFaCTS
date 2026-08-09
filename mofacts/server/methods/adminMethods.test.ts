import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createAdminMethods } from './adminMethods';

function createAdminDeps(
  auditCalls: Array<{ action: string; details: any }> = [],
  catalog: any[] = [{
    id: 'openai/test-model',
    name: 'Test model',
    reasoning: { mandatory: false, supportedLevels: null, defaultLevel: 'medium' },
  }],
) {
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
      findOneAsync: async () => null,
      removeAsync: async () => 0,
    },
    DynamicAssets: {
      collection: {
        rawCollection: () => ({ countDocuments: async () => 0 }),
      },
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
    LearnerUnitAnalyticsCache: { removeAsync: async () => 0 },
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
    writeAuditLog: async (action: string, _actorUserId: string | null, _targetUserId: string | null, details: any) => {
      auditCalls.push({ action, details });
    },
    syncUserAuthState: async () => undefined,
    isEmailVerificationRequired: () => false,
    sendVerificationEmailForUser: async () => false,
    getUserDisplayIdentifier: (user: any) => String(user?.username || user?._id || ''),
    syncUsernameCaches: () => undefined,
    deleteTdfRuntimeData: async () => undefined,
    clearStimDisplayTypeMap: () => undefined,
    encryptData: (value: string) => `encrypted:${value}`,
    openRouterModelCatalogService: {
      getCatalog: async () => catalog,
    },
    getDynamicSettingsDoc: () => dynamicSettingsDoc,
  };
}

describe('adminMethods', function() {
  it('lists only uploaded SPARC pages compatible with the compound-interest evaluation', async function() {
    const compatibleDisplay = {
      unitType: 'sparc-autotutor-dialogue',
      autoTutorTargets: {
        expectations: [
          { clusterKC: 'autotutor.compound-interest-001.kc.compounding-mechanism' },
          { clusterKC: 'autotutor.compound-interest-001.kc.growth-consequence' },
          { clusterKC: 'autotutor.compound-interest-001.kc.frequency-effect' },
        ],
        misconceptions: [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }],
      },
    };
    const deps = {
      ...createAdminDeps(),
      Tdfs: {
        find: () => ({
          countAsync: async () => 2,
          fetchAsync: async () => [{
            _id: 'compound-tdf',
            content: { tdfs: { tutor: { setspec: { lessonname: 'Compound Interest' } } } },
            rawStimuliFile: { setspec: { sparcPages: [
              { pageId: 'compound-page', display: compatibleDisplay },
              {
                pageId: 'other-page',
                display: {
                  ...compatibleDisplay,
                  autoTutorTargets: { expectations: [], misconceptions: [] },
                },
              },
            ] } },
          }],
        }),
        findOneAsync: async () => null,
        removeAsync: async () => 0,
      },
    };
    const methods = createAdminMethods(deps);

    expect(await methods.getAdminTestSparcCompoundInterestSources.call({ userId: 'admin-user' }))
      .to.deep.equal([{
        tdfId: 'compound-tdf',
        tdfName: 'Compound Interest',
        pageId: 'compound-page',
      }]);
  });

  it('returns only the selected compatible uploaded SPARC display', async function() {
    const display = {
      unitType: 'sparc-autotutor-dialogue',
      autoTutorTargets: {
        expectations: [
          { clusterKC: 'autotutor.compound-interest-001.kc.compounding-mechanism' },
          { clusterKC: 'autotutor.compound-interest-001.kc.growth-consequence' },
          { clusterKC: 'autotutor.compound-interest-001.kc.frequency-effect' },
        ],
        misconceptions: [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }],
      },
    };
    const deps = {
      ...createAdminDeps(),
      Tdfs: {
        find: () => ({ countAsync: async () => 1, fetchAsync: async () => [] }),
        findOneAsync: async () => ({
          _id: 'compound-tdf',
          content: { fileName: 'Compound.zip' },
          rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'compound-page', display }] } },
        }),
        removeAsync: async () => 0,
      },
    };
    const methods = createAdminMethods(deps);

    expect(await methods.getAdminTestSparcCompoundInterestSource.call(
      { userId: 'admin-user' },
      'compound-tdf',
      'compound-page',
    )).to.deep.equal({
      tdfId: 'compound-tdf',
      tdfName: 'Compound.zip',
      pageId: 'compound-page',
      display,
    });
  });

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
    const auditCalls: Array<{ action: string; details: any }> = [];
    const deps = createAdminDeps(auditCalls);
    const methods = createAdminMethods(deps);

    const result = await methods.saveAdminApiKeyAlternative.call(
      { userId: 'admin-user' },
      'openrouter',
      {
        apiKey: 'sk-or-v1-test',
        model: 'openai/test-model',
        reasoningLevel: 'high',
        prefixCachingEnabled: true,
      }
    );

    expect(result.openRouter.configured).to.equal(true);
    expect(result.openRouter.model).to.equal('openai/test-model');
    expect(result.openRouter.reasoningLevel).to.equal('high');
    expect(result.openRouter.prefixCachingEnabled).to.equal(true);
    expect((deps as any).getDynamicSettingsDoc().value.openRouter.reasoningLevel).to.equal('high');
    expect((deps as any).getDynamicSettingsDoc().value.openRouter.prefixCachingEnabled).to.equal(true);
    expect(JSON.stringify(result)).to.not.contain('sk-or-v1-test');
    expect(JSON.stringify(result)).to.not.contain('encrypted:');
    expect(auditCalls).to.deep.include({
      action: 'admin.apiKeyAlternativeSaved',
      details: {
        provider: 'openrouter',
        keyUpdated: true,
        modelUpdated: true,
        reasoningLevelUpdated: true,
        prefixCachingUpdated: true,
        reasoningLevel: 'high',
        prefixCachingEnabled: true,
      },
    });
  });

  it('normalizes an absent admin OpenRouter reasoning level to none', async function() {
    const deps = createAdminDeps();
    const methods = createAdminMethods(deps);

    const result = await methods.saveAdminApiKeyAlternative.call(
      { userId: 'admin-user' },
      'openrouter',
      { model: 'openai/test-model' },
    );

    expect(result.openRouter.reasoningLevel).to.equal('none');
    expect(result.openRouter.prefixCachingEnabled).to.equal(false);
    expect((deps as any).getDynamicSettingsDoc().value.openRouter.reasoningLevel).to.equal('none');
  });

  it('returns the persisted admin OpenRouter reasoning level after settings are reloaded', async function() {
    const deps = createAdminDeps();
    const methods = createAdminMethods(deps);

    await methods.saveAdminApiKeyAlternative.call(
      { userId: 'admin-user' },
      'openrouter',
      { model: 'openai/test-model', reasoningLevel: 'high', prefixCachingEnabled: true },
    );
    const reloaded = await methods.getAdminApiKeyAlternativeMetadata.call({ userId: 'admin-user' });

    expect((deps as any).getDynamicSettingsDoc().value.openRouter.reasoningLevel).to.equal('high');
    expect(reloaded.openRouter.reasoningLevel).to.equal('high');
    expect(reloaded.openRouter.prefixCachingEnabled).to.equal(true);
  });

  it('rejects unsupported admin OpenRouter reasoning levels without writing settings', async function() {
    const deps = createAdminDeps();
    const methods = createAdminMethods(deps);

    let thrown: unknown;
    try {
      await methods.saveAdminApiKeyAlternative.call(
        { userId: 'admin-user' },
        'openrouter',
        { model: 'openai/test-model', reasoningLevel: 'extreme' },
      );
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((deps as any).getDynamicSettingsDoc()).to.equal(null);
  });

  it('does not persist none for an admin model whose live catalog requires reasoning', async function() {
    const deps = createAdminDeps([], [{
      id: 'openai/required-reasoning',
      name: 'Required reasoning',
      reasoning: { mandatory: true, supportedLevels: ['low', 'medium'], defaultLevel: 'medium' },
    }]);
    const methods = createAdminMethods(deps);

    let thrown: unknown;
    try {
      await methods.saveAdminApiKeyAlternative.call(
        { userId: 'admin-user' },
        'openrouter',
        { model: 'openai/required-reasoning', reasoningLevel: 'none' },
      );
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((deps as any).getDynamicSettingsDoc()).to.equal(null);
  });

  it('rejects a submitted admin model that is unavailable in the live catalog', async function() {
    const deps = createAdminDeps();
    const methods = createAdminMethods(deps);

    let thrown: unknown;
    try {
      await methods.saveAdminApiKeyAlternative.call(
        { userId: 'admin-user' },
        'openrouter',
        { model: 'openai/unavailable-model', reasoningLevel: 'none' },
      );
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((deps as any).getDynamicSettingsDoc()).to.equal(null);
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
