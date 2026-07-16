import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import { evaluateSparcControllerDialogueTurn } from '../../../../../../learning-components/units/sparcsession/sparcControllerDialogueTurn';
import { createSparcProgressiveScaffoldingRules } from '../../../../../../learning-components/units/sparcsession/sparcProgressiveScaffoldingRules';
import type { SparcLearnerResponseScoringResult } from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
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
} from './sparcControllerDialogueOpenRouter';
import type { OpenRouterCapability } from '../../../../lib/openRouterClientProfile';

const PAGE_KEY = 'sparc-session-compound-interest-live-evaluation';
const INPUT_NODE_ID = 'learner-response-input';
type MisconceptionId = 'M1' | 'M2' | 'M3';
const PROBLEM_STATEMENT = 'Suppose $1,000 earns 5% interest each year and the interest is left in the account. In your own words, how does compound interest make the balance grow over time?';
const GRADUATION_SYNTHESIS = 'Each year the current balance is multiplied by 1.05. Unlike calculating interest only from the original $1,000, compound interest uses the updated balance, so the dollar amount of interest increases over time.';

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
  learnerResponseScore: SparcLearnerResponseScoringResult;
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

export type SparcCompoundInterestLiveEvaluationRun = Readonly<{
  run: number;
  overallOutcome: 'all-requirements-passed' | 'requirements-failed' | 'not-run';
  allRequirementsPassed: boolean;
  studentOutcome: 'graduated' | 'not-graduated' | 'not-run';
  robustnessOutcome: 'passed' | 'failed' | 'not-evaluated';
  robustnessPassed: boolean;
  graduationPassed: boolean;
  failedRobustnessCheckIds: readonly string[];
  finalMisconceptionSupportStrengths: Readonly<Record<MisconceptionId, number>>;
  exactTranscriptCompleted: boolean;
  checks: readonly SparcCompoundInterestLiveEvaluationCheck[];
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[];
  message: string;
}>;

