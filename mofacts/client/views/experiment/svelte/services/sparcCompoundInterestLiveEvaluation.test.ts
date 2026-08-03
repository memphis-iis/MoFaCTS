import { expect } from 'chai';
import type {
  SparcLearnerResponseEvidenceEnvelope,
  SparcLearnerResponseScoringResult,
} from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
import {
  createSparcDialogueOpenRouterProvider,
  type SparcDialogueLearnerResponseScoringTraceEvent,
} from './sparcControllerDialogueOpenRouter';
import {
  runSparcCompoundInterestLiveEvaluation,
  SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS,
} from './sparcCompoundInterestLiveEvaluation';

const EXPECTATION_IDS = [
  'autotutor.compound-interest-001.kc.compounding-mechanism',
  'autotutor.compound-interest-001.kc.growth-consequence',
  'autotutor.compound-interest-001.kc.frequency-effect',
] as const;
const MISCONCEPTION_IDS = ['M1', 'M2', 'M3'] as const;

type EvaluationScenario = Readonly<{
  completeOnExactTurnSeven: boolean;
  classifyTurnFourAsQuestion?: boolean;
  turnFourCumulativeMechanismCoverage?: number;
  inferUnsupportedM3?: boolean;
  inferUnsupportedM3OnSynthesis?: boolean;
  keepM1ActiveAfterTurnSix?: boolean;
  synthesisFrequencyEffectStrength?: number;
  supportFrequencyEffectOnEarlyTurn?: 1 | 2 | 3 | 4;
}>;

function exactTurnIndex(learnerText: string): number {
  return SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS.indexOf(
    learnerText as typeof SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[number],
  );
}

