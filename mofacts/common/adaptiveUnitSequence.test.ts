import { expect } from 'chai';
import { captureAdaptiveUnitSequence, restoreAdaptiveUnitSequence } from './adaptiveUnitSequence';
import { AdaptiveUnitCoordinator } from '../../learning-components/units/shared/AdaptiveUnitCoordinator';

describe('adaptive unit sequence continuity', function() {
  const makeContent = () => ({ tdfs: { tutor: {
    setspec: { unitTemplate: [
      { unitname: 'first video', videosession: { questions: [], questiontimes: [] } },
      { unitname: 'second video', videosession: { questions: [], questiontimes: [] } },
    ] },
    unit: [
      { unitname: 'pretest', adaptive: ['2,t', '3,t'], adaptiveUnitTemplate: [0, 1],
        adaptiveLogic: { '2': ['IF NOT C0S0 THEN C8S0 AT 10'], '3': ['IF NOT C0S0 THEN C14S0 AT 20'] } },
      { unitname: 'Final' },
    ] as any[],
  } } });

  for (const outcome of ['correct', 'incorrect']) {
    it(`keeps both videos and restores their exact questions after a ${outcome} pretest`, async function() {
      const content = makeContent();
      const templates = structuredClone(content.tdfs.tutor.setspec.unitTemplate);
      const coordinator = new AdaptiveUnitCoordinator(content.tdfs.tutor.unit[0], {
        loadOutcomeRows: async () => [{ stimulusKC: 10000, outcome }],
        getCurrentStimuliSet: () => [{ clusterKC: 10000, stimulusKC: 10000 }],
        kcMultiple: 10000,
        reportUnitBuildFailure: message => { throw new Error(message); },
        log: () => {},
      });
      await coordinator.applyUnitTransitions(content, 0);
      expect(content.tdfs.tutor.unit.map(unit => unit.unitname)).to.deep.equal(['pretest', 'first video', 'second video', 'Final']);
      expect(content.tdfs.tutor.setspec.unitTemplate).to.deep.equal(templates);
      // This stimulus maps to C0S0 (clusterKC modulo KC_MULTIPLE).
      expect(content.tdfs.tutor.unit[1].videosession.questions).to.deep.equal(outcome === 'correct' ? [] : [8]);
      expect(content.tdfs.tutor.unit[2].videosession.questions).to.deep.equal(outcome === 'correct' ? [] : [14]);
      const state = { currentUnitNumber: 2, adaptiveUnitSequence: captureAdaptiveUnitSequence('lesson', content.tdfs.tutor.unit) };
      const resumed = makeContent();
      restoreAdaptiveUnitSequence(resumed, state, 'lesson');
      expect(resumed.tdfs.tutor.unit).to.deep.equal(content.tdfs.tutor.unit);
      expect(resumed.tdfs.tutor.unit).not.to.equal(state.adaptiveUnitSequence.units);
      expect(() => restoreAdaptiveUnitSequence(makeContent(), state, 'another-lesson')).to.throw('another lesson');
    });
  }

  it('rejects missing generated state after an adaptive unit instead of resuming at Final', function() {
    expect(() => restoreAdaptiveUnitSequence(makeContent(), { currentUnitNumber: 1 }, 'lesson')).to.throw('no saved adaptive unit sequence');
    expect(() => restoreAdaptiveUnitSequence(makeContent(), { currentUnitNumber: 0 }, 'lesson')).not.to.throw();
  });
});
