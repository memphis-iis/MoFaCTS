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
});