function scoreForTurn(
  learnerText: string,
  scenario: EvaluationScenario,
): SparcLearnerResponseScoringResult {
  const exactTurn = exactTurnIndex(learnerText);
  const earlyFrequencyEffectScores = scenario.supportFrequencyEffectOnEarlyTurn === exactTurn + 1
    ? [{ clusterKC: EXPECTATION_IDS[2], coverage: 0.5 }]
    : [];
  if (exactTurn === 0) {
    return {
      learningTargetScores: earlyFrequencyEffectScores,
      diagnosticMisconceptionScores: [
        { id: 'M1', supportStrength: 0.8 },
        { id: 'M2', supportStrength: 0.5 },
      ],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 1) {
    return {
      learningTargetScores: earlyFrequencyEffectScores,
      diagnosticMisconceptionScores: [{ id: 'M2', supportStrength: 0.7 }],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 2) {
    return {
      learningTargetScores: earlyFrequencyEffectScores,
      diagnosticMisconceptionScores: [{ id: 'M2', supportStrength: 0.8 }],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 3) {
    return {
      learningTargetScores: [
        {
          clusterKC: EXPECTATION_IDS[0],
          coverage: scenario.turnFourCumulativeMechanismCoverage ?? 0.9,
        },
        ...earlyFrequencyEffectScores,
      ],
      diagnosticMisconceptionScores: [
        { id: 'M1', supportStrength: 0 },
        { id: 'M2', supportStrength: 0 },
      ],
      learnerContribution: { type: scenario.classifyTurnFourAsQuestion === false ? 'answer' : 'question' },
      ...(scenario.classifyTurnFourAsQuestion === false
        ? {}
        : { learnerQuestion: { contentFocused: true } }),
    };
  }
  if (exactTurn === 4 && scenario.completeOnExactTurnSeven) {
    return {
      learningTargetScores: [{ clusterKC: EXPECTATION_IDS[1], coverage: 0.9 }],
      diagnosticMisconceptionScores: scenario.inferUnsupportedM3
        ? [{ id: 'M3', supportStrength: 0.25 }]
        : [],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 5 && scenario.keepM1ActiveAfterTurnSix) {
    return {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [{ id: 'M1', supportStrength: 0.5 }],
      learnerContribution: { type: 'answer' },
    };
  }
  if (exactTurn === 6 && scenario.completeOnExactTurnSeven) {
    return {
      learningTargetScores: [{ clusterKC: EXPECTATION_IDS[2], coverage: 0.9 }],
      diagnosticMisconceptionScores: [{ id: 'M3', supportStrength: 0 }],
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
    learningTargetScores: EXPECTATION_IDS.map((clusterKC) => ({
      clusterKC,
      coverage: clusterKC === EXPECTATION_IDS[2]
        ? scenario.synthesisFrequencyEffectStrength ?? 1
        : 1,
    })),
    diagnosticMisconceptionScores: [
      { id: 'M1', supportStrength: 0 },
      { id: 'M2', supportStrength: 0 },
      { id: 'M3', supportStrength: scenario.inferUnsupportedM3OnSynthesis ? 0.1 : 0 },
    ],
    learnerContribution: { type: 'answer' },
  };
}

function evidenceForTurn(
  learnerText: string,
  scenario: EvaluationScenario,
): SparcLearnerResponseEvidenceEnvelope {
  const exactTurn = exactTurnIndex(learnerText);
  const contributionType = exactTurn === 3 && scenario.classifyTurnFourAsQuestion !== false
    ? 'question'
    : 'answer';
  return {
    learningTargetEvaluations: EXPECTATION_IDS.map((clusterKC) => {
      let evidenceStrength = 0;
      if (scenario.supportFrequencyEffectOnEarlyTurn === exactTurn + 1
        && clusterKC === EXPECTATION_IDS[2]) {
        evidenceStrength = 0.5;
      } else if (exactTurn === 3 && clusterKC === EXPECTATION_IDS[0]) {
        evidenceStrength = scenario.turnFourCumulativeMechanismCoverage ?? 0.9;
      } else if (exactTurn === 4 && scenario.completeOnExactTurnSeven && clusterKC === EXPECTATION_IDS[1]) {
        evidenceStrength = 0.9;
      } else if (exactTurn === 6 && scenario.completeOnExactTurnSeven && clusterKC === EXPECTATION_IDS[2]) {
        evidenceStrength = 0.9;
      } else if (exactTurn < 0) {
        evidenceStrength = clusterKC === EXPECTATION_IDS[2]
          ? scenario.synthesisFrequencyEffectStrength ?? 1
          : 1;
      }
      return {
        clusterKC,
        evidenceDirection: evidenceStrength > 0 ? 'supports' as const : 'unaddressed' as const,
        evidenceStrength,
      };
    }),
    diagnosticMisconceptionEvaluations: MISCONCEPTION_IDS.map((id) => {
      if (exactTurn === 0 && id === 'M1') {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.8 };
      }
      if (exactTurn === 0 && id === 'M2') {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.5 };
      }
      if (exactTurn === 1 && id === 'M2') {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.7 };
      }
      if (exactTurn === 2 && id === 'M2') {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.8 };
      }
      if (exactTurn === 3 && (id === 'M1' || id === 'M2')) {
        return { id, evidenceDirection: 'contradicts' as const, evidenceStrength: 1 };
      }
      if (exactTurn === 4 && id === 'M3' && scenario.inferUnsupportedM3) {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.25 };
      }
      if (exactTurn === 5 && id === 'M1' && scenario.keepM1ActiveAfterTurnSix) {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.5 };
      }
      if (exactTurn === 6 && id === 'M3' && scenario.completeOnExactTurnSeven) {
        return { id, evidenceDirection: 'contradicts' as const, evidenceStrength: 1 };
      }
      if (exactTurn < 0 && (id === 'M1' || id === 'M2')) {
        return { id, evidenceDirection: 'contradicts' as const, evidenceStrength: 1 };
      }
      if (exactTurn < 0 && id === 'M3' && scenario.inferUnsupportedM3OnSynthesis) {
        return { id, evidenceDirection: 'supports' as const, evidenceStrength: 0.1 };
      }
      if (exactTurn < 0 && id === 'M3') {
        return { id, evidenceDirection: 'contradicts' as const, evidenceStrength: 1 };
      }
      return { id, evidenceDirection: 'unaddressed' as const, evidenceStrength: 0 };
    }),
    learnerContribution: { type: contributionType },
    ...(contributionType === 'question'
      ? { learnerQuestion: { contentFocused: true } }
      : {}),
  };
}

