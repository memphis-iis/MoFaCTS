import { expect } from 'chai';

import {
  createInitialAutoTutorPlannerState,
  getScoreableExpectationIds,
  mergeScoreableExpectationScores,
  planAutoTutorTurn,
  preserveDurableExpectationCoverage,
  preserveRepairedMisconceptionState,
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

  it('does not target a repaired misconception', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.2, coherence: 0.2, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.4, coherence: 0.3, centrality: 0.5 },
    });
    plannerState.misconceptionScores.M1 = {
      current: false,
      confidence: 0,
      repaired: true,
      repairEvidence: 'Learner answered the repair question.',
    };

    const target = selectAutoTutorTarget({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'partial',
    });

    expect(target.type).to.equal('expectation');
  });

  it('selects the highest-priority uncovered required expectation', function() {
    const script = {
      ...buildScript(),
      expectationRelationships: {
        E1: { E2: 0.2 },
        E2: { E1: 0.9 },
      },
    };
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

  it('derives frontier, coherence, and centrality from the authored expectation graph', function() {
    const script = {
      ...buildScript(),
      expectationRelationships: {
        E1: { E2: 0.75 },
        E2: { E1: 0.25 },
      },
    };
    const plannerState = createInitialAutoTutorPlannerState(script);

    const scores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.4 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.2 },
    }, undefined, 'E1');

    expect(scores.E1?.coherence).to.equal(1);
    expect(scores.E1?.frontier).to.equal(0.6);
    expect(scores.E1?.centrality).to.equal(0.75);
    expect(scores.E2?.coherence).to.equal(0.75);
    expect(scores.E2?.frontier).to.be.closeTo(0.6, 0.000001);
    expect(scores.E2?.centrality).to.equal(0.25);
  });

  it('keeps priority as an unclamped ordering score', function() {
    const script = {
      ...buildScript(),
      expectationRelationships: {
        E1: { E2: 0.75 },
        E2: { E1: 0.25 },
      },
    };
    const plannerState = createInitialAutoTutorPlannerState(script);

    const highScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0 },
    }, {
      frontierWeight: 2,
      coherenceWeight: 2,
      centralityWeight: 2,
    }, 'E1');

    expect(highScores.E1?.priority).to.equal(5.5);
    expect(highScores.E2?.priority).to.equal(3);

    const negativeScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0 },
    }, {
      frontierWeight: -2,
      coherenceWeight: -2,
      centralityWeight: -2,
    }, 'E1');

    expect(negativeScores.E1?.priority).to.equal(-5.5);
    expect(negativeScores.E2?.priority).to.equal(-3);
  });

  it('answers learner questions before correcting active misconceptions', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.misconceptionScores.M1 = { current: true, confidence: 0.95, evidence: '95% chance language' };

    const plan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: true, answerableFromAuthoredContent: true, evidence: 'asked what repeated sampling means' },
      learnerContribution: { type: 'question', confidence: 0.95 },
      answerQuality: 'partial',
    });

    expect(plan.target).to.deep.equal({ type: 'learner_question' });
    expect(plan.selectedMove).to.equal('answer_question');
    expect(plan.nextPlannerState.focusedExpectationId).to.equal(undefined);
  });

  it('uses current expectation hints for an initial idk instead of correcting misconceptions', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.focusedExpectationId = 'E1';
    plannerState.focusTurnCount = 2;
    plannerState.moveCycleIndex = 2;
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.2, coherence: 0.2, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.4, coherence: 0.3, centrality: 0.5 },
    });
    plannerState.misconceptionScores.M1 = { current: true, confidence: 0.95, evidence: 'Prior misconception' };

    const plan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      learnerContribution: { type: 'idk', confidence: 0.95 },
      answerQuality: 'low',
    });

    expect(plan.target).to.deep.equal({ type: 'expectation', id: 'E1' });
    expect(plan.selectedMove).to.equal('hint');
    expect(plan.nextPlannerState.contributionStreakType).to.equal('idk');
    expect(plan.nextPlannerState.contributionStreakCount).to.equal(1);
  });

  it('escalates repeated idk turns from hint to prompt to assertion', function() {
    const script = buildScript();
    let plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.2, coherence: 0.2, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.4, coherence: 0.3, centrality: 0.5 },
    });

    const moves = [];
    for (let turn = 0; turn < 3; turn += 1) {
      const plan = planAutoTutorTurn({
        script,
        plannerState,
        learnerQuestion: { current: false, answerableFromAuthoredContent: false },
        learnerContribution: { type: 'idk', confidence: 0.95 },
        answerQuality: 'low',
      });
      moves.push(plan.selectedMove);
      plannerState = plan.nextPlannerState;
    }

    expect(moves).to.deep.equal(['hint', 'prompt', 'assertion']);
  });

  it('answers only when the current turn has both question signals', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, coverage: 0.2, coherence: 0.2, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, coverage: 0.4, coherence: 0.3, centrality: 0.5 },
    });

    const questionPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: true, answerableFromAuthoredContent: true },
      learnerContribution: { type: 'question', confidence: 0.9 },
      answerQuality: 'partial',
    });
    expect(questionPlan.target).to.deep.equal({ type: 'learner_question' });
    expect(questionPlan.selectedMove).to.equal('answer_question');

    const rhetoricalPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      learnerContribution: { type: 'question', confidence: 0.9 },
      answerQuality: 'partial',
    });
    expect(rhetoricalPlan.target.type).to.equal('expectation');

    const staleQuestionPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: true, answerableFromAuthoredContent: true },
      learnerContribution: { type: 'meta', confidence: 0.9 },
      answerQuality: 'low',
    });
    expect(staleQuestionPlan.target.type).to.equal('expectation');

    const metaPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      learnerContribution: { type: 'meta', confidence: 0.9 },
      answerQuality: 'low',
    });
    expect(metaPlan.target.type).to.equal('expectation');
    expect(metaPlan.selectedMove).to.equal('hint');
  });

  it('summarizes immediately at completion by default', function() {
    const script = buildScript();
    const plannerState = createInitialAutoTutorPlannerState(script);
    plannerState.expectationScores = recomputeExpectationPriorities(script, {
      ...plannerState.expectationScores,
      E1: { ...plannerState.expectationScores.E1!, current: true, coverage: 0.9, coherence: 0.5, centrality: 0.5 },
      E2: { ...plannerState.expectationScores.E2!, current: true, coverage: 0.95, coherence: 0.5, centrality: 0.5 },
    });

    const summaryPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'high',
    });

    expect(summaryPlan.target).to.deep.equal({ type: 'completion' });
    expect(summaryPlan.selectedMove).to.equal('summary');
  });

  it('prompts for a final integrated answer before summary completion when enabled', function() {
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
      requireFinalAnswerPrompt: true,
    });

    expect(finalPromptPlan.target).to.deep.equal({ type: 'completion' });
    expect(finalPromptPlan.selectedMove).to.equal('final_answer_prompt');

    plannerState = finalPromptPlan.nextPlannerState;
    const summaryPlan = planAutoTutorTurn({
      script,
      plannerState,
      learnerQuestion: { current: false, answerableFromAuthoredContent: false },
      answerQuality: 'high',
      requireFinalAnswerPrompt: true,
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

  it('lets a post-assertion restatement replace prior low coverage', function() {
    const script = buildScript();
    const previousScores = recomputeExpectationPriorities(script, {
      E1: {
        current: false,
        coverage: 0.1,
        evidence: 'Prior attempts did not explain repeated sampling.',
        tutoredByAssertion: true,
        frontier: 0.1,
        coherence: 0.2,
        centrality: 0.5,
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
        current: true,
        coverage: 0.85,
        evidence: 'Learner restated that repeated samples produce repeated intervals.',
        tutoredByAssertion: true,
        learnerRestatedAfterAssertion: true,
        frontier: 0.85,
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

    const mergedScores = preserveDurableExpectationCoverage(script, previousScores, latestScores);

    expect(mergedScores.E1?.coverage).to.equal(0.85);
    expect(mergedScores.E1?.learnerRestatedAfterAssertion).to.equal(true);
  });

  it('excludes covered expectations from the scorer-owned expectation scope', function() {
    const script = buildScript();
    const previousScores = recomputeExpectationPriorities(script, {
      E1: {
        current: true,
        coverage: 0.85,
        evidence: 'Learner already covered repeated sampling.',
        frontier: 0.85,
        coherence: 0.7,
        centrality: 0.6,
        priority: 0,
      },
      E2: {
        current: false,
        coverage: 0.35,
        frontier: 0.35,
        coherence: 0.2,
        centrality: 0.5,
        priority: 0,
      },
    });

    expect(getScoreableExpectationIds(script, previousScores)).to.deep.equal(['E2']);
  });

  it('carries frozen covered expectation scores forward unchanged', function() {
    const script = buildScript();
    const previousScores = recomputeExpectationPriorities(script, {
      E1: {
        current: true,
        coverage: 0.85,
        evidence: 'Learner already covered repeated sampling.',
        frontier: 0.85,
        coherence: 0.7,
        centrality: 0.6,
        priority: 0,
      },
      E2: {
        current: false,
        coverage: 0.35,
        frontier: 0.35,
        coherence: 0.2,
        centrality: 0.5,
        priority: 0,
      },
    });
    const latestScores = {
      E2: {
        current: true,
        coverage: 0.9,
        evidence: 'Learner explained the parameter is fixed.',
        frontier: 0.9,
        coherence: 0.8,
        centrality: 0.7,
        priority: 0,
      },
    };

    const mergedScores = mergeScoreableExpectationScores(script, previousScores, latestScores, ['E2']);

    expect(mergedScores.E1).to.deep.equal(previousScores.E1);
    expect(mergedScores.E2?.coverage).to.equal(0.9);
  });

  it('preserves repaired misconception state until the learner reintroduces it', function() {
    const script = buildScript();
    const previousScores = {
      M1: {
        current: false,
        confidence: 0,
        repaired: true,
        repairEvidence: 'Learner said the parameter is fixed.',
      },
    };

    const stillRepaired = preserveRepairedMisconceptionState(script, previousScores, {
      M1: {
        current: false,
        confidence: 0.2,
        evidence: 'No new misconception in the latest answer.',
      },
    });
    expect(stillRepaired.M1).to.include({
      current: false,
      confidence: 0,
      repaired: true,
      repairEvidence: 'Learner said the parameter is fixed.',
    });

    const reintroduced = preserveRepairedMisconceptionState(script, stillRepaired, {
      M1: {
        current: true,
        confidence: 0.9,
        evidence: 'Learner again said there is a 95% chance the fixed mean is in this interval.',
      },
    });
    expect(reintroduced.M1).to.include({
      current: true,
      confidence: 0.9,
      repaired: false,
    });
  });

  it('marks below-threshold active misconceptions as repaired in durable state', function() {
    const script = buildScript();
    const previousScores = createInitialAutoTutorPlannerState(script).misconceptionScores;

    const repaired = preserveRepairedMisconceptionState(script, previousScores, {
      M1: {
        current: true,
        confidence: 0.55,
        evidence: 'Learner gave the repair answer, but the scorer left residual uncertainty.',
      },
    });

    expect(repaired.M1).to.include({
      current: false,
      confidence: 0,
      repaired: true,
      repairEvidence: 'Learner gave the repair answer, but the scorer left residual uncertainty.',
    });
  });
});
