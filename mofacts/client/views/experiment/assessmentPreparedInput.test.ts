import { expect } from 'chai';
import { createAssessmentUnitEngine } from '../../../../learning-components/units/assessment-session/AssessmentUnitEngine';

describe('assessment prepared input mode', function() {
  it('preserves scheduled buttons through preparation, commit and resume, including single-answer intro cards', async function() {
    const schedule = { q: Array.from({ length: 25 }, (_, index) => ({
      clusterIndex: index, whichStim: 0, testType: 't', forceButtonTrial: index < 24,
    })) };
    const session: Record<string, unknown> = {
      currentUnitNumber: 0,
      currentTdfFile: { tdfs: { tutor: {
        setspec: {}, unit: [{ unitname: 'pretest', buttontrial: false }],
      } } },
    };
    const engine = {
      ...createAssessmentUnitEngine({
        getSessionValue: (key) => session[key],
        setSessionValue: (key, value) => { session[key] = value; },
        getExperimentState: () => ({ schedule }),
        hasScheduleArtifactForUnit: () => true,
        createExperimentState: async () => { throw new Error('Resume must reuse the saved schedule'); },
        getStimCount: () => 25,
        setQuestionIndex: () => undefined,
        alertUser: () => undefined,
        log: () => undefined,
      }),
      buildPreparedCardQuestionAndAnswerGlobals: async () => ({ currentAnswer: 'Weiter' }),
      applyPreparedCardQuestionAndAnswerGlobals: () => undefined,
    } as unknown as {
      initImpl: () => Promise<void>;
      setScheduleCursor: (index: number) => void;
      getScheduleCursor: () => number;
      prepareNextScheduledCard: () => Promise<{ forceButtonTrial: boolean; testType: string } | null>;
      commitPreparedScheduledCard: (selection: unknown) => boolean;
    };
    await engine.initImpl!();
    for (let index = 0; index < 25; index++) {
      engine.setScheduleCursor!(index);
      const selection = await engine.prepareNextScheduledCard!();
      expect(selection!.forceButtonTrial).to.equal(index < 24);
      expect(selection!.testType).to.equal('t');
      expect(engine.getScheduleCursor!()).to.equal(index);
      engine.commitPreparedScheduledCard!(selection);
      expect(engine.getScheduleCursor!()).to.equal(index + 1);
    }
    engine.setScheduleCursor!(8);
    expect((await engine.prepareNextScheduledCard!())!.forceButtonTrial).to.equal(true);
    engine.setScheduleCursor!(25);
    expect(await engine.prepareNextScheduledCard!()).to.equal(null);
  });
});