function deterministicProvider(
  scenario: EvaluationScenario,
  onLearnerResponseScoringTrace: (event: SparcDialogueLearnerResponseScoringTraceEvent) => void,
) {
  return {
    scoreLearnerResponse: ({ learnerText }: { learnerText: string }) => {
      const learnerResponseScore = scoreForTurn(learnerText, scenario);
      const evidenceEnvelope = evidenceForTurn(learnerText, scenario);
      onLearnerResponseScoringTrace({
        stage: 'provider-response',
        parsedContent: evidenceEnvelope,
      });
      onLearnerResponseScoringTrace({
        stage: 'evidence-parsed',
        evidenceEnvelope,
      });
      onLearnerResponseScoringTrace({
        stage: 'evaluation-completed',
        evaluation: {
          evidenceEnvelope,
          learnerResponseScore,
        },
      });
      return learnerResponseScore;
    },
    generateTutorUtterance: (request: { learnerText?: string }) => (
      `The latest response was recorded: ${request.learnerText ?? ''}`
    ),
  };
}

function configuredCapability() {
  return Promise.resolve({
    configured: true,
    source: 'user' as const,
    model: 'openai/test-nano',
    reasoningLevel: 'none' as const,
  });
}

function evaluationOptions(scenario: EvaluationScenario) {
  return {
    totalRuns: 1,
    createProvider: (
      onLearnerResponseScoringTrace: (
        event: SparcDialogueLearnerResponseScoringTraceEvent,
      ) => void,
    ) => deterministicProvider(scenario, onLearnerResponseScoringTrace),
    getCapability: configuredCapability,
  };
}

