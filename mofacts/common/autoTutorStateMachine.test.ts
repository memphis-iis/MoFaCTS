import { expect } from 'chai';

import {
  addAutoTutorUtteranceToTurn,
  applyAutoTutorCostCap,
  applySavedAutoTutorHistory,
  buildAutoTutorHistoryNote,
  computeAutoTutorProgress,
  createInitialAutoTutorState,
  markAutoTutorHistoryWritten,
  markAutoTutorStatePublished,
  markAutoTutorErrored,
  scoreAndPlanAutoTutorTurn,
  validateAutoTutorLearnerInput,
  type AutoTutorScoreEnvelopeLike,
  type AutoTutorState,
} from '../../learning-components/units/autotutor/AutoTutorStateMachine';
import type { AutoTutorConfig } from '../../learning-components/units/autotutor/AutoTutorRuntimeConfig';
import { createAutoTutorUnitEngine } from '../../learning-components/units/autotutor/AutoTutorUnitEngine';

function buildConfig(overrides: Partial<AutoTutorConfig> = {}): AutoTutorConfig {
  const config: AutoTutorConfig = {
    apiKey: 'test-key',
    model: 'test-model',
    utteranceTemperature: 0.45,
    graduation: {
      requiredExpectationCount: 2,
      maxActiveMisconceptions: 0,
    },
    turnLimit: {
      maxTurns: 10,
    },
    requireFinalAnswerPrompt: false,
    prompt: 'Explain confidence intervals.',
    unitName: 'AutoTutor Test',
    clusterIndex: 0,
    script: {
      id: 'script-1',
      topic: 'Confidence intervals',
      learningGoal: 'Explain long-run interval coverage.',
      idealAnswer: 'Intervals from repeated samples capture the fixed population parameter in the long run.',
      expectations: [
        { id: 'E1', proposition: 'Repeated samples create repeated intervals.', assertion: 'Repeated samples create repeated intervals.' },
        { id: 'E2', proposition: 'The population parameter is fixed.', assertion: 'The population parameter is fixed.' },
      ],
      misconceptions: [
        {
          id: 'M1',
          misconception: 'The fixed parameter has a probability inside this one interval.',
          correction: 'The parameter is fixed; intervals vary across samples.',
          repairQuestion: 'What varies across repeated samples?',
        },
      ],
      dialogPolicy: {
        requiredExpectations: ['E1', 'E2'],
      },
      summary: 'Confidence interval methods work across repeated samples.',
    },
  };
  return {
    ...config,
    ...overrides,
    graduation: {
      ...config.graduation,
      ...overrides.graduation,
    },
    turnLimit: {
      ...config.turnLimit,
      ...overrides.turnLimit,
    },
    script: {
      ...config.script,
      ...overrides.script,
    },
  };
}

function scoreEnvelope(
  state: AutoTutorState,
  overrides: Partial<AutoTutorScoreEnvelopeLike> = {},
): AutoTutorScoreEnvelopeLike {
  return {
    expectationScores: {
      E1: {
        ...state.expectations.E1!,
        current: false,
        coverage: 0.2,
      },
      E2: {
        ...state.expectations.E2!,
        current: false,
        coverage: 0.2,
      },
      ...overrides.expectationScores,
    },
    misconceptionScores: {
      M1: {
        current: false,
        confidence: 0,
      },
      ...overrides.misconceptionScores,
    },
    answerQuality: overrides.answerQuality || 'partial',
    learnerContribution: overrides.learnerContribution || {
      type: 'assertion',
      confidence: 0.9,
    },
    learnerQuestion: overrides.learnerQuestion || {
      current: false,
      answerableFromAuthoredContent: false,
    },
  };
}

function planWithScore(
  config: AutoTutorConfig,
  state: AutoTutorState,
  envelope: AutoTutorScoreEnvelopeLike,
) {
  return scoreAndPlanAutoTutorTurn({
    config,
    state,
    studentAnswer: 'learner answer',
  }, envelope, 0.01);
}

