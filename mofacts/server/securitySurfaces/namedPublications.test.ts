import { expect } from 'chai';
import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { curSemester } from '../../common/Definitions';
import { Tdfs, DynamicSettings, UserDashboardCache } from '../../common/Collections';
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

  it('omits all seven retired lesson publications', function() {
    const handlers = (Meteor as any).server.publish_handlers;
    const retired = ['ownedTdfs', 'pagedTdfsListing', 'tdfByIds', 'tdfForEditMetadata', 'dashboardTdfsListing', 'contentUploadOwners', 'allTdfsListing'];
    for (const name of retired) expect(handlers).not.to.have.own.property(name);
  });

  it('publishes only a single accessible runtime lesson', async function() {
    const id = Random.id();
    try {
      await Tdfs.insertAsync({ _id: id, ownerId: owner });
      const docs = await (await invoke('currentTdf', owner, id).result).fetchAsync();
      expect(docs.map((doc: { _id: string }) => doc._id)).to.deep.equal([id]);
      for (const [actor, argument] of [[owner, [id]], [owner, { id }], [null, id], [admin, id]] as const) {
        const observation = invoke('currentTdf', actor, argument);
        expect(await observation.result).to.equal(undefined);
        expect(observation.readyCalls).to.equal(1);
        expect(observation.emitted).to.deep.equal([]);
      }
    } finally {
      await Tdfs.removeAsync(id);
    }
  });

  it('reports effective due dates only for the requested instructor courses', async function() {
    const course = Random.id(), otherCourse = Random.id();
    const lessons = [Random.id(), Random.id(), Random.id()];
    try {
      await Courses.insertAsync({ _id: course, teacherUserId: admin, semester: curSemester });
      await Courses.insertAsync({ _id: otherCourse, teacherUserId: owner, semester: curSemester });
      for (const [i, id] of lessons.entries()) {
        const setspec = { lessonname: id, ...(i < 2 ? { duedate: '2026-03-04' } : {}) };
        await Tdfs.insertAsync({ _id: id, ownerId: admin, content: { tdfs: { tutor: { setspec } } } });
      }
      const [first, second, third] = lessons;
      await Assignments.insertAsync({ courseId: course, TDFId: first, dueAt: '2026-02-03' });
      await Assignments.insertAsync({ courseId: course, assignmentType: 'progressive', memberTdfIds: [second, third] });
      await Assignments.insertAsync({ courseId: otherCourse, TDFId: first });
      const report = (Meteor as any).server.method_handlers.getTdfAssignmentsByCourseIdMap;
      const result = await report.call({ userId: admin }, admin);
      expect(result).to.have.keys(course);
      const rows = result[course];
      expect(rows).to.have.length(3);
      for (const [i, id] of lessons.entries()) {
        const row = rows.find((item: { TDFId: string }) => item.TDFId === id);
        expect(row).to.have.keys('assignmentId', 'TDFId', 'displayName', 'dueAt');
        expect(row.displayName).to.equal(id);
        expect(row.dueAt).to.equal(['2026-02-03', '2026-03-04', null][i]);
      }
    } finally {
      await Assignments.removeAsync({ courseId: { $in: [course, otherCourse] } });
      await Courses.removeAsync({ _id: { $in: [course, otherCourse] } });
      await Tdfs.removeAsync({ _id: { $in: lessons } });
    }
  });

  it('retires the course assignment subscription and finishes all six active subscriptions when signed out', async function() {
    expect((Meteor as any).server.publish_handlers).not.to.have.own.property('Assignments');
    for (const name of ['files.assets.all', 'assets', 'currentTdf', 'tdfForEdit', 'tdfForContentUploadDetails', 'tdfByExperimentTarget']) {
      const observation = invoke(name, null);
      expect(observation.result).to.be.instanceOf(Promise);
      expect(await observation.result).to.equal(undefined);
      expect(observation.readyCalls).to.equal(1);
      expect(observation.emitted).to.deep.equal([]);
    }
  });

  async function expectPublicationError(result: Promise<unknown>, code: string) {
    let caught: unknown;
    try { await result; } catch (error) { caught = error; }
    expect(caught).to.have.property('error', code);
  }

  it('distinguishes owner editing from shared upload details', async function() {
    const id = Random.id(), stranger = Random.id();
    try {
      await Tdfs.insertAsync({ _id: id, ownerId: owner, accessors: [{ userId: admin }],
        content: { fileName: 'fixture.json', tdfs: { tutor: { setspec: {}, unit: [{}] } } }, syntheticPrivate: true });
      const edited = await (await invoke('tdfForEdit', owner, id).result).fetchAsync();
      expect(edited[0]).to.have.keys('_id', 'ownerId', 'accessors', 'content');
      await expectPublicationError(invoke('tdfForEdit', admin, id).result, 'not-authorized');
      await expectPublicationError(invoke('tdfForEdit', owner, Random.id()).result, 'not-found');
      for (const actor of [owner, admin]) {
        const details = await (await invoke('tdfForContentUploadDetails', actor, id).result).fetchAsync();
        expect(details[0]._id).to.equal(id);
        expect(details[0]).not.to.have.property('syntheticPrivate');
        expect(details[0].content.tdfs.tutor).not.to.have.property('unit');
      }
      const denied = invoke('tdfForContentUploadDetails', stranger, id);
      await denied.result;
      expect(denied.readyCalls).to.equal(1);
    } finally { await Tdfs.removeAsync(id); }
  });

  it('limits asset metadata to the eligible files and stimulus sets', async function() {
    const lesson = Random.id(), set = Random.id(), otherSet = Random.id();
    const own = Random.id(), shared = Random.id(), foreign = Random.id();
    const files = DynamicAssets.collection.rawCollection();
    try {
      await Tdfs.insertAsync({ _id: lesson, stimuliSetId: set, ownerId: admin, accessors: [{ userId: owner }] });
      await files.insertMany([
        { _id: own, userId: owner, meta: { stimuliSetId: otherSet }, syntheticPrivate: true },
        { _id: shared, userId: admin, meta: { stimuliSetId: set }, syntheticPrivate: true },
        { _id: foreign, userId: admin, meta: { stimuliSetId: otherSet } },
      ]);
      const visible = await (await invoke('files.assets.all', owner).result).fetchAsync();
      expect(visible.map((row: { _id: string }) => row._id)).to.have.members([own, shared]);
      for (const row of visible) expect(row).not.to.have.property('syntheticPrivate');
      for (const actor of [owner, admin]) {
        const selected = await (await invoke('assets', actor, actor, set).result).fetchAsync();
        expect(selected.map((row: { _id: string }) => row._id)).to.deep.equal([shared]);
        expect(selected[0]).not.to.have.property('syntheticPrivate');
      }
      await expectPublicationError(invoke('assets', Random.id(), owner, set).result, 'not-authorized');
      await expectPublicationError(invoke('assets', owner, owner, otherSet).result, 'not-found');
    } finally {
      await files.deleteMany({ _id: { $in: [own, shared, foreign] } });
      await Tdfs.removeAsync(lesson);
    }
  });

  it('limits experiment lessons to a permitted target and omits runtime secrets', async function() {
    const id = Random.id(), target = Random.id().toLowerCase();
    try {
      await Tdfs.insertAsync({ _id: id, ownerId: admin, tdfAvailability: 'available', conditionAllocation: {},
        content: { tdfs: { tutor: { unit: [{}], setspec: { experimentTarget: target, speechAPIKey: 'synthetic' } } } } });
      const denied = invoke('tdfByExperimentTarget', owner, target);
      await denied.result;
      expect(denied.readyCalls).to.equal(1);
      await users.updateAsync(owner, { $set: { 'profile.experimentTarget': target } });
      for (const actor of [admin, owner]) {
        const rows = await (await invoke('tdfByExperimentTarget', actor, target).result).fetchAsync();
        expect(rows.map((row: { _id: string }) => row._id)).to.deep.equal([id]);
        expect(rows[0]).not.to.have.property('conditionAllocation');
        expect(rows[0].content.tdfs.tutor.setspec).not.to.have.property('speechAPIKey');
      }
    } finally {
      await users.updateAsync(owner, { $unset: { 'profile.experimentTarget': 1 } });
      await Tdfs.removeAsync(id);
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