describe('SPARC Compound Interest live evaluation harness', function() {
  it('completes the exact replay without synthesis and retains the complete turn log', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: true,
    }));
    const run = result.runs[0]!;

    expect(result.reasoningLevel).to.equal('none');
    expect(result.sourceTdfId).to.equal('deterministic-test-fixture');
    expect(result.sourcePageId).to.equal('sparc-session-compound-interest-live-evaluation');
    expect(result.problemStatement).to.contain(
      'splitting that same 5% annual rate across more frequent compounding periods',
    );
    expect(run.allRequirementsPassed).to.equal(true);
    expect(run.overallOutcome).to.equal('all-requirements-passed');
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('passed');
    expect(run.robustnessPassed).to.equal(true);
    expect(run.graduationPassed).to.equal(true);
    expect(run.exactTranscriptCompleted).to.equal(true);
    expect(run.turns).to.have.length(7);
    expect(run.turns.every((turn) => turn.phase === 'exact-transcript')).to.equal(true);
    expect(run.turns.every((turn) => (
      turn.evidenceEnvelope.learningTargetEvaluations.length === 3
      && turn.evidenceEnvelope.diagnosticMisconceptionEvaluations.length === 3
      && turn.effectiveScoringState.learningTargetScores.length === 3
      && turn.effectiveScoringState.diagnosticMisconceptionScores.length === 3
    ))).to.equal(true);
    expect(run.turns[0]?.effectiveScoringState.learningTargetScores.map((score) => score.clusterKC))
      .to.deep.equal([...EXPECTATION_IDS]);
    expect(run.turns[0]?.evidenceEnvelope.diagnosticMisconceptionEvaluations)
      .to.deep.include({ id: 'M1', evidenceDirection: 'supports', evidenceStrength: 0.8 });
    expect(run.turns[0]?.effectiveScoringState.diagnosticMisconceptionScores)
      .to.deep.include({ id: 'M1', supportStrength: 0.8 });
    expect(run.turns[1]).to.deep.include({
      learnerText: SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[1],
      completed: false,
    });
    expect(run.turns[1]?.tutorText).to.contain(SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[1]);
    expect(run.turns[6]).to.deep.include({
      productionRuleId: 'dialogue.completion.summary',
      action: 'summary',
      completed: true,
    });
    expect(run.failedRobustnessCheckIds).to.deep.equal([]);
    expect(run.finalMisconceptionSupportStrengths).to.deep.equal({ M1: 0, M2: 0, M3: 0 });
    expect(run.message).to.contain('Final misconception support strengths M1=0, M2=0, M3=0');
  });

  it('adds the explicit synthesis and counts its completion when the exact replay has not graduated', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: false,
    }));
    const run = result.runs[0]!;

    expect(run.robustnessPassed).to.equal(true);
    expect(run.exactTranscriptCompleted).to.equal(false);
    expect(run.graduationPassed).to.equal(true);
    expect(run.allRequirementsPassed).to.equal(true);
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('passed');
    expect(run.overallOutcome).to.equal('all-requirements-passed');
    expect(run.turns).to.have.length(8);
    expect(run.turns[7]?.phase).to.equal('graduation-synthesis');
    expect(run.turns[7]?.learnerText).to.contain('earned interest is added to the account balance');
    expect(run.turns[7]?.learnerText).to.contain('original $1,000 plus previously earned interest');
    expect(run.turns[7]?.learnerText).to.contain('multiplies the current balance by 1.05');
    expect(run.turns[7]?.learnerText).to.contain('rather than remaining fixed');
    expect(run.turns[7]?.learnerText).to.contain('annual rate is divided across compounding periods');
    expect(run.turns[7]?.evidenceEnvelope.learningTargetEvaluations)
      .to.deep.include({
        clusterKC: EXPECTATION_IDS[2],
        evidenceDirection: 'supports',
        evidenceStrength: 1,
      });
    expect(run.turns[7]).to.deep.include({
      productionRuleId: 'dialogue.completion.summary',
      action: 'summary',
      targetType: 'completion',
      completed: true,
    });
    expect(run.message).to.contain('Final misconception support strengths M1=0, M2=0, M3=0');
  });

  it('accepts turn 4 as a hesitant answer as well as a content-focused question', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: true,
      classifyTurnFourAsQuestion: false,
    }));
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

  it('fails robustness when the accumulated turn-4 dialogue leaves the mechanism below the lenient early checkpoint', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: true,
      turnFourCumulativeMechanismCoverage: 0.5,
    }));
    const run = result.runs[0]!;

    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal([
      'turn-4-cumulative-mechanism-coverage',
    ]);
    expect(run.checks.find((check) => check.id === 'turn-4-cumulative-mechanism-coverage')?.message)
      .to.contain('was 0.5; the early robustness checkpoint requires 0.6');
  });

  it('fails robustness when a pre-frequency response falsely supports the frequency effect', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: true,
      supportFrequencyEffectOnEarlyTurn: 4,
    }));
    const run = result.runs[0]!;

    expect(run.studentOutcome).to.equal('graduated');
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal([
      'pre-frequency-responses-do-not-support-frequency-effect',
    ]);
    expect(run.checks.find((check) => check.id === 'pre-frequency-responses-do-not-support-frequency-effect')?.message)
      .to.contain('turn 4 at strength 0.5');
  });

  it('reports positive M3 support strength as unsupported by the exact transcript', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(
      evaluationOptions({
        completeOnExactTurnSeven: true,
        inferUnsupportedM3: true,
      }),
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
      evaluationOptions({
        completeOnExactTurnSeven: false,
        inferUnsupportedM3OnSynthesis: true,
      }),
    );
    const run = result.runs[0]!;

    expect(run.exactTranscriptCompleted).to.equal(false);
    expect(run.studentOutcome).to.equal('graduated');
    expect(run.graduationPassed).to.equal(true);
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal(['unsupported-m3-not-inferred']);
    expect(run.checks.find((check) => check.id === 'unsupported-m3-not-inferred')?.message)
      .to.contain('turn(s) 8');
  });

  it('fails robustness when M1 remains active after exact-transcript turn 6', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: false,
      keepM1ActiveAfterTurnSix: true,
    }));
    const run = result.runs[0]!;

    expect(run.studentOutcome).to.equal('graduated');
    expect(run.graduationPassed).to.equal(true);
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal(['turn-6-m1-inactive']);
    expect(run.checks.find((check) => check.id === 'turn-6-m1-inactive')?.message)
      .to.contain('was 0.5');
    expect(run.usage.cacheDiscountUsd).to.equal(null);
  });

  it('uses one opaque session per run and aggregates sanitized usage by operation', async function() {
    const scenario: EvaluationScenario = { completeOnExactTurnSeven: true };
    const sessionIds: string[] = [];
    const result = await runSparcCompoundInterestLiveEvaluation({
      totalRuns: 2,
      createProvider(onLearnerResponseScoringTrace, sessionId, onUsage) {
        sessionIds.push(sessionId);
        const provider = deterministicProvider(scenario, onLearnerResponseScoringTrace);
        return {
          scoreLearnerResponse(request) {
            onUsage({
              operation: 'scoring',
              sessionIdApplied: true,
              usage: {
                promptTokens: 100,
                cachedPromptTokens: 50,
                cacheWritePromptTokens: 10,
                completionTokens: 5,
                totalTokens: 105,
                costUsd: 0.01,
                cacheDiscountUsd: 0.004,
              },
            });
            return provider.scoreLearnerResponse(request);
          },
          generateTutorUtterance(request) {
            onUsage({
              operation: 'utterance',
              sessionIdApplied: true,
              usage: {
                promptTokens: 80,
                cachedPromptTokens: 20,
                cacheWritePromptTokens: 5,
                completionTokens: 10,
                totalTokens: 90,
                costUsd: 0.02,
              },
            });
            return provider.generateTutorUtterance(request);
          },
        };
      },
      getCapability: configuredCapability,
    });

    expect(sessionIds).to.have.length(2);
    expect(sessionIds[0]).to.be.a('string').and.not.equal('');
    expect(sessionIds[1]).to.not.equal(sessionIds[0]);
    expect(result.runs[0]?.usage.byOperation.scoring).to.deep.include({
      requestCount: 7,
      promptTokens: 700,
      cachedPromptTokens: 350,
      cacheWritePromptTokens: 70,
      completionTokens: 35,
      totalTokens: 735,
      cacheReadRatio: 0.5,
    });
    expect(result.runs[0]?.usage.byOperation.utterance).to.deep.include({
      requestCount: 7,
      promptTokens: 560,
      cachedPromptTokens: 140,
      cacheWritePromptTokens: 35,
      completionTokens: 70,
      totalTokens: 630,
      cacheReadRatio: 0.25,
    });
    expect(result.usage).to.deep.include({
      requestCount: 28,
      promptTokens: 2520,
      cachedPromptTokens: 980,
      cacheWritePromptTokens: 210,
      completionTokens: 210,
      totalTokens: 2730,
      cacheDiscountReportedRequestCount: 14,
      sessionIdAppliedRequestCount: 28,
    });
    expect(result.usage.cacheReadRatio).to.be.closeTo(980 / 2520, 1e-12);
    expect(result.usage.costUsd).to.be.closeTo(0.42, 1e-12);
    expect(result.usage.cacheDiscountUsd).to.be.closeTo(0.056, 1e-12);
    expect(result.usage.costPerRequestUsd).to.be.closeTo(0.015, 1e-12);
    expect(result.usage.costPerDialogueTurnUsd).to.be.closeTo(0.03, 1e-12);
  });

  it('fails robustness when the synthesis does not recognize the frequency effect at completion strength', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation(evaluationOptions({
      completeOnExactTurnSeven: false,
      synthesisFrequencyEffectStrength: 0.75,
    }));
    const run = result.runs[0]!;

    expect(run.studentOutcome).to.equal('not-graduated');
    expect(run.robustnessOutcome).to.equal('failed');
    expect(run.failedRobustnessCheckIds).to.deep.equal(['synthesis-frequency-effect-recognized']);
    expect(run.checks.find((check) => check.id === 'synthesis-frequency-effect-recognized')?.message)
      .to.contain('supports at strength 0.75');
  });

  it('retains rejected scoring evidence and excludes evaluation errors from the graduation denominator', async function() {
    const scenario: EvaluationScenario = { completeOnExactTurnSeven: true };
    const baseEnvelope = evidenceForTurn(
      SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[0],
      scenario,
    );
    const invalidEnvelope: SparcLearnerResponseEvidenceEnvelope = {
      ...baseEnvelope,
      diagnosticMisconceptionEvaluations: baseEnvelope.diagnosticMisconceptionEvaluations.map(
        (evaluation) => evaluation.id === 'M1'
          ? { ...evaluation, evidenceDirection: 'supports' as const, evidenceStrength: 0 }
          : evaluation,
      ),
    };
    let providerCreationCount = 0;
    const result = await runSparcCompoundInterestLiveEvaluation({
      totalRuns: 2,
      createProvider(onLearnerResponseScoringTrace) {
        providerCreationCount += 1;
        if (providerCreationCount === 1) {
          return createSparcDialogueOpenRouterProvider({
            onLearnerResponseScoringTrace,
            async callResolvedOpenRouterJson() {
              return { parsedContent: invalidEnvelope };
            },
          });
        }
        return deterministicProvider(scenario, onLearnerResponseScoringTrace);
      },
      getCapability: configuredCapability,
    });
    const failedEvaluation = result.runs[0]!;
    const evaluatedRun = result.runs[1]!;

    expect(failedEvaluation.overallOutcome).to.equal('evaluation-error');
    expect(failedEvaluation.studentOutcome).to.equal('not-evaluated');
    expect(failedEvaluation.robustnessOutcome).to.equal('not-evaluated');
    expect(failedEvaluation.turns).to.deep.equal([]);
    expect(failedEvaluation.message).to.contain(
      'Evaluation error during scoring-evidence-validation',
    );
    expect(failedEvaluation.message).to.not.contain('Student did not graduate');
    expect(failedEvaluation.evaluationDiagnostic).to.deep.include({
      stage: 'scoring-evidence-validation',
    });
    expect(failedEvaluation.evaluationDiagnostic?.attemptedTurn).to.deep.include({
      turn: 1,
      phase: 'exact-transcript',
      learnerText: SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[0],
    });
    expect(failedEvaluation.evaluationDiagnostic?.attemptedTurn?.providerParsedContent)
      .to.deep.equal(invalidEnvelope);
    expect(failedEvaluation.evaluationDiagnostic?.attemptedTurn?.evidenceEnvelope)
      .to.deep.equal(invalidEnvelope);
    expect(evaluatedRun.studentOutcome).to.equal('graduated');
    expect(result.evaluatedRuns).to.equal(1);
    expect(result.evaluationErrorRuns).to.equal(1);
    expect(result.notRunRuns).to.equal(0);
    expect(result.passRate).to.equal(1);
    expect(result.requiredGraduationRuns).to.equal(2);
    expect(result.evaluationRequirementMet).to.equal(false);
    expect(result.robustnessRequirementMet).to.equal(true);
    expect(result.graduationRequirementMet).to.equal(false);
    expect(result.ok).to.equal(false);
  });

  it('retains the raw provider payload when scoring-response parsing fails', async function() {
    const parsedContent = {
      learningTargetEvaluations: 'not-an-array',
      diagnosticMisconceptionEvaluations: [],
      learnerContribution: { type: 'answer' },
    };
    const result = await runSparcCompoundInterestLiveEvaluation({
      totalRuns: 1,
      createProvider(onLearnerResponseScoringTrace) {
        return createSparcDialogueOpenRouterProvider({
          onLearnerResponseScoringTrace,
          async callResolvedOpenRouterJson() {
            return { parsedContent };
          },
        });
      },
      getCapability: configuredCapability,
    });
    const run = result.runs[0]!;

    expect(run.overallOutcome).to.equal('evaluation-error');
    expect(run.studentOutcome).to.equal('not-evaluated');
    expect(run.evaluationDiagnostic?.stage).to.equal('scoring-response-parse');
    expect(run.evaluationDiagnostic?.attemptedTurn?.providerParsedContent)
      .to.deep.equal(parsedContent);
    expect(run.evaluationDiagnostic?.attemptedTurn).to.not.have.property('evidenceEnvelope');
    expect(run.turns).to.deep.equal([]);
    expect(result.evaluatedRuns).to.equal(0);
    expect(result.evaluationErrorRuns).to.equal(1);
    expect(result.passRate).to.equal(null);
    expect(result.requiredGraduationRuns).to.equal(1);
    expect(result.evaluationRequirementMet).to.equal(false);
    expect(result.ok).to.equal(false);
  });

  it('retains attempted-turn diagnostics when the provider rate-limits tutor generation', async function() {
    const scenario: EvaluationScenario = { completeOnExactTurnSeven: true };
    const result = await runSparcCompoundInterestLiveEvaluation({
      totalRuns: 2,
      createProvider(onLearnerResponseScoringTrace) {
        const provider = deterministicProvider(scenario, onLearnerResponseScoringTrace);
        return {
          ...provider,
          generateTutorUtterance() {
            throw Object.assign(new Error('Too many requests. Please try again later.'), {
              error: 'too-many-requests',
            });
          },
        };
      },
      getCapability: configuredCapability,
    });
    const interruptedRun = result.runs[0]!;
    const skippedRun = result.runs[1]!;

    expect(interruptedRun.overallOutcome).to.equal('not-run');
    expect(interruptedRun.studentOutcome).to.equal('not-evaluated');
    expect(interruptedRun.evaluationDiagnostic?.stage).to.equal('dialogue-turn');
    expect(interruptedRun.evaluationDiagnostic?.attemptedTurn).to.deep.include({
      turn: 1,
      phase: 'exact-transcript',
      learnerText: SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[0],
    });
    expect(interruptedRun.evaluationDiagnostic?.attemptedTurn?.evidenceEnvelope)
      .to.deep.equal(evidenceForTurn(
        SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS[0],
        scenario,
      ));
    expect(interruptedRun.message).to.contain('Evaluation not run during dialogue-turn');
    expect(skippedRun.overallOutcome).to.equal('not-run');
    expect(skippedRun).to.not.have.property('evaluationDiagnostic');
    expect(result.evaluatedRuns).to.equal(0);
    expect(result.evaluationErrorRuns).to.equal(0);
    expect(result.notRunRuns).to.equal(2);
    expect(result.passRate).to.equal(null);
    expect(result.evaluationRequirementMet).to.equal(false);
    expect(result.ok).to.equal(false);
  });

  it('stops planned runs when OpenRouter reports a structured HTTP 429 during scoring', async function() {
    const result = await runSparcCompoundInterestLiveEvaluation({
      totalRuns: 2,
      createProvider() {
        return {
          scoreLearnerResponse() {
            throw Object.assign(new Error('OpenRouter request failed with HTTP 429.'), {
              error: 'openrouter-request-failed',
              details: JSON.stringify({ httpStatus: 429 }),
            });
          },
          generateTutorUtterance() {
            throw new Error('Tutor generation must not run after scoring fails');
          },
        };
      },
      getCapability: configuredCapability,
    });

    expect(result.runs[0]?.overallOutcome).to.equal('not-run');
    expect(result.runs[0]?.evaluationDiagnostic?.stage).to.equal('scoring-provider');
    expect(result.runs[1]?.overallOutcome).to.equal('not-run');
    expect(result.runs[1]?.message).to.contain('preceding run');
    expect(result.evaluationErrorRuns).to.equal(0);
    expect(result.notRunRuns).to.equal(2);
  });
});
