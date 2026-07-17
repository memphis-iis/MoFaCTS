import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import { evaluateSparcControllerDialogueTurn } from '../../../../../../learning-components/units/sparcsession/sparcControllerDialogueTurn';
import { createSparcProgressiveScaffoldingRules } from '../../../../../../learning-components/units/sparcsession/sparcProgressiveScaffoldingRules';
import type {
  SparcLearnerResponseEvidenceEnvelope,
  SparcLearnerResponseScoringResult,
} from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
import {
  applySparcStateTransition,
  createEmptySparcReplayState,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from '../../../../../../learning-components/units/sparcsession/sparcSessionContracts';
import {
  createSparcDialogueOpenRouterProvider,
  type CallResolvedOpenRouterJson,
  type SparcDialogueLearnerResponseEvaluation,
  type SparcDialogueLearnerResponseScoringTraceEvent,
} from './sparcControllerDialogueOpenRouter';
import type { OpenRouterCapability } from '../../../../lib/openRouterClientProfile';

const PAGE_KEY = 'sparc-session-compound-interest-live-evaluation';
const INPUT_NODE_ID = 'learner-response-input';
type MisconceptionId = 'M1' | 'M2' | 'M3';
const COVERAGE_THRESHOLD = 0.8;
const MISCONCEPTION_ACTIVATION_THRESHOLD = 0.2;
const E4_ID = 'autotutor.compound-interest-001.kc.e4';
const PROBLEM_STATEMENT = 'Suppose $1,000 earns 5% interest each year and the interest is left in the account. In your own words, how does compound interest make the balance grow over time?';
const GRADUATION_SYNTHESIS = 'After each year, the earned interest is added to the account balance. The next year’s 5% is calculated on that updated balance—the original $1,000 plus previously earned interest. This repeatedly multiplies the current balance by 1.05, so growth is multiplicative and the dollar amount of interest increases rather than remaining fixed as it would if interest were calculated only from the original principal.';

export const SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS = [
  'Well it means you gain $50 each year.',
  'Well it\'s computed from the $1,000. Otherwise what I said didn\'t make sense.',
  'Well my understanding is it\'s the $1,000.',
  'So you\'re saying that actually it\'s not the calculated on the principle? It\'s calculated on the entire balance? We compute the 5% on 1050?',
  '52.50 ending balance 1102.50',
  'Well it means the starting amount for the calculation of interest goes up each time. It doesn\'t stay the same and so you earn accumulating interest that goes up over time.',
] as const;

export type SparcCompoundInterestLiveEvaluationTurn = Readonly<{
  turn: number;
  phase: 'exact-transcript' | 'graduation-synthesis';
  learnerText: string;
  evidenceEnvelope: SparcLearnerResponseEvidenceEnvelope;
  learnerResponseScore: SparcLearnerResponseScoringResult;
  effectiveScoringState: Readonly<{
    learningTargetScores: readonly Readonly<{
      clusterKC: string;
      coverage: number;
    }>[];
    diagnosticMisconceptionScores: readonly Readonly<{
      id: string;
      supportStrength: number;
    }>[];
  }>;
  tutorText: string;
  productionRuleId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  completed: boolean;
}>;

export type SparcCompoundInterestLiveEvaluationCheck = Readonly<{
  id: string;
  passed: boolean;
  message: string;
}>;

export type SparcCompoundInterestLiveEvaluationDiagnostic = Readonly<{
  stage: 'scoring-provider'
    | 'scoring-response-parse'
    | 'scoring-evidence-validation'
    | 'dialogue-turn'
    | 'evaluation-run';
  message: string;
  attemptedTurn?: Readonly<{
    turn: number;
    phase: SparcCompoundInterestLiveEvaluationTurn['phase'];
    learnerText: string;
    providerParsedContent?: unknown;
    evidenceEnvelope?: SparcLearnerResponseEvidenceEnvelope;
  }>;
}>;

export type SparcCompoundInterestLiveEvaluationRun = Readonly<{
  run: number;
  overallOutcome: 'all-requirements-passed' | 'requirements-failed' | 'evaluation-error' | 'not-run';
  allRequirementsPassed: boolean;
  studentOutcome: 'graduated' | 'not-graduated' | 'not-evaluated';
  robustnessOutcome: 'passed' | 'failed' | 'not-evaluated';
  robustnessPassed: boolean;
  graduationPassed: boolean;
  failedRobustnessCheckIds: readonly string[];
  finalMisconceptionSupportStrengths: Readonly<Record<MisconceptionId, number>>;
  exactTranscriptCompleted: boolean;
  checks: readonly SparcCompoundInterestLiveEvaluationCheck[];
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[];
  evaluationDiagnostic?: SparcCompoundInterestLiveEvaluationDiagnostic;
  message: string;
}>;

export type SparcCompoundInterestLiveEvaluationResult = Readonly<{
  ok: boolean;
  generatedAt: string;
  model: string;
  modelSource: 'tdf' | 'user' | 'admin' | null;
  reasoningLevel: OpenRouterCapability['reasoningLevel'];
  problemStatement: string;
  requiredPassRate: number;
  requiredGraduationRuns: number;
  passRate: number | null;
  allRequirementsPassedRuns: number;
  robustnessPassedRuns: number;
  graduationPassedRuns: number;
  evaluatedRuns: number;
  evaluationErrorRuns: number;
  notRunRuns: number;
  totalRuns: number;
  evaluationRequirementMet: boolean;
  robustnessRequirementMet: boolean;
  graduationRequirementMet: boolean;
  runs: readonly SparcCompoundInterestLiveEvaluationRun[];
}>;

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function createFixture(): { display: SparcTrialDisplay; document: SparcAuthoredDocument } {
  const expectations = [
    {
      clusterKC: 'autotutor.compound-interest-001.kc.e1',
      text: 'After each compounding period, earned interest is added to the balance or principal.',
    },
    {
      clusterKC: 'autotutor.compound-interest-001.kc.e2',
      text: 'Later interest is calculated on the original principal plus previously earned interest.',
    },
    {
      clusterKC: 'autotutor.compound-interest-001.kc.e3',
      text: 'Compound growth applies a rate repeatedly, so the balance follows a multiplicative or exponential pattern rather than a fixed dollar increase.',
    },
    {
      clusterKC: 'autotutor.compound-interest-001.kc.e4',
      text: 'Interest calculated only from the original principal differs from compound interest, which uses the updated balance.',
    },
  ] as const;
  const misconceptions = [
    { id: 'M1', text: 'A fixed annual rate means the same dollar amount is added every year.' },
    { id: 'M2', text: 'Compound interest is just interest on the original principal.' },
    { id: 'M3', text: 'The frequency of compounding—shorter or longer intervals between interest additions—makes no difference to the ending balance.' },
  ] as const;
  const workingMemoryFacts = [
    fact('dialogue.thresholds', {
      lowCoverageMax: 0.33,
      mediumCoverageMax: 0.67,
      highCoverageMin: 0.67,
      coverageThreshold: COVERAGE_THRESHOLD,
    }),
    fact('controller.targetSelectionPolicy', {
      policy: 'kc-graph-priority',
      coverageThreshold: COVERAGE_THRESHOLD,
      frontierWeight: 0.5,
      coherenceWeight: 0.3,
      centralityWeight: 0.2,
    }),
    fact('dialogue.graduation', {
      requiredTargetCount: expectations.length,
      maxActiveMisconceptions: 0,
      maxTurns: 25,
    }),
    ...expectations.map((expectation) => fact('kcGraph.node', {
      clusterKC: expectation.clusterKC,
      description: expectation.text,
      centrality: 0,
    })),
  ];
  const productionRules = createSparcProgressiveScaffoldingRules();
  const display: SparcTrialDisplay = {
    type: 'sparc',
    schema: 'tutorscript-sparc/2.0',
    unitType: 'sparc-autotutor-dialogue',
    nodes: [{
      id: INPUT_NODE_ID,
      nodeType: 'atomic',
      atomType: 'text-input',
    }],
    clusterTargets: expectations.map((expectation, clusterIndex) => ({
      clusterIndex,
      clusterKC: expectation.clusterKC,
    })),
    workingMemoryFacts,
    productionRules: [...productionRules],
    instructionalController: {
      adapterId: 'sparc-autotutor-v1',
      policyId: 'progressive-scaffolding-v1',
      policyVersion: 1,
      parameters: {
        minimumProgress: 0.3,
        progressResponse: 'deescalate',
        nonAddressingResponse: 'hold',
        postAssertionResponse: 'cycle-to-pump',
      },
    },
    autoTutorTargets: { expectations, misconceptions },
  };
  const document: SparcAuthoredDocument = {
    id: PAGE_KEY,
    schemaVersion: 2,
    instructionalController: display.instructionalController as NonNullable<SparcAuthoredDocument['instructionalController']>,
    clusterTargets: expectations.map((expectation, clusterIndex) => ({
      clusterIndex,
      clusterKC: expectation.clusterKC,
      stimuliSetId: `sparc:${expectation.clusterKC}`,
      stimulusKC: expectation.clusterKC,
      KCId: expectation.clusterKC,
      KCDefault: expectation.clusterKC,
      KCCluster: expectation.clusterKC,
    })),
    autoTutorTargets: { expectations, misconceptions },
    workingMemoryFacts,
    productionRules,
    root: {
      id: 'root',
      kind: 'document',
      children: [{ id: INPUT_NODE_ID, kind: 'input' }],
    },
  };
  return { display, document };
}

function completionFromFacts(facts: readonly SparcWorkingMemoryFact[]): boolean {
  return facts
    .filter((entry) => entry.factType === 'controller.completionState')
    .at(-1)?.slots?.completed === true;
}

function traceText(turns: readonly SparcCompoundInterestLiveEvaluationTurn[]): string {
  return turns.map((turn) => (
    `${turn.turn}:${turn.action ?? 'unknown'}:${turn.targetType ?? 'unknown'}:${turn.targetId ?? 'unknown'}`
  )).join(' -> ');
}

function requiredStringSlot(fact: SparcWorkingMemoryFact, slot: string): string {
  const value = fact.slots?.[slot];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`SPARC live evaluation ${fact.factType}.${slot} must be a non-blank string`);
  }
  return value;
}

