import { expect } from 'chai';

import {
  createInitialAutoTutorPlannerState,
  planAutoTutorTurn,
  preserveDurableExpectationCoverage,
  recomputeExpectationPriorities,
  selectAutoTutorTarget,
  type AutoTutorPlannerScript,
} from './autoTutorPlanner.ts';

function buildScript(): AutoTutorPlannerScript {
  return {
    expectations: [
      { id: 'E1', proposition: 'Repeated sampling matters.', assertion: 'The 95% is about repeated samples.' },
      { id: 'E2', proposition: 'The parameter is fixed.', assertion: 'The population parameter is fixed.' },
    ],
    misconceptions: [
      { id: 'M1', correction: 'The parameter is fixed.', repairQuestion: 'What varies across repeated samples?' },
    ],
    dialogPolicy: {
      requiredExpectations: ['E1', 'E2'],
    },
    summary: 'A confidence interval method captures the true parameter in a long-run share of repeated samples.',
  };
}

describe('AutoTutor planner', function() {
  it('lets active misconceptions override expectation tutoring', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.2, coherence: 0.2, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.7, coherence: 0.6, centrality: 0.5 },
    });
    plannerState.misconceptionScores.M1 = { current: true, confidence: 0.9, evidence: '95% chance language' };

    const plan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'partial',
    });

    expect(plan.target).to.deep.equal({ type: 'misconception', id: 'M1' });
    expect(plan.selectedMove).to.equal('correction');
    expect(plan.correctionStage).to.equal('hint');
  });

  it('cycles misconception repair through hint, prompt, and assertion stages', function() {
    const script = buildScript();
    let plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.misconceptionScores.M1 = { current: true, confidence: 0.9, evidence: '95% chance language' };

    const stages = [];
    for (let turn = 0; turn < 4; turn += 1) {
      const plan = planAutoTutorTurn({
        script,
        plannerState,
        learnerQuestion: { current: false, answerableFromAuthoredContent: false },
        answerQuality: 'partial',
      });
      expect(plan.target).to.deep.equal({ type: 'misconception', id: 'M1' });
      expect(plan.selectedMove).to.equal('correction');
      stages.push(plan.correctionStage);
      plannerState = plan.nextPlannerState;
    }

    expect(stages).to.deep.equal(['hint', 'prompt', 'assertion', 'hint']);
    expect(plannerState.focusedMisconceptionId).to.equal('M1');
    expect(plannerState.misconceptionCycleIndex).to.equal(4);
  });

  it('selects the highest-priority uncovered required expectation', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.25, coherence: 0.2, centrality: 0.2 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.65, coherence: 0.8, centrality: 0.5 },
    });

    const target = selectAutoTutorTarget({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'partial',
    });

    expect(target).to.deep.equal({ type: 'expectation', id: 'E2' });
  });

  it('answers learner questions before correcting active misconceptions', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.misconceptionScores.M1 = { current: true, confidence: 0.95, evidence: '95% chance language' };

    const plan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: true, answerableFromAuthoredContent: true, evidence: 'asked what repeated sampling means' },
      answerQuality: 'partial',
    });

    expect(plan.target).to.deep.equal({ type: 'learner_question' });
    expect(plan.selectedMove).to.equal('answer_question');
    expect(plan.nextPlannerState.focusedExpectationId).to.equal(undefined);
  });

  it('prompts for a final integrated answer before summary completion', function() {
    const script = buildScript();
    let plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, current: true, coverage: 0.9, coherence: 0.5, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, current: true, coverage: 0.95, coherence: 0.5, centrality: 0.5 },
    });

    const finalPromptPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'high',
    });

    expect(finalPromptPlan.target).to.deep.equal({ type: 'completion' });
    expect(finalPromptPlan.selectedMove).to.equal('final_answer_prompt');

    plannerState = finalPromptPlan.nextPlannerState;
    const summaryPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'high',
    });

    expect(summaryPlan.target).to.deep.equal({ type: 'completion' });
    expect(summaryPlan.selectedMove).to.equal('summary');
  });

  it('uses a bounded hint-prompt-assertion cycle without counting assertion as learner coverage', function() {
    const script = buildScript();
    let plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.1, coherence: 0.5, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.0, coherence: 0.2, centrality: 0.5 },
    });

    const moves = [];
    for (let turn = 0; turn < 3; turn += 1) {
      const plan = planAutoTutorTurn({
        script,
        plannerState,
        learnerQuestion: { current: false, answerableFromAuthoredContent: false },
        answerQuality: 'partial',
      });
      moves.push(plan.selectedMove);
      plannerState = plan.nextPlannerState;
    }

    expect(moves).to.deep.equal(['hint', 'prompt', 'assertion']);
    expect(plannerState.expectationScores.E1?.tutoredByAssertion).to.equal(true);
    expect(plannerState.expectationScores.E1?.coverage).to.equal(0.1);
  });

  it('starts a newly focused expectation at the beginning of the move cycle', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.focusedExpectationId = 'E1';
    plannerState.focusTurnCount = 3;
    plannerState.moveCycleIndex = 2;
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, current: true, coverage: 0.9, coherence: 0.5, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.1, coherence: 0.5, centrality: 0.5 },
    });

    const plan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'partial',
    });

    expect(plan.target).to.deep.equal({ type: 'expectation', id: 'E2' });
    expect(plan.selectedMove).to.equal('hint');
    expect(plan.nextPlannerState.focusedExpectationId).to.equal('E2');
    expect(plan.nextPlannerState.moveCycleIndex).to.equal(1);
  });

  it('preserves previously demonstrated expectation coverage across weak later answers', function() {
    const script = buildScript();
    const previousScores = recomputeExpectationPriorities(script, {
      E1: {
        current: true,
        coverage: 0.75,
        evidence: 'Learner connected repeated sampling to long-run coverage.',
        missing: ['fixed parameter distinction'],
        frontier: 0.75,
        coherence: 0.8,
        centrality: 0.7,
        priority: 0,
      },
      E2: {
        current: false,
        coverage: 0,
        frontier: 0,
        coherence: 0.2,
        centrality: 0.5,
        priority: 0,
      },
    });
    const latestScores = recomputeExpectationPriorities(script, {
      E1: {
        current: false,
        coverage: 0,
        evidence: 'The latest short answer did not restate the idea.',
        missing: ['repeated sampling'],
        frontier: 0,
        coherence: 0,
        centrality: 0.1,
        priority: 0,
      },
      E2: {
        current: false,
        coverage: 0,
        frontier: 0,
        coherence: 0.2,
        centrality: 0.5,
        priority: 0,
      },
    });

    const mergedScores = preserveDurableExpectationCoverage(script, previousScores, latestScores);

    expect(mergedScores.E1?.coverage).to.equal(0.75);
    expect(mergedScores.E1?.current).to.equal(true);
    expect(mergedScores.E1?.evidence).to.equal('Learner connected repeated sampling to long-run coverage.');
  });
});
