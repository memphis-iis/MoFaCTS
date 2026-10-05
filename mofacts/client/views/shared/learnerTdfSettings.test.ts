import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import {
  destroyLearnerSettingsHost,
  flushLearnerSettings,
  initializeLearnerSettingsHost,
  learnerSettingsEvents,
} from './learnerTdfSettings';

if (Meteor.isClient) describe('standalone lesson settings and progress reset', function() {
  let host: any;
  let call: sinon.SinonStub;
  let refresh: sinon.SinonSpy;
  let content: any;
  let event: any;

  beforeEach(function() {
    content = { tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson' }, unit: [] } } };
    call = sinon.stub(Meteor as any, 'callAsync');
    call.withArgs('getTdfById').callsFake(async () => ({ content }));
    call.withArgs('getLearnerTdfConfig').resolves(null);
    call.withArgs('resetOwnLessonProgress').resolves({ cacheTdfIds: ['synthetic'] });
    sinon.stub(Meteor, 'userId').returns('synthetic-learner');
    refresh = sinon.spy();
    host = {};
    initializeLearnerSettingsHost(host, { onProgressReset: refresh });
    const button = document.createElement('button');
    button.dataset.tdfid = 'synthetic';
    event = { preventDefault: sinon.spy(), currentTarget: button };
  });

  afterEach(function() {
    destroyLearnerSettingsHost(host);
    sinon.restore();
    Session.set('learnerTdfConfigOverrides', {});
  });

  for (const unit of [
    { unitname: 'Video', videosession: { videosource: 'https://www.youtube.com/watch?v=test' } },
    { unitname: 'Assessment', assessment: { clusterlist: '0' } },
    { unitname: 'Instructions', unitinstructions: 'Read these instructions' },
    { unitname: 'Practice', learningsession: { clusterlist: '0' } },
  ]) {
    it(`opens settings and allows confirmed reset for ${unit.unitname}`, async function() {
      content.tdfs.tutor.unit = [unit];
      await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
      expect(host.learnerConfigState.get()).to.include({ step: 'settings', canResetProgress: true, error: null });
      await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
      expect(call.calledWith('resetOwnLessonProgress')).to.equal(false);
      expect(host.learnerConfigState.get().resetConfirming).to.equal(true);
      await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
      expect(call.calledWithExactly('resetOwnLessonProgress', 'synthetic')).to.equal(true);
      expect(refresh.calledOnceWithExactly(['synthetic'])).to.equal(true);
    });
  }

  it('opens a condition-family reset panel without requiring an authored unit array', async function() {
    delete content.tdfs.tutor.unit;
    content.tdfs.tutor.setspec.condition = ['adaptive.json', 'control.json'];
    await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
    expect(host.learnerConfigState.get()).to.include({ step: 'settings', canResetProgress: true, error: null });
  });

  it('does not treat missing lesson units as a valid condition family', async function() {
    delete content.tdfs.tutor.unit;
    await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
    expect(host.learnerConfigState.get().step).to.equal('scope');
    expect(host.learnerConfigState.get().error).to.be.a('string');
  });

  it('cancels confirmation without resetting or refreshing progress', async function() {
    await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
    await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
    learnerSettingsEvents['click .learner-config-reset-progress-cancel'](event, host);
    expect(host.learnerConfigState.get().resetConfirming).to.equal(false);
    expect(call.calledWith('resetOwnLessonProgress')).to.equal(false);
    expect(refresh.called).to.equal(false);
  });

  it('does not expose or invoke reset in course context', async function() {
    host.settingsCourseContext = () => ({ assignmentId: 'assignment', courseId: 'course', TDFId: 'synthetic' });
    await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
    expect(host.learnerConfigState.get().canResetProgress).to.equal(false);
    await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
    expect(call.calledWith('resetOwnLessonProgress')).to.equal(false);
  });

  it('shows the server class restriction without clearing displayed progress', async function() {
    await learnerSettingsEvents['click .configure-lesson'].call({}, event, host);
    call.withArgs('resetOwnLessonProgress').rejects(new Meteor.Error('course-reset-blocked', 'Assigned class lesson'));
    await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
    await learnerSettingsEvents['click .learner-config-reset-progress'](event, host);
    expect(host.learnerConfigState.get()).to.include({ error: 'Assigned class lesson', resettingProgress: false });
    expect(refresh.called).to.equal(false);
  });
});

describe('shared learner settings save-before-launch', function() {
  afterEach(function() { sinon.restore(); Session.set('learnerTdfConfigOverrides', {}); });

  function host() {
    const instance: any = {};
    initializeLearnerSettingsHost(instance);
    const courseAssignment = { assignmentId: 'p', courseId: 'c', TDFId: 'a', launchSource: 'courses', launchMode: 'individual' };
    instance.learnerConfigState.set({ ...instance.learnerConfigState.get(), tdfId: 'a', courseAssignment, dirty: true });
    instance.learnerConfigSaveRevision = 1;
    instance.learnerConfigPendingSave = { tdfId: 'a', patch: { unit: { '1': { deliverySettings: { drill: 2000 } } } }, saveRevision: 1 };
    return { instance, courseAssignment };
  }

  it('flushes an unsent edit with its original course context before allowing launch', async function() {
    const { instance, courseAssignment } = host();
    const patch = instance.learnerConfigPendingSave.patch;
    const call = sinon.stub(Meteor as any, 'callAsync').resolves({ config: { overrides: patch } });
    await flushLearnerSettings(instance);
    expect(call.calledOnceWithExactly('saveLearnerTdfConfig', 'a', patch, { courseAssignment })).to.equal(true);
    expect(instance.learnerConfigState.get()).to.include({ dirty: false, saving: false });
    expect(instance.learnerConfigPendingSave).to.equal(null);
    destroyLearnerSettingsHost(instance);
  });

  it('rejects launch and retains an inline error when saving fails', async function() {
    const { instance } = host();
    sinon.stub(Meteor as any, 'callAsync').rejects(new Error('Settings access denied'));
    try { await flushLearnerSettings(instance); expect.fail('Expected save rejection'); }
    catch (error: any) { expect(error.message).to.equal('Settings access denied'); }
    expect(instance.learnerConfigState.get()).to.include({ dirty: true, error: 'Settings access denied' });
    destroyLearnerSettingsHost(instance);
  });
});