describe('AutoTutor state machine', function() {
  it('initializes explicit operational and pedagogical defaults', function() {
    const state = createInitialAutoTutorState(buildConfig().script);

    expect(state.operationalPhase).to.equal('awaiting_learner');
    expect(state.pedagogicalState).to.deep.equal({
      targetType: 'expectation',
      selectedMove: '',
      focusTurnCount: 0,
      moveCycleIndex: 0,
    });
    expect(state.transitions.map((transition) => [transition.from, transition.to]))
      .to.deep.equal([['initializing', 'awaiting_learner']]);
  });

  it('rejects blank input and completed sessions before scoring', function() {
    const state = createInitialAutoTutorState(buildConfig().script);

    expect(() => validateAutoTutorLearnerInput(state, '   '))
      .to.throw('AutoTutor runtime requires student answer');

    const completed = { ...state, completed: true };
    expect(() => validateAutoTutorLearnerInput(completed, 'answer'))
      .to.throw('AutoTutor session is already complete');
  });

  it('records errored operational phase for failed accepted turns', function() {
    const state = createInitialAutoTutorState(buildConfig().script);
    const errored = markAutoTutorErrored(state, 'scoring failed');

    expect(errored.operationalPhase).to.equal('errored');
    expect(errored.transitions.at(-1)).to.include({
      from: 'awaiting_learner',
      to: 'errored',
      reason: 'scoring failed',
    });
  });

  it('represents in-scope and out-of-scope learner questions explicitly', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);

    const inScope = planWithScore(config, state, scoreEnvelope(state, {
      learnerContribution: { type: 'question', confidence: 0.95 },
      learnerQuestion: {
        current: true,
        answerableFromAuthoredContent: true,
        evidence: 'asked about repeated sampling',
      },
    }));

    expect(inScope.plan.target.type).to.equal('learner_question');
    expect(inScope.nextState.pedagogicalState).to.deep.equal({
      targetType: 'learner_question',
      selectedMove: 'answer_question',
      questionScope: 'in_scope',
      answerableFromAuthoredContent: true,
    });

    const outOfScope = planWithScore(config, state, scoreEnvelope(state, {
      learnerContribution: { type: 'question', confidence: 0.95 },
      learnerQuestion: {
        current: true,
        answerableFromAuthoredContent: false,
        evidence: 'asked about an unauthored topic',
      },
    }));

    expect(outOfScope.nextState.pedagogicalState).to.deep.equal({
      targetType: 'learner_question',
      selectedMove: 'answer_question',
      questionScope: 'out_of_scope',
      answerableFromAuthoredContent: false,
    });
    expect(outOfScope.stateForUtterancePlan.pedagogicalState).to.deep.equal(outOfScope.nextState.pedagogicalState);
  });

  it('keeps learner questions ahead of active misconceptions', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);
    const planned = planWithScore(config, state, scoreEnvelope(state, {
      learnerContribution: { type: 'question', confidence: 0.95 },
      learnerQuestion: { current: true, answerableFromAuthoredContent: true },
      misconceptionScores: {
        M1: {
          current: true,
          confidence: 0.95,
          evidence: 'active misconception still present',
        },
      },
    }));

    expect(planned.plan.target.type).to.equal('learner_question');
    expect(planned.nextState.pedagogicalState).to.include({
      targetType: 'learner_question',
      questionScope: 'in_scope',
    });
  });

  it('routes active misconceptions and advances correction stages', function() {
    const config = buildConfig();
    let state = createInitialAutoTutorState(config.script);
    const stages: Array<string | undefined> = [];

    for (let turn = 0; turn < 3; turn += 1) {
      const planned = planWithScore(config, state, scoreEnvelope(state, {
        misconceptionScores: {
          M1: {
            current: true,
            confidence: 0.9,
            evidence: 'probability in one fixed interval',
          },
        },
      }));
      stages.push(planned.plan.correctionStage);
      state = planned.nextState;
    }

    expect(stages).to.deep.equal(['hint', 'prompt', 'assertion']);
    expect(state.pedagogicalState).to.include({
      targetType: 'misconception',
      targetId: 'M1',
      selectedMove: 'correction',
      correctionStage: 'assertion',
    });
  });

  it('keeps a repaired misconception repaired unless reintroduced', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);

    const repaired = planWithScore(config, state, scoreEnvelope(state, {
      misconceptionScores: {
        M1: {
          current: false,
          confidence: 0,
          repaired: true,
          repairEvidence: 'Learner said intervals vary.',
        },
      },
    })).nextState;
    expect(repaired.misconceptions.M1).to.include({ current: false, confidence: 0, repaired: true });

    const stillRepaired = planWithScore(config, repaired, scoreEnvelope(repaired, {
      expectationScores: {
        E1: { ...repaired.expectations.E1!, coverage: 0.4 },
        E2: { ...repaired.expectations.E2!, coverage: 0.2 },
      },
      misconceptionScores: {
        M1: {
          current: false,
          confidence: 0.2,
        },
      },
    })).nextState;
    expect(stillRepaired.misconceptions.M1).to.include({ current: false, confidence: 0, repaired: true });

    const reintroduced = planWithScore(config, stillRepaired, scoreEnvelope(stillRepaired, {
      misconceptionScores: {
        M1: {
          current: true,
          confidence: 0.95,
          evidence: 'Learner reintroduced probability in the fixed interval.',
        },
      },
    })).nextState;
    expect(reintroduced.misconceptions.M1).to.include({ current: true, confidence: 0.95, repaired: false });
  });

  it('advances expectation moves, idk escalation, pump, and near-threshold prompts', function() {
    const config = buildConfig();
    let state = createInitialAutoTutorState(config.script);
    const moves: string[] = [];

    for (let turn = 0; turn < 3; turn += 1) {
      const planned = planWithScore(config, state, scoreEnvelope(state, {
        learnerContribution: { type: 'idk', confidence: 0.95 },
        answerQuality: 'low',
      }));
      moves.push(planned.plan.selectedMove);
      state = planned.nextState;
    }
    expect(moves).to.deep.equal(['hint', 'prompt', 'assertion']);

    const fresh = createInitialAutoTutorState(config.script);
    const pump = planWithScore(config, fresh, scoreEnvelope(fresh, {
      answerQuality: 'low',
      learnerContribution: { type: 'assertion', confidence: 0.8 },
    }));
    expect(pump.plan.selectedMove).to.equal('pump');

    const nearThreshold = createInitialAutoTutorState(config.script);
    const prompt = planWithScore(config, nearThreshold, scoreEnvelope(nearThreshold, {
      expectationScores: {
        E1: { ...nearThreshold.expectations.E1!, coverage: 0.65, current: true },
        E2: { ...nearThreshold.expectations.E2!, coverage: 0.1 },
      },
    }));
    expect(prompt.plan.selectedMove).to.equal('prompt');
  });

  it('distinguishes final-answer prompt, summary mastery, max turns, and cost cap', function() {
    const finalPromptConfig = buildConfig({ requireFinalAnswerPrompt: true });
    let state = createInitialAutoTutorState(finalPromptConfig.script);
    const completeScores = scoreEnvelope(state, {
      expectationScores: {
        E1: { ...state.expectations.E1!, current: true, coverage: 0.9 },
        E2: { ...state.expectations.E2!, current: true, coverage: 0.9 },
      },
      answerQuality: 'high',
    });

    const finalPrompt = planWithScore(finalPromptConfig, state, completeScores);
    expect(finalPrompt.plan.selectedMove).to.equal('final_answer_prompt');
    expect(finalPrompt.nextState.completed).to.equal(false);
    expect(finalPrompt.nextState.pedagogicalState).to.include({
      targetType: 'completion',
      selectedMove: 'final_answer_prompt',
      completionStage: 'requesting_final_answer',
    });

    state = finalPrompt.nextState;
    const summaryEnvelope = scoreEnvelope(state, { answerQuality: 'high' });
    summaryEnvelope.expectationScores = {};
    const summary = planWithScore(finalPromptConfig, state, summaryEnvelope);
    expect(summary.plan.selectedMove).to.equal('summary');
    expect(summary.nextState.endReason).to.equal('mastery');

    const maxTurnConfig = buildConfig({ turnLimit: { maxTurns: 1 } });
    const maxTurnState = createInitialAutoTutorState(maxTurnConfig.script);
    const maxTurn = planWithScore(maxTurnConfig, maxTurnState, scoreEnvelope(maxTurnState));
    expect(maxTurn.nextState.endReason).to.equal('max_turns');

    const costCapped = applyAutoTutorCostCap(createInitialAutoTutorState(buildConfig().script));
    expect(costCapped.endReason).to.equal('cost_cap');
    expect(costCapped.operationalPhase).to.equal('completed_cost_cap');
  });

  it('counts covered expectations as one and uncovered expectations fractionally for progress', function() {
    const state = createInitialAutoTutorState(buildConfig().script);
    state.expectations.E1 = {
      ...state.expectations.E1!,
      coverage: 0.8,
    };
    state.expectations.E2 = {
      ...state.expectations.E2!,
      coverage: 0.5,
    };

    expect(computeAutoTutorProgress(state)).to.equal(0.75);
  });

  it('saves only stable post-turn operational phases in history notes', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);
    const inProgressPlanned = planWithScore(config, state, scoreEnvelope(state));
    const inProgressWithUtterance = addAutoTutorUtteranceToTurn(
      inProgressPlanned.nextState,
      'Try thinking about repeated samples.',
      0,
    );
    const inProgressNote = buildAutoTutorHistoryNote(config, inProgressWithUtterance, 'Try thinking about repeated samples.');

    expect(inProgressWithUtterance.operationalPhase).to.equal('writing_history');
    expect(inProgressNote.state.operationalPhase).to.equal('awaiting_learner');
    expect(inProgressNote.state.transitions.map((transition) => transition.to))
      .to.include('writing_history');

    const maxTurnConfig = buildConfig({ turnLimit: { maxTurns: 1 } });
    const maxTurnState = createInitialAutoTutorState(maxTurnConfig.script);
    const maxTurnPlanned = planWithScore(maxTurnConfig, maxTurnState, scoreEnvelope(maxTurnState));
    const maxTurnWithUtterance = addAutoTutorUtteranceToTurn(maxTurnPlanned.nextState, 'That is all for now.', 0);
    const maxTurnNote = buildAutoTutorHistoryNote(maxTurnConfig, maxTurnWithUtterance, 'That is all for now.');
    expect(maxTurnNote.state.operationalPhase).to.equal('completed_max_turns');

    const costCapped = applyAutoTutorCostCap(addAutoTutorUtteranceToTurn(inProgressPlanned.nextState, 'Cost cap.', 0));
    const costCapNote = buildAutoTutorHistoryNote(config, costCapped, 'Cost cap.');
    expect(costCapNote.state.operationalPhase).to.equal('completed_cost_cap');
  });

  it('publishes the matching stable phase after history write bookkeeping', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);
    const planned = planWithScore(config, state, scoreEnvelope(state));
    const withUtterance = addAutoTutorUtteranceToTurn(planned.nextState, 'Keep going.', 0);
    const historyWritten = markAutoTutorHistoryWritten(withUtterance);
    const published = markAutoTutorStatePublished(historyWritten);

    expect(withUtterance.operationalPhase).to.equal('writing_history');
    expect(historyWritten.operationalPhase).to.equal('publishing_state');
    expect(published.operationalPhase).to.equal('awaiting_learner');
  });

  it('restores explicit operational and pedagogical state from saved history', function() {
    const config = buildConfig();
    const state = createInitialAutoTutorState(config.script);
    const planned = planWithScore(config, state, scoreEnvelope(state, {
      learnerContribution: { type: 'question', confidence: 0.9 },
      learnerQuestion: { current: true, answerableFromAuthoredContent: false },
    }));
    const saved = planned.nextState;
    saved.dialogue.push({ role: 'tutor', text: 'I can only answer from this lesson.' });
    const note = buildAutoTutorHistoryNote(config, saved, 'I can only answer from this lesson.');
    const restored = createInitialAutoTutorState(config.script);

    applySavedAutoTutorHistory(config, restored, [{
      input: 'What about another topic?',
      feedbackText: 'I can only answer from this lesson.',
      CFNote: JSON.stringify(note),
    }]);

    expect(restored.operationalPhase).to.equal('awaiting_learner');
    expect(restored.pedagogicalState).to.deep.equal(saved.pedagogicalState);
    expect(restored.dialogue).to.deep.equal([
      { role: 'student', text: 'What about another topic?' },
      { role: 'tutor', text: 'I can only answer from this lesson.' },
    ]);
  });

  it('exposes reusable AutoTutor state-machine methods and rejects generic card-engine methods', async function() {
    const engine = createAutoTutorUnitEngine();

    expect(engine.unitType).to.equal('autotutor');
    expect(engine.createInitialState).to.equal(createInitialAutoTutorState);
    expect(engine.scoreAndPlanTurn).to.equal(scoreAndPlanAutoTutorTurn);
    expect(engine.validateLearnerInput).to.equal(validateAutoTutorLearnerInput);
    expect(() => engine.selectNextCard?.()).to.throw('AutoTutor unit engine does not support generic card-engine method selectNextCard');
    expect(() => engine.findCurrentCardInfo?.()).to.throw('AutoTutor unit engine does not support generic card-engine method findCurrentCardInfo');
    expect(() => engine.unitFinished?.()).to.throw('AutoTutor unit engine does not support generic card-engine method unitFinished');
    try {
      await engine.cardAnswered?.();
      throw new Error('Expected cardAnswered to reject');
    } catch (error) {
      expect((error as Error).message).to.equal('AutoTutor unit engine does not support generic card-engine method cardAnswered');
    }
  });
});
