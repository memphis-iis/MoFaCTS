import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import './learningDashboard';

declare const Blaze: any;
declare const $: JQueryStatic;

if (Meteor.isClient) describe('practice dashboard lesson identity', function() {
  let container: HTMLDivElement;
  let view: any;
  let host: any;
  let call: sinon.SinonStub;
  let lessons: any[];
  const userId = 'practice-identity-test';
  const snapshotKey = `mofacts.practiceDashboardSnapshot.v4.${userId}`;
  const searchKey = `mofacts.practiceDashboardSearch.v1.${userId}`;
  const sessionKeys = ['learnerTdfConfigOverrides', 'homeHasPracticeRecords', 'showSpeechAPISetup',
    'learningDashboardLessonCommandFeedback', 'curStudentID'];
  let savedSession: unknown[];

  async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    Tracker.flush();
  }

  beforeEach(async function() {
    savedSession = sessionKeys.map(key => Session.get(key));
    Session.set('curStudentID', null);
    sinon.stub(Meteor, 'userId').returns(userId);
    sinon.stub(Meteor, 'user').returns(null);
    call = sinon.stub(Meteor as any, 'callAsync').resolves(null);
    lessons = [
        { TDFId: 'control', displayName: 'Control', isUsed: true, lastPracticeTimestamp: 2 },
        { TDFId: 'adaptive', displayName: 'Adaptive', isUsed: true, lastPracticeTimestamp: 1 },
    ];
    call.withArgs('getPracticeDashboardSnapshot').resolves({
      version: 4, userId, creators: [], lessons,
    });
    call.withArgs('getTdfById').callsFake(async (_method, id) => ({
      content: { tdfs: { tutor: { setspec: { lessonname: id }, unit: [] } } },
    }));
    call.withArgs('resetOwnLessonProgress').callsFake(async (_method, id) => ({ cacheTdfIds: [id] }));
    container = document.createElement('div');
    document.body.append(container);
    view = Blaze.render((Template as any).learningDashboard, container);
    host = view.templateInstance();
    await settle();
    await settle();
  });

  afterEach(function() {
    Blaze.remove(view);
    container.remove();
    localStorage.removeItem(snapshotKey);
    localStorage.removeItem(searchKey);
    sessionKeys.forEach((key, index) => Session.set(key, savedSession[index]));
    sinon.restore();
  });

  function settings(id: string, layout: 'cards' | 'table'): HTMLButtonElement {
    const parent = layout === 'cards' ? '.learning-dashboard-card' : '.learning-dashboard-row';
    const button = container.querySelector(`${parent} .configure-lesson[data-tdfid="${id}"]`);
    expect(button).to.not.equal(null);
    return button as HTMLButtonElement;
  }

  async function click(button: HTMLElement) {
    button.click();
    await settle();
  }

  function panel(id: string, layout: 'cards' | 'table'): HTMLElement {
    const button = settings(id, layout);
    const row = button.closest(layout === 'cards' ? '.learning-dashboard-card' : '.learning-dashboard-row')!;
    const element = layout === 'cards' ? row.querySelector('.learner-config-panel')
      : row.nextElementSibling?.querySelector('.learner-config-panel');
    expect(element).to.not.equal(null);
    expect(element).to.not.equal(undefined);
    return element as HTMLElement;
  }

  for (const layout of ['cards', 'table'] as const) {
    it(`keeps settings and reset on adaptive after control moves sections (${layout})`, async function() {
      const controlButton = settings('control', layout);
      $(controlButton).data('tdfid');
      await click(controlButton);
      await click(panel('control', layout).querySelector('.learner-config-reset-progress') as HTMLElement);
      await click(panel('control', layout).querySelector('.learner-config-reset-progress') as HTMLElement);
      expect(call.calledWithExactly('resetOwnLessonProgress', 'control')).to.equal(true);
      expect(host.allTdfsList.get().find((lesson: any) => lesson.TDFId === 'control').isUsed).to.equal(false);
      await click(settings('adaptive', layout));
      expect(host.learnerConfigState.get().tdfId).to.equal('adaptive');
      await click(panel('adaptive', layout).querySelector('.learner-config-reset-progress') as HTMLElement);
      expect(host.learnerConfigState.get().resetConfirming).to.equal(true);
      await click(panel('adaptive', layout).querySelector('.learner-config-reset-progress') as HTMLElement);
      expect(call.calledWithExactly('resetOwnLessonProgress', 'adaptive')).to.equal(true);
    });

    it(`retains button identity through reordering and filtering (${layout})`, async function() {
      const button = settings('adaptive', layout);
      $(button).data('tdfid');
      host.allTdfsList.set(host.allTdfsList.get().map((lesson: any) => ({
        ...lesson, lastPracticeTimestamp: lesson.TDFId === 'adaptive' ? 3 : 1,
      })));
      Tracker.flush();
      expect(settings('adaptive', layout)).to.equal(button);
      await click(button);
      const input = container.querySelector('#learningDashboardSearch') as HTMLInputElement;
      input.value = 'Adaptive';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 220));
      Tracker.flush();
      expect(host.learnerConfigState.get().tdfId).to.equal('adaptive');
      expect(panel('adaptive', layout)).to.not.equal(null);
      await click(panel('adaptive', layout).querySelector('.learner-config-reset-progress') as HTMLElement);
      await click(panel('adaptive', layout).querySelector('.learner-config-reset-progress-cancel') as HTMLElement);
      expect(call.calledWith('resetOwnLessonProgress')).to.equal(false);
    });
  }

  it('derives the view identity without changing the snapshot lesson', function() {
    expect(host.allTdfsList.get().find((lesson: any) => lesson.TDFId === 'adaptive')._id).to.equal('adaptive');
    for (const lesson of lessons) expect(lesson).not.to.have.property('_id');
  });
});
