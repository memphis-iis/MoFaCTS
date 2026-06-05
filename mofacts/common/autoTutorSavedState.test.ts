import { expect } from 'chai';
import {
  createInitialAutoTutorPlannerState,
  type AutoTutorPlannerScript,
} from './lib/autoTutorPlanner';
import {
  validateAutoTutorSavedState,
  type AutoTutorSavedStateShape,
} from '../../learning-components/units/autotutor/AutoTutorSavedState';

function createScript(): AutoTutorPlannerScript {
  return {
    expectations: [
      {
        id: 'expectation-1',
        proposition: 'A confidence interval estimates a population parameter.',
        assertion: 'A confidence interval estimates a population parameter.',
      },
    ],
    misconceptions: [
      {
        id: 'misconception-1',
        correction: 'A confidence interval estimates a population parameter, not one individual score.',
        repairQuestion: 'Does it estimate an individual score or a population parameter?',
      },
    ],
    dialogPolicy: {
      requiredExpectations: ['expectation-1'],
    },
    summary: 'Confidence intervals estimate population parameters.',
  };
}

function createSavedState(): AutoTutorSavedStateShape {
  const planner = createInitialAutoTutorPlannerState(createScript());
  return {
    operationalPhase: 'awaiting_learner',
    pedagogicalState: {
      targetType: 'expectation',
      targetId: 'expectation-1',
      selectedMove: 'hint',
      focusTurnCount: 1,
      moveCycleIndex: 1,
    },
    transitions: [{
      from: 'initializing',
      to: 'awaiting_learner',
      reason: 'runtime initialized',
      at: 1,
    }],
    expectations: planner.expectationScores,
    misconceptions: planner.misconceptionScores,
    planner,
    answerQuality: 'partial',
    learnerContribution: {
      type: 'assertion',
      confidence: 0.8,
      evidence: 'The learner made a content claim.',
    },
    studentAskedQuestion: false,
    selectedMove: 'hint',
    turnCount: 1,
    costUsd: 0.01,
    completed: false,
    mastered: false,
    endReason: 'in_progress',
    stoppedByCost: false,
  };
}

describe('AutoTutor saved state', function() {
  it('validates a saved state against the expected script-owned score ids', function() {
    const state = createSavedState();

    expect(validateAutoTutorSavedState(state, state)).to.deep.equal(state);
  });

  it('rejects saved expectation scores with unknown ids', function() {
    const state = createSavedState();
    const invalid = {
      ...state,
      expectations: {
        ...state.expectations,
        'unexpected-expectation': state.expectations['expectation-1']!,
      },
    };

    expect(() => validateAutoTutorSavedState(invalid, state))
      .to.throw('AutoTutor saved history included unknown expectation "unexpected-expectation"');
  });

  it('rejects invalid learner contribution types and invalid end reasons', function() {
    const state = createSavedState();

    expect(() => validateAutoTutorSavedState({
      ...state,
      learnerContribution: {
        type: 'guessing',
        confidence: 0.8,
      } as any,
    }, state)).to.throw('AutoTutor saved history state.learnerContribution.type is invalid');

    expect(() => validateAutoTutorSavedState({
      ...state,
      endReason: 'timeout',
    } as any, state)).to.throw('AutoTutor saved history state.endReason is invalid');
  });

  it('requires explicit operational and pedagogical state for resume', function() {
    const state = createSavedState();

    expect(() => validateAutoTutorSavedState({
      ...state,
      operationalPhase: undefined,
    } as any, state)).to.throw('AutoTutor saved history state.operationalPhase is invalid');

    expect(() => validateAutoTutorSavedState({
      ...state,
      pedagogicalState: undefined,
    } as any, state)).to.throw('AutoTutor saved history state.pedagogicalState is invalid');

    expect(() => validateAutoTutorSavedState({
      ...state,
      transitions: undefined,
    } as any, state)).to.throw('AutoTutor saved history state.transitions must be an array');
  });

  it('rejects contradictory saved end flags and non-resumable current phases', function() {
    const state = createSavedState();

    expect(() => validateAutoTutorSavedState({
      ...state,
      mastered: true,
    }, state)).to.throw('AutoTutor saved history in-progress flags must all be false');

    expect(() => validateAutoTutorSavedState({
      ...state,
      operationalPhase: 'writing_history',
    }, state)).to.throw('AutoTutor saved history state.operationalPhase cannot resume from transient phase "writing_history"');

    expect(() => validateAutoTutorSavedState({
      ...state,
      operationalPhase: 'awaiting_learner',
      completed: true,
      mastered: true,
      endReason: 'mastery',
    }, state)).to.throw('AutoTutor saved history state.operationalPhase "awaiting_learner" does not match endReason "mastery"');

    expect(validateAutoTutorSavedState({
      ...state,
      operationalPhase: 'completed_cost_cap',
      completed: true,
      mastered: false,
      endReason: 'cost_cap',
      stoppedByCost: true,
    }, state)).to.include({
      operationalPhase: 'completed_cost_cap',
      endReason: 'cost_cap',
      stoppedByCost: true,
    });
  });

  it('rejects invalid target-specific pedagogical state and impossible target moves', function() {
    const state = createSavedState();

    expect(() => validateAutoTutorSavedState({
      ...state,
      selectedMove: 'correction',
      pedagogicalState: {
        targetType: 'misconception',
        selectedMove: 'correction',
        correctionStage: 'hint',
      },
    } as any, state)).to.throw('AutoTutor saved history state.pedagogicalState misconception requires a valid targetId');

    expect(() => validateAutoTutorSavedState({
      ...state,
      selectedMove: 'answer_question',
      pedagogicalState: {
        targetType: 'learner_question',
        selectedMove: 'answer_question',
        answerableFromAuthoredContent: true,
      },
    } as any, state)).to.throw('AutoTutor saved history state.pedagogicalState.questionScope is invalid');

    expect(() => validateAutoTutorSavedState({
      ...state,
      selectedMove: 'summary',
      pedagogicalState: {
        targetType: 'completion',
        selectedMove: 'summary',
      },
    } as any, state)).to.throw('AutoTutor saved history state.pedagogicalState.completionStage is invalid');

    expect(() => validateAutoTutorSavedState({
      ...state,
      selectedMove: 'answer_question',
    } as any, state)).to.throw('AutoTutor saved history state.selectedMove does not match pedagogicalState.selectedMove');
  });
});
