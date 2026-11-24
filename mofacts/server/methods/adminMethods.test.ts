import { Meteor } from 'meteor/meteor';
import { strict as assert } from 'node:assert';
import { Roles } from 'meteor/alanning:roles';
import { Random } from 'meteor/random';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { Histories, GlobalExperimentStates, SectionUserMap } from '../../common/Collections';
import { ADMIN_OPERATION_VERIFICATIONS, ADMIN_ROLE_CHANGE_VERIFICATION } from '../../common/securityAudit/verificationCatalog';
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
    isValidEmailAddress: (value: string) => value.includes('@'),
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
    HistoryCommitState: { removeAsync: async () => 0 },
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
    removeSparcFigureUserDecisions: async () => undefined,
    removeSimulationResearchUserRecords: async () => undefined,
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

  it('requires an administrator for installed site management operations', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed administrative operations');
    const args = {
      initializeCustomTheme: ['Default'],
      createThemeFromBase: [{ name: 'Synthetic' }],
      duplicateTheme: [{ sourceThemeId: 'synthetic', name: 'Copy' }],
      importThemeFile: [{}],
      exportThemeFile: ['synthetic'],
      deleteTheme: ['synthetic'],
      renameTheme: [{ themeId: 'synthetic', newName: 'Renamed' }],
      setActiveTheme: ['synthetic'],
      setCustomHelpPage: ['Synthetic help'],
      removeCustomHelpPage: [],
      getServerStatus: [],
      setVerbosity: [1],
      setClientVerbosity: [1],
      getAdminTestSparcCompoundInterestSource: ['synthetic', 'page'],
      getAdminTestSparcCompoundInterestSources: [],
      getAdminApiKeyAlternativeMetadata: [],
      saveAdminApiKeyAlternative: ['openrouter', {}],
      deleteAdminApiKeyAlternative: ['openrouter'],
      userAdminDeleteUser: ['synthetic'],
      userAdminNewsEmailRecipients: [],
      getAdminTestOpenRouterCapability: [],
      callAdminTestResolvedOpenRouterJson: [{}],
      callAdminTestOpenRouterRequest: [{}],
      setCustomThemeProperty: ['themeName', 'Test'],
      refreshUserAdminUsageCaches: [[]],
      getSparcVideoCatalogTargets: ['synthetic'],
      prepareSparcVideoCatalogTarget: ['synthetic', 'target'],
      saveSparcVideoCatalogPassages: ['synthetic', 'target', []],
      deleteSparcInstructionalComponent: ['synthetic'],
      updateStimDisplayTypeMap: [],
      getSparcLibraryClusters: [],
      listSparcInstructionalComponents: [{}],
      replaceSparcLibraryImage: [{}],
      reviseSparcPrimitive: ['synthetic', {}],
      insertNewUsers: ['roster.csv', 'email,password'],
    };
    for (const verification of ADMIN_OPERATION_VERIFICATIONS) {
      const method = verification.method;
      const rows: typeof observed.surfaces = observed.surfaces.filter(row => row.name === method);
      assert.equal(rows.length, 1, method);
      assert.equal(rows[0]?.verification, verification);
      assert.deepEqual(rows[0]?.policy, { kind: 'role', role: 'admin' });
      const handler = (Meteor as any).server.method_handlers[method];
      for (const userId of [null, Random.id()]) {
        await assert.rejects(() => handler.apply({ userId }, args[method]),
          (err: any) => (userId ? [403, 'unauthorized', 'not-authorized'] : [401, 403, 'not-logged-in', 'unauthorized', 'not-authorized']).includes(err.error), method);
      }
    }
  });

  it('preserves an enrolled account and creates only new accounts through the installed roster import', async function() {
    const actor = Random.id(), learner = Random.id(), sectionId = Random.id();
    const email = learner.toLowerCase() + '@example.invalid';
    const newEmail = Random.id().toLowerCase() + '@example.invalid';
    const settings = Meteor.settings as any, original = settings.auth;
    const run = () => (Meteor as any).server.method_handlers.insertNewUsers.call({ userId: actor }, 'roster.csv',
      ['email,password', email + ',', newEmail + ',"' + Random.secret() + ',quoted"', newEmail + ','].join('\n'));
    try {
      settings.auth = { ...original, requireEmailVerification: false };
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(actor, 'admin');
      await Meteor.users.insertAsync({ _id: learner, username: email, emails: [{ address: email, verified: true }],
        services: { password: { bcrypt: 'synthetic-existing-hash' } } } as any);
      await SectionUserMap.insertAsync({ userId: learner, sectionId });
      const before = await Meteor.users.findOneAsync(learner);
      assert.deepEqual(await run(), { created: 1, skippedRows: [2, 4], errors: [] });
      assert.deepEqual(await run(), { created: 0, skippedRows: [2, 3, 4], errors: [] });
      assert.deepEqual(await Meteor.users.findOneAsync(learner), before);
      assert.equal(await SectionUserMap.find({ userId: learner, sectionId }).countAsync(), 1);
      const created = await Meteor.users.findOneAsync({ username: newEmail });
      assert.ok(created);
      assert.equal(await SectionUserMap.find({ userId: created._id }).countAsync(), 0);
    } finally {
      if (original === undefined) delete settings.auth; else settings.auth = original;
      await SectionUserMap.removeAsync({ userId: learner, sectionId });
      await Meteor.users.removeAsync({ username: { $in: [email, newEmail] } });
      await Roles.setUserRolesAsync(actor, []);
    }
  });

  it('uses one current contact per account for the news draft and deduplicates shared addresses', async function() {
    const accounts = [
      { email_canonical: 'Current@example.invalid', emails: [{ address: 'other@example.invalid' }] },
      { emails: [{ address: 'CURRENT@example.invalid' }, { address: 'second@example.invalid' }] },
      { emails: [{ address: 'primary@example.invalid' }] },
      { username: 'username@example.invalid', email_original: 'old@example.invalid' },
    ];
    const deps = createAdminDeps();
    const methods = createAdminMethods({ ...deps, usersCollection: { ...deps.usersCollection,
      find: () => ({ fetchAsync: async () => accounts }),
    } });
    assert.deepEqual(await methods.userAdminNewsEmailRecipients.call({ userId: 'admin' }), {
      emails: ['current@example.invalid', 'primary@example.invalid'], count: 2,
    });
  });

  it('skips existing roster accounts before password validation and reports rows on reimport', async function() {
    const accounts = new Set(['existing@example.invalid']);
    const created: string[] = [];
    const csvRows = [
      ['email', 'password'], ['EXISTING@example.invalid', ''], ['new@example.invalid', Random.secret()],
      ['new@example.invalid', ''], [''],
    ];
    const deps = {
      ...createAdminDeps(),
      findNormalAccountUserByCanonicalEmail: async (email: string) => accounts.has(email) ? { _id: email } : null,
      assertStrongPassword: (password: string) => assert.ok(password),
      createUserWithRetry: async (email: string) => {
        accounts.add(email);
        created.push(email);
        return email;
      },
    };
    const handler = createAdminMethods(deps).insertNewUsers;
    const run = () => handler.call({ userId: 'admin' }, 'roster.csv', csvRows.map(row => row.join(',')).join('\n'));
    assert.deepEqual(await run(), { created: 1, skippedRows: [2, 4], errors: [] });
    assert.deepEqual(await run(), { created: 0, skippedRows: [2, 3, 4], errors: [] });
    assert.deepEqual(created, ['new@example.invalid']);
  });

  it('protects configured accounts before cleanup and removes eligible learner progress', async function() {
    const actor = Random.id(), target = Random.id();
    const email = target.toLowerCase() + '@example.invalid';
    const settings = Meteor.settings as any, original = settings.initRoles;
    const remove = () => (Meteor as any).server.method_handlers.userAdminDeleteUser.call({ userId: actor }, target);
    try {
      await Meteor.users.insertAsync({ _id: actor, username: actor } as any);
      await Meteor.users.insertAsync({ _id: target, username: target, emails: [{ address: email, verified: true }] } as any);
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(actor, 'admin');
      await Histories.insertAsync({ userId: target } as any);
      await GlobalExperimentStates.insertAsync({ userId: target } as any);
      for (const key of ['admins', 'teachers']) {
        settings.initRoles = { [key]: [email] };
        await assert.rejects(remove, (err: any) => err.error === 'delete-user-configured');
        assert.ok(await Meteor.users.findOneAsync(target));
        assert.ok(await Histories.findOneAsync({ userId: target }));
        assert.ok(await GlobalExperimentStates.findOneAsync({ userId: target }));
      }
      settings.initRoles = {};
      assert.equal((await remove()).RESULT, 'SUCCESS');
      assert.ok(!await Meteor.users.findOneAsync(target));
      assert.ok(!await Histories.findOneAsync({ userId: target }));
      assert.ok(!await GlobalExperimentStates.findOneAsync({ userId: target }));
    } finally {
      if (original === undefined) delete settings.initRoles; else settings.initRoles = original;
      await Roles.setUserRolesAsync(actor, []);
      await Histories.removeAsync({ userId: target });
      await GlobalExperimentStates.removeAsync({ userId: target });
      await Meteor.users.removeAsync({ _id: { $in: [actor, target] } });
    }
  });

  it('protects self and configured roles while permitting ordinary administrator handoff', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed admin role change');
    const rows = observed.surfaces.filter(row => row.name === 'userAdminRoleChange');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.verification, ADMIN_ROLE_CHANGE_VERIFICATION);
    const handler = (Meteor as any).server.method_handlers.userAdminRoleChange;
    const admin = Random.id(), successor = Random.id();
    const email = successor.toLowerCase() + '@example.invalid';
    const alias = admin.toLowerCase() + '@example.invalid';
    const settings = Meteor.settings as any;
    const initRoles = settings.initRoles;
    const change = (actor: string, target: string, action: string, role: string) =>
      handler.call({ userId: actor }, target, action, role);
    try {
      await Meteor.users.insertAsync({ _id: admin, username: admin } as any);
      await Meteor.users.insertAsync({ _id: successor, username: successor, emails: [
        { address: email, verified: true }, { address: alias, verified: true },
      ] } as any);
      for (const role of ['admin', 'teacher']) await Roles.createRoleAsync(role, { unlessExists: true });
      await Roles.addUsersToRolesAsync(admin, 'admin');
      await assert.rejects(change(successor, admin, 'remove', 'admin'), (e: any) => e.error === 'not-authorized');
      await assert.rejects(change(admin, admin, 'remove', 'admin'), (e: any) => e.error === 'admin-self-demotion');
      await change(admin, successor, 'add', 'admin');
      await change(admin, successor, 'add', 'teacher');
      settings.initRoles = { admins: [email.toUpperCase()], teachers: [alias] };
      for (const role of ['admin', 'teacher']) {
        await assert.rejects(change(admin, successor, 'remove', role), (e: any) => e.error === 'role-granted-by-settings');
        assert.equal(await Roles.userIsInRoleAsync(successor, role), true);
      }
      settings.initRoles = { admins: [email], teachers: [] };
      await change(admin, successor, 'remove', 'teacher');
      assert.equal(await Roles.userIsInRoleAsync(successor, 'teacher'), false);
      await change(successor, admin, 'remove', 'admin');
      assert.equal(await Roles.userIsInRoleAsync(admin, 'admin'), false);
    } finally {
      if (initRoles === undefined) delete settings.initRoles;
      else settings.initRoles = initRoles;
      for (const id of [admin, successor]) {
        await Roles.setUserRolesAsync(id, []);
        await Meteor.users.removeAsync(id);
      }
    }
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
