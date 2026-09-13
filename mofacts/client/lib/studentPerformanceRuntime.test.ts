import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { setStudentPerformance } from './studentPerformanceRuntime';

declare const Tdfs: any;

describe('student performance initialization for course launches', function() {
  const sessionKeys = [
    'currentTdfDoc', 'currentTdfFile', 'currentTdfId', 'currentTdfUnit',
    'currentUnitNumber', 'currentStimuliSet', 'currentStimuliSetId', 'curStudentPerformance',
  ];
  let previousSession: Record<string, any>;
  let publishedTdfLookup: sinon.SinonStub;
  let historyRead: sinon.SinonStub;

  beforeEach(function() {
    previousSession = Object.fromEntries(sessionKeys.map((key) => [key, Session.get(key)]));
    sinon.stub(Meteor, 'userId').returns('performance-regression-user');
    // Course-authorized method results are not inserted into Minimongo.
    publishedTdfLookup = sinon.stub(Tdfs, 'findOne').returns(undefined);
    historyRead = sinon.stub(Meteor as any, 'callAsync').callsFake(async (name: unknown) => {
      if (name !== 'getStudentPerformanceForUnitFromHistory') throw new Error(`Unexpected method: ${name}`);
      return null;
    });
    const unit = { unitname: 'Practice', learningsession: { clusterlist: '1' } };
    const content = { tdfs: { tutor: { unit: [{ unitinstructions: 'Read' }, unit] } } };
    const rawStimuliFile = { setspec: { clusters: [
      { clusterKC: 'excluded', stims: [{ stimulusKC: 'a' }] },
      { clusterKC: 'included', stims: [{ stimulusKC: 'b' }, { stimulusKC: 'c' }] },
    ] } };
    Session.set('currentTdfDoc', { content, rawStimuliFile, stimuliSetId: 'performance-set' });
    Session.set('currentTdfFile', content);
    Session.set('currentTdfId', 'performance-lesson');
    Session.set('currentTdfUnit', unit);
    Session.set('currentUnitNumber', 1);
    Session.set('currentStimuliSetId', 'performance-set');
    Session.set('currentStimuliSet', [
      { stimulusKC: 'a', clusterKC: 'excluded' },
      { stimulusKC: 'b', clusterKC: 'included' },
      { stimulusKC: 'c', clusterKC: 'included' },
    ]);
  });

  afterEach(function() {
    sinon.restore();
    for (const key of sessionKeys) Session.set(key, previousSession[key]);
  });

  for (const hasHistory of [false, true]) {
    it(`initializes ${hasHistory ? 'resumed' : 'new'} lesson performance without a published TDF`, async function() {
      if (hasHistory) historyRead.resolves({ numCorrect: 3, numIncorrect: 1, count: 4, totalPracticeDuration: 60000 });

      await setStudentPerformance('performance-regression-user', 'Learner', 'performance-lesson', 1, false);

      expect(Session.get('curStudentPerformance')).to.include({
        totalStimCount: 2,
        count: hasHistory ? 4 : 0,
        percentCorrect: hasHistory ? '75.00%' : 'N/A',
        totalTimeDisplay: hasHistory ? '1.0' : '0.0',
      });
      expect(historyRead.calledOnceWithExactly(
        'getStudentPerformanceForUnitFromHistory', 'performance-regression-user', 'performance-lesson', 1, false,
      )).to.equal(true);
      expect(publishedTdfLookup.called).to.equal(false);
    });
  }

  it('preserves inline progressive stimulus counting', async function() {
    const doc = Session.get('currentTdfDoc');
    Session.set('currentTdfFile', { ...doc.content, rawStimuliFile: doc.rawStimuliFile });

    await setStudentPerformance('performance-regression-user', 'Learner', 'performance-lesson', 1, false);

    expect(Session.get('curStudentPerformance').totalStimCount).to.equal(2);
    expect(publishedTdfLookup.called).to.equal(false);
  });

  it('still rejects missing canonical stimulus data instead of inventing a count', async function() {
    Session.set('currentTdfDoc', { content: Session.get('currentTdfFile') });
    try {
      await setStudentPerformance('performance-regression-user', 'Learner', 'performance-lesson', 1, false);
      expect.fail('Expected missing canonical stimuli to reject initialization');
    } catch (error: any) {
      expect(error.message).to.include('missing rawStimuliFile.setspec.clusters');
    }
    expect(publishedTdfLookup.called).to.equal(false);
  });
});