function requiredUnitScoreSlot(fact: SparcWorkingMemoryFact, slot: string): number {
  const value = fact.slots?.[slot];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SPARC live evaluation ${fact.factType}.${slot} must be a number from 0 to 1`);
  }
  return value;
}

function effectiveScoringStateFromFacts(
  facts: readonly SparcWorkingMemoryFact[],
): SparcCompoundInterestLiveEvaluationTurn['effectiveScoringState'] {
  return {
    learningTargetScores: facts
      .filter((entry) => entry.factType === 'learningTarget.score')
      .map((entry) => ({
        clusterKC: requiredStringSlot(entry, 'clusterKC'),
        coverage: requiredUnitScoreSlot(entry, 'coverage'),
      })),
    diagnosticMisconceptionScores: facts
      .filter((entry) => entry.factType === 'diagnostic.misconceptionScore')
      .map((entry) => ({
        id: requiredStringSlot(entry, 'id'),
        supportStrength: requiredUnitScoreSlot(entry, 'supportStrength'),
      })),
  };
}

function misconceptionSupportStrengthFromTurn(
  turn: SparcCompoundInterestLiveEvaluationTurn,
  misconceptionId: string,
): number | undefined {
  return turn.effectiveScoringState.diagnosticMisconceptionScores
    .find((score) => score.id === misconceptionId)?.supportStrength;
}

function finalMisconceptionSupportStrengths(
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[],
): Readonly<Record<MisconceptionId, number>> {
  const finalTurn = turns.at(-1);
  return {
    M1: finalTurn ? misconceptionSupportStrengthFromTurn(finalTurn, 'M1') ?? 0 : 0,
    M2: finalTurn ? misconceptionSupportStrengthFromTurn(finalTurn, 'M2') ?? 0 : 0,
    M3: finalTurn ? misconceptionSupportStrengthFromTurn(finalTurn, 'M3') ?? 0 : 0,
  };
}

function runRobustnessChecks(
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[],
): readonly SparcCompoundInterestLiveEvaluationCheck[] {
  const turn2 = turns.find((turn) => turn.turn === 2);
  const turn4 = turns.find((turn) => turn.turn === 4);
  const exactTranscriptTurns = turns.filter((turn) => turn.phase === 'exact-transcript');
  const turn6OrEarlierCompletion = exactTranscriptTurns.find((turn) => turn.turn === 6)
    ?? exactTranscriptTurns.at(-1);
  const turn6M1SupportStrength = turn6OrEarlierCompletion
    ? misconceptionSupportStrengthFromTurn(turn6OrEarlierCompletion, 'M1')
    : undefined;
  const synthesisTurn = turns.find((turn) => turn.phase === 'graduation-synthesis');
  const synthesisE4Evidence = synthesisTurn?.evidenceEnvelope.learningTargetEvaluations
    .find((evaluation) => evaluation.clusterKC === E4_ID);
  const turn2M2SupportStrength = turn2
    ? misconceptionSupportStrengthFromTurn(turn2, 'M2')
    : undefined;
  const unsupportedM3Turns = turns
    .filter((turn) => turn.evidenceEnvelope.diagnosticMisconceptionEvaluations
      .some((evaluation) => evaluation.id === 'M3'
        && evaluation.evidenceDirection === 'supports'
        && evaluation.evidenceStrength > 0))
    .map((turn) => turn.turn);
  const earlyE4FalseSupport = turns
    .filter((turn) => turn.phase === 'exact-transcript' && turn.turn <= 3)
    .flatMap((turn) => turn.evidenceEnvelope.learningTargetEvaluations
      .filter((evaluation) => evaluation.clusterKC === E4_ID
        && evaluation.evidenceDirection === 'supports'
        && evaluation.evidenceStrength > 0)
      .map((evaluation) => ({ turn: turn.turn, strength: evaluation.evidenceStrength })));
  return [{
    id: 'turn-2-on-task',
    passed: turn2 !== undefined
      && turn2.learnerResponseScore.learnerContribution?.type !== 'off-task',
    message: `Turn 2 contribution type was ${turn2?.learnerResponseScore.learnerContribution?.type ?? 'missing'}.`,
  }, {
    id: 'early-incorrect-responses-do-not-support-e4',
    passed: earlyE4FalseSupport.length === 0,
    message: earlyE4FalseSupport.length === 0
      ? 'The incorrect fixed-dollar and original-principal responses on turns 1-3 did not support E4.'
      : `E4 received false support from incorrect early response(s): ${earlyE4FalseSupport.map((entry) => `turn ${entry.turn} at strength ${entry.strength}`).join(', ')}.`,
  }, {
    id: 'turn-6-m1-inactive',
    passed: turn6M1SupportStrength !== undefined
      && turn6M1SupportStrength < MISCONCEPTION_ACTIVATION_THRESHOLD,
    message: turn6M1SupportStrength === undefined
      ? 'Effective M1 support strength was unavailable at the end of the exact transcript.'
      : `Effective M1 support strength after exact-transcript turn ${turn6OrEarlierCompletion?.turn ?? 'missing'} was ${turn6M1SupportStrength}; inactive requires less than ${MISCONCEPTION_ACTIVATION_THRESHOLD}.`,
  }, {
    id: 'turn-2-m2-remains-active',
    passed: turn2M2SupportStrength !== undefined && turn2M2SupportStrength >= 0.2,
    message: `Effective M2 support strength after turn 2 was ${turn2M2SupportStrength ?? 'missing'}.`,
  }, {
    id: 'synthesis-e4-recognized',
    passed: synthesisTurn === undefined
      || (synthesisE4Evidence?.evidenceDirection === 'supports'
        && synthesisE4Evidence.evidenceStrength >= COVERAGE_THRESHOLD),
    message: synthesisTurn === undefined
      ? 'The exact transcript completed, so no graduation synthesis required E4 evaluation.'
      : `Graduation-synthesis E4 evidence was ${synthesisE4Evidence?.evidenceDirection ?? 'missing'} at strength ${synthesisE4Evidence?.evidenceStrength ?? 'missing'}; recognition requires supports at strength ${COVERAGE_THRESHOLD} or greater.`,
  }, {
    id: 'turn-4-coherent-contribution',
    passed: turn4?.learnerResponseScore.learnerContribution?.type === 'answer'
      || (turn4?.learnerResponseScore.learnerContribution?.type === 'question'
        && turn4.learnerResponseScore.learnerQuestion?.contentFocused === true),
    message: `Turn 4 contribution type was ${turn4?.learnerResponseScore.learnerContribution?.type ?? 'missing'}${turn4?.learnerResponseScore.learnerContribution?.type === 'question' ? ` with contentFocused ${String(turn4.learnerResponseScore.learnerQuestion?.contentFocused)}` : ''}.`,
  }, {
    id: 'unsupported-m3-not-inferred',
    passed: unsupportedM3Turns.length === 0,
    message: unsupportedM3Turns.length === 0
      ? 'The transcript did not activate the unexpressed compounding-frequency misconception.'
      : `The unexpressed compounding-frequency misconception received positive support strength on turn(s) ${unsupportedM3Turns.join(', ')}.`,
  }, {
    id: 'turn-2-latest-response-receipt',
    passed: turn2 !== undefined
      && !turn2.tutorText.toLowerCase().includes('gain $50 each year'),
    message: turn2?.tutorText.toLowerCase().includes('gain $50 each year')
      ? 'Turn 2 tutor text reused the prior learner response as its receipt.'
      : 'Turn 2 tutor text did not reuse the prior learner response as its receipt.',
  }];
}

function rateLimitError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { error?: unknown; message?: unknown };
  return candidate.error === 'too-many-requests'
    || (typeof candidate.message === 'string' && candidate.message.includes('Too many requests'));
}

type SparcLiveEvaluationProvider = Pick<
  ReturnType<typeof createSparcDialogueOpenRouterProvider>,
  'scoreLearnerResponse' | 'generateTutorUtterance'
>;
type SparcLearnerResponseScoringTraceObserver = (
  event: SparcDialogueLearnerResponseScoringTraceEvent,
) => void;

async function getConfiguredOpenRouterCapability(): Promise<OpenRouterCapability> {
  const { Meteor } = await import('meteor/meteor');
  if (typeof Meteor.callAsync !== 'function') {
    throw new Error('SPARC live evaluation requires Meteor.callAsync');
  }
  return Meteor.callAsync('getAdminTestOpenRouterCapability') as Promise<OpenRouterCapability>;
}

const callAdminTestResolvedOpenRouterJson: CallResolvedOpenRouterJson = async (params) => {
  const { Meteor } = await import('meteor/meteor');
  if (typeof Meteor.callAsync !== 'function') {
    throw new Error('SPARC live evaluation requires Meteor.callAsync');
  }
  return Meteor.callAsync('callAdminTestResolvedOpenRouterJson', params);
};

async function runOnce(
  run: number,
  createProvider: (
    onLearnerResponseScoringTrace: SparcLearnerResponseScoringTraceObserver,
  ) => SparcLiveEvaluationProvider,
): Promise<SparcCompoundInterestLiveEvaluationRun> {
  let currentProviderResponseRecorded = false;
  let currentProviderParsedContent: unknown;
  let currentEvidenceEnvelope: SparcLearnerResponseEvidenceEnvelope | undefined;
  let currentResponseEvaluation: SparcDialogueLearnerResponseEvaluation | undefined;
  const onLearnerResponseScoringTrace = (traceEvent: SparcDialogueLearnerResponseScoringTraceEvent) => {
    if (traceEvent.stage === 'provider-response') {
      if (currentProviderResponseRecorded) {
        throw new Error('SPARC live evaluation provider recorded more than one provider response for a learner turn');
      }
      currentProviderResponseRecorded = true;
      currentProviderParsedContent = traceEvent.parsedContent;
      return;
    }
    if (traceEvent.stage === 'evidence-parsed') {
      if (currentEvidenceEnvelope) {
        throw new Error('SPARC live evaluation provider parsed more than one evidence envelope for a learner turn');
      }
      currentEvidenceEnvelope = traceEvent.evidenceEnvelope;
      return;
    }
    if (currentResponseEvaluation) {
      throw new Error('SPARC live evaluation provider completed more than one learner-response evaluation for a learner turn');
    }
    currentResponseEvaluation = traceEvent.evaluation;
  };
  let replayState = createEmptySparcReplayState();
  const turns: SparcCompoundInterestLiveEvaluationTurn[] = [];
  let evaluationDiagnostic: SparcCompoundInterestLiveEvaluationDiagnostic | undefined;

  try {
    const { display, document } = createFixture();
    const provider = createProvider(onLearnerResponseScoringTrace);
    async function evaluateLearnerTurn(
      learnerText: string,
      phase: SparcCompoundInterestLiveEvaluationTurn['phase'],
    ): Promise<boolean> {
      const turn = turns.length + 1;
      const timestamp = Date.now() + turn;
      const event: SparcInterfaceEvent = {
        eventId: `${PAGE_KEY}:run-${run}:turn-${turn}`,
        type: 'response-submitted',
        source: { pageKey: PAGE_KEY, nodeId: INPUT_NODE_ID },
        time: timestamp,
        payload: { input: learnerText },
      };
      const result: SparcTrialResult = {
        submittedNodes: { [INPUT_NODE_ID]: learnerText },
        timestamp,
      };
      currentProviderResponseRecorded = false;
      currentProviderParsedContent = undefined;
      currentEvidenceEnvelope = undefined;
      currentResponseEvaluation = undefined;
      let learnerResponseScore: SparcLearnerResponseScoringResult;
      try {
        learnerResponseScore = await provider.scoreLearnerResponse({
          document,
          display,
          result,
          event,
          problemStatement: PROBLEM_STATEMENT,
          learnerText,
          replayState,
        });
        if (!currentResponseEvaluation) {
          throw new Error('SPARC live evaluation provider did not record the completed learner-response evaluation');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        evaluationDiagnostic = {
          stage: currentEvidenceEnvelope
            ? 'scoring-evidence-validation'
            : currentProviderResponseRecorded
              ? 'scoring-response-parse'
              : 'scoring-provider',
          message,
          attemptedTurn: {
            turn,
            phase,
            learnerText,
            ...(currentProviderResponseRecorded
              ? { providerParsedContent: currentProviderParsedContent }
              : {}),
            ...(currentEvidenceEnvelope ? { evidenceEnvelope: currentEvidenceEnvelope } : {}),
          },
        };
        throw error;
      }
      const { evidenceEnvelope } = currentResponseEvaluation;
      let dialogueTurn: Awaited<ReturnType<typeof evaluateSparcControllerDialogueTurn>>;
      try {
        dialogueTurn = await evaluateSparcControllerDialogueTurn({
          document,
          replayState,
          event,
          problemStatement: PROBLEM_STATEMENT,
          learnerResponseScore,
          generateTutorUtterance: provider.generateTutorUtterance,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        evaluationDiagnostic = {
          stage: 'dialogue-turn',
          message,
          attemptedTurn: {
            turn,
            phase,
            learnerText,
            ...(currentProviderResponseRecorded
              ? { providerParsedContent: currentProviderParsedContent }
              : {}),
            evidenceEnvelope,
          },
        };
        throw error;
      }
      const completed = completionFromFacts(dialogueTurn.planning.derivedFacts);
      turns.push({
        turn,
        phase,
        learnerText,
        evidenceEnvelope,
        learnerResponseScore,
        effectiveScoringState: effectiveScoringStateFromFacts(
          dialogueTurn.learnerResponseScoreFacts,
        ),
        tutorText: dialogueTurn.tutorText,
        ...(dialogueTurn.moveSelectionAudit.selected?.ruleId
          ? { productionRuleId: dialogueTurn.moveSelectionAudit.selected.ruleId }
          : {}),
        action: dialogueTurn.utteranceRequest.action,
        targetType: dialogueTurn.utteranceRequest.targetType,
        targetId: dialogueTurn.utteranceRequest.targetId,
        completed,
      });
      replayState = applySparcStateTransition(replayState, dialogueTurn.transition);
      return completed;
    }

    for (const learnerText of SPARC_COMPOUND_INTEREST_LIVE_EVALUATION_INPUTS) {
      if (await evaluateLearnerTurn(learnerText, 'exact-transcript')) {
        break;
      }
    }

    const exactFinalTurn = turns.at(-1);
    const exactTranscriptCompleted = exactFinalTurn?.completed === true;
    if (!exactTranscriptCompleted) {
      await evaluateLearnerTurn(GRADUATION_SYNTHESIS, 'graduation-synthesis');
    }
    const checks = runRobustnessChecks(turns);
    const robustnessPassed = checks.every((check) => check.passed);
    const finalTurn = turns.at(-1);
    const graduationPassed = finalTurn?.completed === true
      && finalTurn.action === 'summary'
      && finalTurn.targetType === 'completion';
    const allRequirementsPassed = robustnessPassed && graduationPassed;
    const failedCheckIds = checks.filter((check) => !check.passed).map((check) => check.id);
    const misconceptionSupportStrengths = finalMisconceptionSupportStrengths(turns);
    return {
      run,
      overallOutcome: allRequirementsPassed
        ? 'all-requirements-passed'
        : 'requirements-failed',
      allRequirementsPassed,
      studentOutcome: graduationPassed ? 'graduated' : 'not-graduated',
      robustnessOutcome: robustnessPassed ? 'passed' : 'failed',
      robustnessPassed,
      graduationPassed,
      failedRobustnessCheckIds: failedCheckIds,
      finalMisconceptionSupportStrengths: misconceptionSupportStrengths,
      exactTranscriptCompleted,
      checks,
      turns,
      message: `Student ${graduationPassed ? 'graduated' : 'did not graduate'}; robustness ${robustnessPassed ? 'passed' : `failed (${failedCheckIds.join(', ')})`}; exact transcript ${exactTranscriptCompleted ? 'completed' : 'required synthesis'}. Final misconception support strengths M1=${misconceptionSupportStrengths.M1}, M2=${misconceptionSupportStrengths.M2}, M3=${misconceptionSupportStrengths.M3}. Final move ${finalTurn?.action ?? 'unknown'} for ${finalTurn?.targetType ?? 'unknown'}:${finalTurn?.targetId ?? 'unknown'}. Trace: ${traceText(turns)}`,
    };
  } catch (error) {
    const notRun = rateLimitError(error);
    const message = error instanceof Error ? error.message : String(error);
    const recordedEvaluationDiagnostic = evaluationDiagnostic ?? {
      stage: 'evaluation-run' as const,
      message,
    };
    return {
      run,
      overallOutcome: notRun ? 'not-run' : 'evaluation-error',
      allRequirementsPassed: false,
      studentOutcome: 'not-evaluated',
      robustnessOutcome: 'not-evaluated',
      robustnessPassed: false,
      graduationPassed: false,
      failedRobustnessCheckIds: [],
      finalMisconceptionSupportStrengths: finalMisconceptionSupportStrengths(turns),
      exactTranscriptCompleted: false,
      checks: [],
      turns,
      evaluationDiagnostic: recordedEvaluationDiagnostic,
      message: `${notRun ? `Evaluation not run during ${recordedEvaluationDiagnostic.stage}` : `Evaluation error during ${recordedEvaluationDiagnostic.stage}`}: ${message}${turns.length > 0 ? ` Trace: ${traceText(turns)}` : ''}`,
    };
  }
}

export async function runSparcCompoundInterestLiveEvaluation(options: {
  readonly totalRuns?: number;
  readonly requiredPassRate?: number;
  readonly createProvider?: (
    onLearnerResponseScoringTrace: SparcLearnerResponseScoringTraceObserver,
  ) => SparcLiveEvaluationProvider;
  readonly getCapability?: () => Promise<OpenRouterCapability>;
} = {}): Promise<SparcCompoundInterestLiveEvaluationResult> {
  const totalRuns = options.totalRuns ?? 5;
  const requiredPassRate = options.requiredPassRate ?? 0.8;
  if (!Number.isInteger(totalRuns) || totalRuns < 1) {
    throw new Error('SPARC live evaluation totalRuns must be a positive integer.');
  }
  if (!Number.isFinite(requiredPassRate) || requiredPassRate < 0 || requiredPassRate > 1) {
    throw new Error('SPARC live evaluation requiredPassRate must be between 0 and 1.');
  }

  const runs: SparcCompoundInterestLiveEvaluationRun[] = [];
  const capability = await (options.getCapability ?? getConfiguredOpenRouterCapability)();
  if (!capability.configured || !capability.model) {
    throw new Error('SPARC live evaluation requires a configured OpenRouter model and API key.');
  }
  for (let run = 1; run <= totalRuns; run += 1) {
    const result = await runOnce(
      run,
      options.createProvider ?? ((onLearnerResponseScoringTrace) => createSparcDialogueOpenRouterProvider({
        callResolvedOpenRouterJson: callAdminTestResolvedOpenRouterJson,
        onLearnerResponseScoringTrace,
      })),
    );
    runs.push(result);
    if (result.overallOutcome === 'not-run') {
      for (let skippedRun = run + 1; skippedRun <= totalRuns; skippedRun += 1) {
        runs.push({
          run: skippedRun,
          overallOutcome: 'not-run',
          allRequirementsPassed: false,
          studentOutcome: 'not-evaluated',
          robustnessOutcome: 'not-evaluated',
          robustnessPassed: false,
          graduationPassed: false,
          failedRobustnessCheckIds: [],
          finalMisconceptionSupportStrengths: { M1: 0, M2: 0, M3: 0 },
          exactTranscriptCompleted: false,
          checks: [],
          turns: [],
          message: 'Not attempted because the live provider rate-limited the preceding run.',
        });
      }
      break;
    }
  }
  const allRequirementsPassedRuns = runs.filter((run) => run.allRequirementsPassed).length;
  const robustnessPassedRuns = runs.filter((run) => run.robustnessPassed).length;
  const graduationPassedRuns = runs.filter((run) => run.graduationPassed).length;
  const evaluatedRuns = runs.filter((run) => run.overallOutcome === 'all-requirements-passed'
    || run.overallOutcome === 'requirements-failed').length;
  const evaluationErrorRuns = runs.filter((run) => run.overallOutcome === 'evaluation-error').length;
  const notRunRuns = runs.filter((run) => run.overallOutcome === 'not-run').length;
  const passRate = evaluatedRuns > 0 ? graduationPassedRuns / evaluatedRuns : null;
  const evaluationRequirementMet = evaluatedRuns === totalRuns;
  const robustnessRequirementMet = evaluatedRuns > 0
    && robustnessPassedRuns === evaluatedRuns;
  const requiredGraduationRuns = Math.ceil(totalRuns * requiredPassRate);
  const graduationRequirementMet = graduationPassedRuns >= requiredGraduationRuns;
  const result: SparcCompoundInterestLiveEvaluationResult = {
    ok: evaluationRequirementMet && robustnessRequirementMet && graduationRequirementMet,
    generatedAt: new Date().toISOString(),
    model: capability.model,
    modelSource: capability.source,
    reasoningLevel: capability.reasoningLevel,
    problemStatement: PROBLEM_STATEMENT,
    requiredPassRate,
    requiredGraduationRuns,
    passRate,
    allRequirementsPassedRuns,
    robustnessPassedRuns,
    graduationPassedRuns,
    evaluatedRuns,
    evaluationErrorRuns,
    notRunRuns,
    totalRuns,
    evaluationRequirementMet,
    robustnessRequirementMet,
    graduationRequirementMet,
    runs,
  };
  globalThis.localStorage?.setItem(
    'mofacts.adminTests.sparcCompoundInterestLiveEvaluation.latest',
    JSON.stringify(result, null, 2),
  );
  return result;
}