export type SparcCompoundInterestLiveEvaluationResult = Readonly<{
  ok: boolean;
  generatedAt: string;
  model: string;
  modelSource: 'tdf' | 'user' | 'admin' | null;
  problemStatement: string;
  requiredPassRate: number;
  passRate: number;
  allRequirementsPassedRuns: number;
  robustnessPassedRuns: number;
  graduationPassedRuns: number;
  completedRuns: number;
  notRunRuns: number;
  totalRuns: number;
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
      coverageThreshold: 0.8,
    }),
    fact('controller.targetSelectionPolicy', {
      policy: 'kc-graph-priority',
      coverageThreshold: 0.8,
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

function effectiveMisconceptionSupportStrength(
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[],
  misconceptionId: string,
): number {
  let supportStrength = 0;
  for (const turn of turns) {
    const update = turn.learnerResponseScore.diagnosticMisconceptionScores
      ?.find((score) => score.id === misconceptionId);
    if (update) {
      supportStrength = update.supportStrength;
    }
  }
  return supportStrength;
}

function finalMisconceptionSupportStrengths(
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[],
): Readonly<Record<MisconceptionId, number>> {
  return {
    M1: effectiveMisconceptionSupportStrength(turns, 'M1'),
    M2: effectiveMisconceptionSupportStrength(turns, 'M2'),
    M3: effectiveMisconceptionSupportStrength(turns, 'M3'),
  };
}

function runRobustnessChecks(
  turns: readonly SparcCompoundInterestLiveEvaluationTurn[],
): readonly SparcCompoundInterestLiveEvaluationCheck[] {
  const turn2 = turns.find((turn) => turn.turn === 2);
  const turn4 = turns.find((turn) => turn.turn === 4);
  const turn2M2SupportStrength = effectiveMisconceptionSupportStrength(
    turns.filter((turn) => turn.turn <= 2),
    'M2',
  );
  const unsupportedM3Turns = turns
    .filter((turn) => turn.learnerResponseScore.diagnosticMisconceptionScores
      ?.some((score) => score.id === 'M3' && score.supportStrength > 0))
    .map((turn) => turn.turn);
  return [{
    id: 'turn-2-on-task',
    passed: turn2 !== undefined
      && turn2.learnerResponseScore.learnerContribution?.type !== 'off-task',
    message: `Turn 2 contribution type was ${turn2?.learnerResponseScore.learnerContribution?.type ?? 'missing'}.`,
  }, {
    id: 'turn-2-m2-remains-active',
    passed: turn2M2SupportStrength >= 0.2,
    message: `Effective M2 support strength after turn 2 was ${turn2M2SupportStrength}.`,
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

type SparcLiveEvaluationProvider = ReturnType<typeof createSparcDialogueOpenRouterProvider>;

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
  createProvider: () => SparcLiveEvaluationProvider,
): Promise<SparcCompoundInterestLiveEvaluationRun> {
  const { display, document } = createFixture();
  const provider = createProvider();
  let replayState = createEmptySparcReplayState();
  const turns: SparcCompoundInterestLiveEvaluationTurn[] = [];

  try {
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
      const learnerResponseScore = await provider.scoreLearnerResponse({
        document,
        display,
        result,
        event,
        problemStatement: PROBLEM_STATEMENT,
        learnerText,
        replayState,
      });
      const dialogueTurn = await evaluateSparcControllerDialogueTurn({
        document,
        replayState,
        event,
        problemStatement: PROBLEM_STATEMENT,
        learnerResponseScore,
        generateTutorUtterance: provider.generateTutorUtterance,
      });
      const completed = completionFromFacts(dialogueTurn.planning.derivedFacts);
      turns.push({
        turn,
        phase,
        learnerText,
        learnerResponseScore,
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
    return {
      run,
      overallOutcome: notRun ? 'not-run' : 'requirements-failed',
      allRequirementsPassed: false,
      studentOutcome: notRun ? 'not-run' : 'not-graduated',
      robustnessOutcome: 'not-evaluated',
      robustnessPassed: false,
      graduationPassed: false,
      failedRobustnessCheckIds: [],
      finalMisconceptionSupportStrengths: finalMisconceptionSupportStrengths(turns),
      exactTranscriptCompleted: false,
      checks: [],
      turns,
      message: `${error instanceof Error ? error.message : String(error)}${turns.length > 0 ? ` Trace: ${traceText(turns)}` : ''}`,
    };
  }
}

export async function runSparcCompoundInterestLiveEvaluation(options: {
  readonly totalRuns?: number;
  readonly requiredPassRate?: number;
  readonly createProvider?: () => SparcLiveEvaluationProvider;
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
      options.createProvider ?? (() => createSparcDialogueOpenRouterProvider({
        callResolvedOpenRouterJson: callAdminTestResolvedOpenRouterJson,
      })),
    );
    runs.push(result);
    if (result.overallOutcome === 'not-run') {
      for (let skippedRun = run + 1; skippedRun <= totalRuns; skippedRun += 1) {
        runs.push({
          run: skippedRun,
          overallOutcome: 'not-run',
          allRequirementsPassed: false,
          studentOutcome: 'not-run',
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
  const completedRuns = runs.filter((run) => run.overallOutcome !== 'not-run').length;
  const notRunRuns = totalRuns - completedRuns;
  const passRate = completedRuns > 0 ? graduationPassedRuns / completedRuns : 0;
  const robustnessRequirementMet = completedRuns === totalRuns
    && robustnessPassedRuns === totalRuns;
  const graduationRequirementMet = completedRuns === totalRuns
    && passRate >= requiredPassRate;
  const result: SparcCompoundInterestLiveEvaluationResult = {
    ok: robustnessRequirementMet && graduationRequirementMet,
    generatedAt: new Date().toISOString(),
    model: capability.model,
    modelSource: capability.source,
    problemStatement: PROBLEM_STATEMENT,
    requiredPassRate,
    passRate,
    allRequirementsPassedRuns,
    robustnessPassedRuns,
    graduationPassedRuns,
    completedRuns,
    notRunRuns,
    totalRuns,
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
