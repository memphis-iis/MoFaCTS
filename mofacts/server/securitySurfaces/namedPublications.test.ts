import { expect } from 'chai';
import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { DynamicSettings, UserDashboardCache } from '../../common/Collections';
import { DEPLOYMENT_BRAND_PROFILE_KEY } from '../../common/deploymentBrandProfile';
import { CLIENT_VERBOSITY_SETTING } from '../../common/loggingSettings';
import { NAMED_PUBLICATION_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registeredNamedPublications } from './registerNamedPublication.ts';

describe('named application publications', function() {
  const prefix = `publication-${Random.id()}`;
  const owner = `${prefix}-owner`, admin = `${prefix}-admin`;
  const ownerCache = Random.id(), adminCache = Random.id();
  const library = Random.id(), unrelated = Random.id();
  const users = Meteor.users as any;
  let createdClientSetting = false;

  function invoke(name: string, userId: string | null, ...args: unknown[]) {
    const emitted: Array<{ collection: string; id: string; fields: unknown }> = [];
    let readyCalls = 0;
    const handler = (Meteor as any).server.publish_handlers[name];
    expect(handler, name).to.be.a('function');
    const result = handler.call({
      userId,
      added(collection: string, id: string, fields: unknown) { emitted.push({ collection, id, fields }); },
      ready() { readyCalls++; },
    }, ...args);
    return { result, emitted, get readyCalls() { return readyCalls; } };
  }

  before(async function() {
    await users.insertAsync({ _id: owner, username: owner, audioPromptMode: 'silent', preferences: { practiceTableStatisticsExpanded: true, other: 'synthetic' },
      lastSessionId: 'synthetic-session', lastSessionIdTimestamp: 123, services: { synthetic: true } });
    await users.insertAsync({ _id: admin, username: admin });
    await Roles.createRoleAsync('admin', { unlessExists: true });
    await Roles.addUsersToRolesAsync(admin, 'admin');
    await UserDashboardCache.insertAsync({ _id: ownerCache, userId: owner, summary: { synthetic: true }, unprojected: true });
    await UserDashboardCache.insertAsync({ _id: adminCache, userId: admin, usageSummary: { synthetic: true } });
    await DynamicSettings.insertAsync({ _id: unrelated, key: prefix, value: 'synthetic' });
    if (!await DynamicSettings.findOneAsync(CLIENT_VERBOSITY_SETTING.id)) {
      await DynamicSettings.insertAsync({ _id: CLIENT_VERBOSITY_SETTING.id, key: CLIENT_VERBOSITY_SETTING.key, value: 0 });
      createdClientSetting = true;
    }
  });

  after(async function() {
    await Roles.removeUsersFromRolesAsync(admin, 'admin');
    await users.removeAsync({ _id: { $in: [owner, admin] } });
    await UserDashboardCache.removeAsync({ _id: { $in: [ownerCache, adminCache] } });
    await DynamicSettings.removeAsync({ _id: { $in: [unrelated, library] } });
    if (createdClientSetting) await DynamicSettings.removeAsync(CLIENT_VERBOSITY_SETTING.id);
  });

  it('omits retired lesson listings and preserves signed-out readiness for active listings', async function() {
    const handlers = (Meteor as any).server.publish_handlers;
    for (const retired of ['ownedTdfs', 'pagedTdfsListing']) expect(handlers).not.to.have.own.property(retired);
    for (const active of ['allTdfsListing', 'dashboardTdfsListing']) {
      const observation = invoke(active, null);
      await observation.result;
      expect(observation.readyCalls).to.equal(1);
      expect(observation.emitted).to.deep.equal([]);
      const cursor = await invoke(active, owner).result;
      expect(cursor.fetchAsync).to.be.a('function');
    }
  });

  it('binds each characterized publication to one reviewed descriptor', function() {
    const cases = Object.entries(NAMED_PUBLICATION_VERIFICATIONS);
    expect(registeredNamedPublications()).to.have.length(cases.length);
    for (const [name, verification] of cases) {
      const matches = registeredNamedPublications().filter(item => item.name === name);
      expect(matches).to.have.length(1);
      expect(matches[0]).to.include({ surfaceId: verification.surfaceId, verification });
    }
  });

  it('preserves public branding cursors and their exact setting keys', async function() {
    for (const [name, key] of [['theme', 'customTheme'], ['deploymentBrandProfile', DEPLOYMENT_BRAND_PROFILE_KEY]]) {
      const observation = invoke(name!, null);
      expect(observation.result).to.be.instanceOf(Promise);
      const entries = await (await observation.result).fetchAsync();
      expect(entries.length, name).to.be.greaterThan(0);
      expect(entries.every((entry: { key: string }) => entry.key === key)).to.equal(true);
    }
    await DynamicSettings.insertAsync({ _id: library, key: 'themeLibrary', value: [] });
    const observation = invoke('themeLibrary', null);
    expect(observation.result).not.to.be.instanceOf(Promise);
    const entries = await observation.result.fetchAsync();
    expect(entries.some((entry: { _id: string }) => entry._id === library)).to.equal(true);
    expect(entries.every((entry: { key: string }) => entry.key === 'themeLibrary')).to.equal(true);
  });

  it('preserves authenticated dashboard, runtime setting, and audio scope', async function() {
    for (const name of ['dashboardCache', 'clientRuntimeSettings', 'userAudioSettings']) {
      const anonymous = invoke(name, null);
      expect(anonymous.result instanceof Promise).to.equal(name === 'userAudioSettings');
      expect(await anonymous.result).to.equal(undefined);
      expect(anonymous.readyCalls).to.equal(1);
    }
    const dashboard = await invoke('dashboardCache', owner).result.fetchAsync();
    expect(dashboard).to.deep.equal([{ _id: ownerCache, userId: owner, summary: { synthetic: true } }]);

    const settings = await invoke('clientRuntimeSettings', owner).result.fetchAsync();
    expect(settings.map((entry: { _id: string }) => entry._id)).to.deep.equal([CLIENT_VERBOSITY_SETTING.id]);

    const audio = await (await invoke('userAudioSettings', owner).result).fetchAsync();
    expect(audio.map((entry: { _id: string }) => entry._id)).to.deep.equal([owner]);
    expect(audio[0].audioSettings.audioPromptMode).to.equal('silent');
    expect(audio[0]).to.have.all.keys('_id', 'audioSettings', 'lastSessionId', 'lastSessionIdTimestamp');
    expect(audio[0]).to.include({ lastSessionId: 'synthetic-session', lastSessionIdTimestamp: 123 });
    const getPreference = (Meteor as any).server.method_handlers.getUserPreference;
    expect(await getPreference.call({ userId: owner }, 'practiceTableStatisticsExpanded')).to.equal(true);
    expect((await users.findOneAsync(admin)).audioSettings).to.equal(undefined);
    expect((await users.findOneAsync(owner)).audioSettings).to.deep.equal(audio[0].audioSettings);
  });

  it('preserves administrator-only snapshots, cursor scope and readiness', async function() {
    for (const [name, args] of [
      ['settings', []], ['filteredUsers', [prefix, 0, 2]], ['filteredUsersCount', [prefix]],
      ['userAdminDashboardUsage', [[admin]]],
    ] as const) {
      for (const actor of [null, owner]) {
        const denied = invoke(name, actor, ...args);
        expect(denied.result).to.be.instanceOf(Promise);
        expect(await denied.result).to.equal(undefined);
        expect(denied.readyCalls).to.equal(1);
        expect(denied.emitted).to.deep.equal([]);
      }
    }
    const settings = await (await invoke('settings', admin).result).fetchAsync();
    expect(settings.some((entry: { _id: string }) => entry._id === unrelated)).to.equal(true);

    const page = invoke('filteredUsers', admin, prefix, 0, 1);
    const roles = await (await page.result).fetchAsync();
    expect(page.emitted.map(({ collection, id }) => ({ collection, id }))).to.deep.equal([
      { collection: 'users', id: admin }, { collection: 'filtered_user_page_ids', id: admin },
    ]);
    expect(roles.map((row: { user: { _id: string } }) => row.user._id)).to.deep.equal([admin]);

    const invalid = invoke('filteredUsers', admin, prefix, -1, 1);
    expect(await invalid.result).to.equal(undefined);
    expect(invalid.readyCalls).to.equal(1);

    const count = invoke('filteredUsersCount', admin, prefix);
    await count.result;
    expect(count.emitted).to.deep.equal([{ collection: 'user_counts', id: 'filtered', fields: { count: 2 } }]);
    expect(count.readyCalls).to.equal(1);

    const selected = await (await invoke('userAdminDashboardUsage', admin, [admin]).result).fetchAsync();
    expect(selected).to.deep.equal([{ _id: adminCache, userId: admin, usageSummary: { synthetic: true } }]);
  });
});
