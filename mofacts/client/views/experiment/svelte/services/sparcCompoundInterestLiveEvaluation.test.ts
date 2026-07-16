import { expect } from 'chai';
import type { SparcLearnerResponseScoringResult } from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
import {
  runSparcCompoundInterestLiveEvaluation,
  SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS,
} from './sparcCompoundInterestLiveEvaluation';

const EXPECTATION_IDS = [
  'autotutor.compound-interest-001.kc.e1',
  'autotutor.compound-interest-001.kc.e2',
  'autotutor.compound-interest-001.kc.e3',
  'autotutor.compound-interest-001.kc.e4',
] as const;

function scoreForTurn(
  learnerText: string,
  completeOnExactTurnFive: boolean,
  classifyTurnFourAsQuestion: boolean,
  inferUnsupportedM3: boolean,
  inferUnsupportedM3OnSynthesis: boolean,
): SparcLearnerResponseScoringResult {
  const exactTurn = SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS.indexOf(
    learnerText as typeof SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[number],
  );
  if (exactTurn === 0) {
    return {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [
        { id: 'M1', supportStrength: 0.8 },
        { id: 'M2', supportStrength: 0.5 },
      ],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 1) {
    return {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [{ id: 'M2', supportStrength: 0.7 }],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 2) {
    return {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [{ id: 'M2', supportStrength: 0.8 }],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 3) {
    return {
      learningTargetScores: [
        { clusterKC: EXPECTATION_IDS[0], coverage: 0.9 },
        { clusterKC: EXPECTATION_IDS[1], coverage: 0.9 },
        { clusterKC: EXPECTATION_IDS[3], coverage: 0.9 },
      ],
      diagnosticMisconceptionScores: [
        { id: 'M1', supportStrength: 0 },
        { id: 'M2', supportStrength: 0 },
      ],
      learnerContribution: { type: classifyTurnFourAsQuestion ? 'question' : 'answer' },
      ...(classifyTurnFourAsQuestion
        ? { learnerQuestion: { contentFocused: true } }
        : {}),
    };
  }
  if (exactTurn === 4 && completeOnExactTurnFive) {
    return {
      learningTargetScores: [{ clusterKC: EXPECTATION_IDS[2], coverage: 0.9 }],
      diagnosticMisconceptionScores: inferUnsupportedM3
        ? [{ id: 'M3', supportStrength: 0.25 }]
        : [],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn >= 0) {
    return {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [],
      learnerContribution: { type: 'answer' },
    };
  }
  return {
    learningTargetScores: EXPECTATION_IDS.map((clusterKC) => ({ clusterKC, coverage: 1 })),
    diagnosticMisconceptionScores: [
      { id: 'M1', supportStrength: 0 },
      { id: 'M2', supportStrength: 0 },
      { id: 'M3', supportStrength: inferUnsupportedM3OnSynthesis ? 0.25 : 0 },
    ],
    learnerContribution: { type: 'answer' },
  };
}

function evaluationOptions(
  completeOnExactTurnFive: boolean,
  classifyTurnFourAsQuestion = true,
  inferUnsupportedM3 = false,
  inferUnsupportedM3OnSynthesis = false,
) {
  return {
    totalRuns: 1,
    createProvider: () => ({
      scoreLearnerResponse: ({ learnerText }: { learnerText: string }) => (
        scoreForTurn(
          learnerText,
          completeOnExactTurnFive,
          classifyTurnFourAsQuestion,
          inferUnsupportedM3,
          inferUnsupportedM3OnSynthesis,
        )
      ),
      generateTutorUtterance: (request: { learnerText?: string }) => (
        `Okay, I hear your latest response: ${request.learnerText ?? ''}`
      ),
    }),
    getCapability: async () => ({
      configured: true,
      source: 'user' as const,
      model: 'openai/test-nano',
    }),
  };
}

describe('SPARC Compound Interest live evaluation harness', function() {
  it('stops an exact replay at early completion and retains the complete turn log', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions(true));
    const run = result.runs[0]!;

    expect(run.allRequirementsPassed).to.equal(true);
    expect(run.overallOutcome).to.equal('all-requirements-passed');
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('passed');
    expect(run.robustnessPassed).to.equal(true);
    expect(run.graduationPassed).to.equal(true);
    expect(run.exactTranscriptCompleted).to.equal(true);
    expect(run.turns).to.have.length(5);
    expect(run.turns.every((turn) => turn.phase === 'exact-transcript')).to.equal(true);
    expect(run.turns[1]).to.deep.include({
      learnerText: SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[1],
      completed: false,
    });
    expect(run.turns[1]?.tutorText).to.contain(SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[1]);
    expect(run.turns[4]).to.deep.include({
      productionRuleId: 'dialogue.completion.summary',
      action: 'summary',
      completed: true,
    });
    expect(run.failedRobustnessCheckIds).to.deep.equal([]);
    expect(run.finalMisconceptionSupportStrengths).to.deep.equal({ M1: 0, M2: 0, M3: 0 });
    expect(run.message).to.contain('Final misconception support strengths M1=0, M2=0, M3=0');
  });

  it('adds the explicit synthesis only when the exact replay has not graduated', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions(false));
    const run = result.runs[0]!;

    expect(run.robustnessPassed).to.equal(true);
    expect(run.exactTranscriptCompleted).to.equal(false);
    expect(run.graduationPassed).to.equal(true);
    expect(run.allRequirementsPassed).to.equal(true);
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('passed');
    expect(run.turns).to.have.length(7);
    expect(run.turns[6]?.phase).to.equal('graduation-synthesis');
    expect(run.turns[6]?.learnerText).to.contain('current balance is multiplied by 1.05');
    expect(run.turns[6]).to.deep.include({
      productionRuleId: 'dialogue.completion.summary',
      action: 'summary',
      completed: true,
    });
    expect(run.message).to.contain('Final misconception support strengths M1=0, M2=0, M3=0');
  });

  it('accepts turn 4 as a hesitant answer as well as a content-focused question', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions(true, false));
    const run = result.runs[0]!;

    expect(run.allRequirementsPassed).to.equal(true);
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.graduationPassed).to.equal(true);
    expect(run.robustnessOutcome).to.equal('passed');
    expect(run.robustnessPassed).to.equal(true);
    expect(run.failedRobustnessCheckIds).to.deep.equal([]);
    expect(result.graduationRequirementMet).to.equal(true);
    expect(result.robustnessRequirementMet).to.equal(true);
    expect(result.ok).to.equal(true);
  });

  it('reports positive M3 support strength as unsupported by the exact transcript', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(
      evaluationOptions(true, true, true),
    );
    const run = result.runs[0]!;

    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal(['unsupported-m3-not-inferred']);
    expect(run.checks.find((check) => check.id === 'unsupported-m3-not-inferred')?.message)
      .to.contain('turn(s) 5');
  });

  it('includes the optional synthesis turn in robustness evaluation', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(
      evaluationOptions(false, true, false, true),
    );
    const run = result.runs[0]!;

    expect(run.exactTranscriptCompleted).to.equal(false);
    expect(run.studentOutcome).to.equal('not-graduated');
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal(['unsupported-m3-not-inferred']);
    expect(run.checks.find((check) => check.id === 'unsupported-m3-not-inferred')?.message)
      .to.contain('turn(s) 7');
  });
});
