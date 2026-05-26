import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import {
  AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA,
  AUTO_TUTOR_UTTERANCE_ENVELOPE_SCHEMA,
  parseAutoTutorScoreEnvelope,
  parseAutoTutorUtteranceEnvelope,
  type AutoTutorScoreEnvelope,
  type AutoTutorUtteranceEnvelope,
} from '../../../../../common/lib/autoTutorContract';
import {
  createInitialAutoTutorPlannerState,
  planAutoTutorTurn,
  preserveDurableExpectationCoverage,
  preserveRepairedMisconceptionState,
  recomputeExpectationPriorities,
  validatePlannerState,
  type AutoTutorLearnerContributionScore,
  type AutoTutorMove,
  type AutoTutorPlan,
  type AutoTutorPlannerState,
} from '../../../../../common/lib/autoTutorPlanner';
import { getStimCluster } from '../../../../lib/currentTestingHelpers';
import { clientConsole } from '../../../../lib/clientLogger';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { legacyTrim } from '../../../../../common/underscoreCompat';
import type {
  AutoTutorCompressedHistoryRecord,
  AutoTutorHistoryTurn,
  AutoTutorRuntimeCapabilities,
} from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeCapabilities';
import {
  applyAutoTutorEndReason,
  getAutoTutorHistoryAction,
  isAutoTutorEndReason,
  type AutoTutorEndReason,
} from '../../../../../../learning-components/units/autotutor/AutoTutorEndState';

const OPEN_ROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AUTO_TUTOR_COST_CAP_USD = 0.20;
const AUTO_TUTOR_LEARNER_CONTRIBUTION_TYPES = new Set([
  'assertion',
  'idk',
  'help_request',
  'uncertainty',
  'affect',
  'meta',
  'question',
  'off_task',
]);
type AutoTutorExpectation = {
  id: string;
  label?: string;
  proposition: string;
  acceptableVariants?: string[];
  commonPartialAnswers?: string[];
  hints?: string[];
  prompts?: Array<{ stem?: string; target?: string }>;
  assertion: string;
};

type AutoTutorMisconception = {
  id: string;
  label?: string;
  misconception: string;
  detectionCues?: string[];
  contrastWithExpectations?: string[];
  correction: string;
  repairQuestion: string;
};

type AutoTutorScript = {
  id: string;
  topic: string;
  learningGoal: string;
  idealAnswer: string;
  expectations: AutoTutorExpectation[];
  misconceptions?: AutoTutorMisconception[];
  dialogPolicy: Record<string, unknown>;
  summary: string;
};

type AutoTutorGraduation = {
  requiredExpectationCount: number;
  maxActiveMisconceptions: number;
};

type AutoTutorTurnLimit = {
  maxTurns: number;
};

type AutoTutorConfig = {
  apiKey: string;
  model: string;
  graduation: AutoTutorGraduation;
  turnLimit: AutoTutorTurnLimit;
  requireFinalAnswerPrompt: boolean;
  prompt: string;
  script: AutoTutorScript;
  unitName: string;
  clusterIndex: number;
};

type AutoTutorState = {
  expectations: AutoTutorPlannerState['expectationScores'];
  misconceptions: AutoTutorPlannerState['misconceptionScores'];
  planner: AutoTutorPlannerState;
  answerQuality: 'low' | 'partial' | 'high' | 'none';
  learnerContribution: AutoTutorLearnerContributionScore | null;
  studentAskedQuestion: boolean;
  selectedMove: AutoTutorMove | '';
  turnCount: number;
  costUsd: number;
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
  stoppedByCost: boolean;
  dialogue: Array<{ role: 'student' | 'tutor'; text: string }>;
};

export type AutoTutorProgressCounts = {
  coveredExpectations: number;
  requiredExpectations: number;
  neededExpectations: number;
  activeMisconceptions: number;
  totalMisconceptions: number;
  maxActiveMisconceptions: number;
};

export type AutoTutorRuntime = {
  config: AutoTutorConfig;
  getState: () => AutoTutorState;
  getProgress: () => number;
  getProgressCounts: () => AutoTutorProgressCounts;
  getDialogue: () => AutoTutorState['dialogue'];
  submitStudentAnswer: (studentAnswer: string) => Promise<{
    message: string;
    completed: boolean;
    mastered: boolean;
    endReason: AutoTutorEndReason;
    stoppedByCost: boolean;
  }>;
};

type AutoTutorHistoryNote = {
  kind: 'autotutor';
  model: string;
  scriptId: string;
  state: ReturnType<typeof summarizeState>;
  progress: number;
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
  stoppedByCost: boolean;
  tutorMessage: string;
};

type AutoTutorHistoryRow = {
  time?: number;
  problemStartTime?: number;
  input?: string;
  responseValue?: string;
  feedbackText?: string;
  CFNote?: string;
};

function createMeteorAutoTutorRuntimeCapabilities(): AutoTutorRuntimeCapabilities {
  const capabilities: AutoTutorRuntimeCapabilities = {
    session: {
      getSessionValue(key: string) {
        return Session.get(key);
      },
      setSessionValue(key: string, value: unknown) {
        Session.set(key, value);
      },
      getAutoTutorSessionSnapshot() {
        const meteorUser = Meteor.user() as { username?: string; loginParams?: { entryPoint?: string } } | null;
        const currentUserId = Meteor.userId();
        const currentTdfId = requiredString(Session.get('currentTdfId'), 'currentTdfId');
        const currentTdfName = requiredString(Session.get('currentTdfName'), 'currentTdfName');
        const currentUnitNumber = Number(Session.get('currentUnitNumber'));
        if (!Number.isInteger(currentUnitNumber) || currentUnitNumber < 0) {
          throw new Error('AutoTutor runtime requires currentUnitNumber to be a non-negative integer');
        }
        return {
          ...(currentUserId ? { currentUserId } : {}),
          ...(meteorUser?.username ? { currentUsername: meteorUser.username } : {}),
          currentTdfId,
          currentTdfName,
          currentUnitNumber,
          currentTdfFile: Session.get('currentTdfFile'),
          currentTdfUnit: Session.get('currentTdfUnit'),
          sectionId: Session.get('curSectionId'),
          teacherId: Session.get('curTeacher')?._id,
          conditionName: Session.get('experimentXCond') || null,
          entryPoint: meteorUser?.loginParams?.entryPoint,
        };
      },
      publishAutoTutorState(state: unknown) {
        Session.set('autoTutorState', state);
      },
    },
    serverMethods: {
      async callMethod<T = unknown>(name: string, ...args: unknown[]) {
        return await meteorCallAsync(name, ...args) as T;
      },
      async getAutoTutorHistoryForUnit(userId: string, tdfId: string, unitNumber: number) {
        return await meteorCallAsync('getAutoTutorHistoryForUnit', userId, tdfId, unitNumber) as unknown[];
      },
    },
    stimuli: {
      getStimCluster(clusterIndex: number) {
        return getStimCluster(clusterIndex) as { clusterKC?: unknown; stims?: unknown[] } | null;
      },
    },
    history: {
      normalizeResult(result: unknown) {
        return result as AutoTutorHistoryTurn;
      },
      async writeResult(result: AutoTutorHistoryTurn) {
        await this.writeAutoTutorTurn(result);
      },
      async writeAutoTutorTurn(turn: AutoTutorHistoryTurn) {
        await insertAutoTutorHistoryTurn(turn.config as AutoTutorConfig, turn.state as AutoTutorState, {
          capabilities,
          studentAnswer: turn.studentAnswer,
          tutorMessage: turn.tutorMessage,
          turnStartedAt: turn.startedAt,
          turnEndedAt: turn.endedAt,
        });
      },
      async writeCompressedHistory(record: AutoTutorCompressedHistoryRecord) {
        await insertCompressedHistory(record);
      },
    },
    logger: {
      log(level: number, ...args: unknown[]) {
        clientConsole(level, '[AutoTutor]', ...args);
      },
    },
  };
  return capabilities;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AutoTutor runtime requires ${field}`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`AutoTutor runtime requires numeric ${field}`);
  }
  return parsed;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function redactSecrets(message: string): string {
  return message.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
}

function getTutorFromSession(capabilities: AutoTutorRuntimeCapabilities): Record<string, unknown> {
  const currentTdfFile = capabilities.session.getAutoTutorSessionSnapshot().currentTdfFile as {
    tdfs?: { tutor?: unknown };
  } | null | undefined;
  const tutor = currentTdfFile?.tdfs?.tutor;
  if (!isRecord(tutor)) {
    throw new Error('AutoTutor runtime requires currentTdfFile.tdfs.tutor in session capabilities');
  }
  return tutor;
}

function getCurrentUnit(capabilities: AutoTutorRuntimeCapabilities): Record<string, unknown> {
  const unit = capabilities.session.getAutoTutorSessionSnapshot().currentTdfUnit;
  if (!isRecord(unit)) {
    throw new Error('AutoTutor runtime requires currentTdfUnit in session capabilities');
  }
  if (!isRecord(unit.autotutorsession)) {
    throw new Error(`Unit "${String(unit.unitname || '<unnamed>')}" is not an AutoTutor session`);
  }
  return unit;
}

function readGraduation(session: Record<string, unknown>): AutoTutorGraduation {
  const graduation = session.graduation;
  if (!isRecord(graduation)) {
    throw new Error('AutoTutor runtime requires autotutorsession.graduation');
  }
  const requiredExpectationCount = requiredNumber(
    graduation.requiredExpectationCount,
    'autotutorsession.graduation.requiredExpectationCount',
  );
  if (!Number.isInteger(requiredExpectationCount) || requiredExpectationCount < 0) {
    throw new Error('AutoTutor runtime requires graduation.requiredExpectationCount to be a non-negative integer');
  }
  const maxActiveMisconceptions = requiredNumber(
    graduation.maxActiveMisconceptions,
    'autotutorsession.graduation.maxActiveMisconceptions',
  );
  if (!Number.isInteger(maxActiveMisconceptions) || maxActiveMisconceptions < 0) {
    throw new Error('AutoTutor runtime requires graduation.maxActiveMisconceptions to be a non-negative integer');
  }
  return {
    requiredExpectationCount,
    maxActiveMisconceptions,
  };
}

function readTurnLimit(session: Record<string, unknown>): AutoTutorTurnLimit {
  const maxTurns = requiredNumber(session.maxTurns, 'autotutorsession.maxTurns');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error('AutoTutor runtime requires autotutorsession.maxTurns to be a positive integer');
  }
  return {
    maxTurns,
  };
}

function readAutoTutorConfig(capabilities: AutoTutorRuntimeCapabilities): AutoTutorConfig {
  const tutor = getTutorFromSession(capabilities);
  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};
  const unit = getCurrentUnit(capabilities);
  const session = unit.autotutorsession as Record<string, unknown>;
  const clusterIndex = requiredNumber(session.cluster, 'autotutorsession.cluster');
  if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
    throw new Error('AutoTutor runtime requires autotutorsession.cluster to be a non-negative integer');
  }

  const cluster = capabilities.stimuli.getStimCluster(clusterIndex);
  const stim = cluster?.stims?.[0];
  if (!isRecord(stim)) {
    throw new Error(`AutoTutor runtime could not find first stim for cluster ${clusterIndex}`);
  }
  const script = stim.autoTutor;
  if (!isRecord(script)) {
    throw new Error(`AutoTutor cluster ${clusterIndex} first stim is missing autoTutor`);
  }
  const display = isRecord(stim.display) ? stim.display : {};

  return {
    apiKey: requiredString(setspec.openRouterApiKey, 'tutor.setspec.openRouterApiKey'),
    model: requiredString(session.openRouterModel || setspec.openRouterModel, 'openRouterModel'),
    graduation: readGraduation(session),
    turnLimit: readTurnLimit(session),
    requireFinalAnswerPrompt: session.requireFinalAnswerPrompt === true,
    prompt: requiredString(display.text, `cluster ${clusterIndex} display.text`),
    script: cloneJson(script as AutoTutorScript),
    unitName: typeof unit.unitname === 'string' ? unit.unitname : 'AutoTutor',
    clusterIndex,
  };
}

function createInitialState(script: AutoTutorScript): AutoTutorState {
  const planner = createInitialAutoTutorPlannerState(script);
  return {
    expectations: planner.expectationScores,
    misconceptions: planner.misconceptionScores,
    planner,
    answerQuality: 'none',
    learnerContribution: null,
    studentAskedQuestion: false,
    selectedMove: '',
    turnCount: 0,
    costUsd: 0,
    completed: false,
    mastered: false,
    endReason: 'in_progress',
    stoppedByCost: false,
    dialogue: [],
  };
}

function summarizeState(state: AutoTutorState) {
  return {
    expectations: state.expectations,
    misconceptions: state.misconceptions,
    planner: state.planner,
    answerQuality: state.answerQuality,
    learnerContribution: state.learnerContribution,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove,
    turnCount: state.turnCount,
    costUsd: state.costUsd,
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
  };
}

function buildScoringSystemPrompt(config: AutoTutorConfig): string {
  return [
    'You are the MoFaCTS AutoTutor semantic scorer for one learner.',
    'Score the latest learner answer against the authored AutoTutor script and role-preserving dialogue history.',
    'Only learner-generated text may count as expectation coverage. Tutor turns may provide context for short learner answers, but tutor hints, prompts, assertions, summaries, and corrections are not learner knowledge.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task rather than a substantive content claim, ignore that behavior for semantic scoring: do not mark any expectation covered, do not mark or strengthen any misconception, and do not reduce previously demonstrated expectation coverage.',
    'Classify whether the learner asked a substantive question and whether it is answerable from the provided authored lesson content or dialogue context.',
    'Classify the latest learner contribution as exactly one learnerContribution.type: assertion, idk, help_request, uncertainty, affect, meta, question, or off_task. Use assertion for substantive content claims or restatements. Use idk for "I do not know" or equivalent. Use help_request for requests for help, hints, or the answer. Use uncertainty for tentative or low-confidence content attempts. Use affect for frustration, confidence, boredom, or emotional comments. Use meta for comments about the task, interface, rules, progress, or procedure. Use question for substantive content questions. Use off_task for playful, abusive, irrelevant, or non-instructional turns.',
    'Set learnerContribution.confidence from 0 to 1 and provide brief evidence.',
    'When learnerContribution.type is question, set learnerQuestion.current true. For meta comments about procedure rather than lesson content, use learnerContribution.type meta and leave learnerQuestion.current false unless the learner also asks a substantive content question.',
    'Misconception repair is a first-class scoring decision. If the prior tutor state last selected a misconception target and the latest tutor turn asked its repair question or otherwise requested repair, score the latest learner answer first as a repair attempt for that misconception.',
    'A concise answer can repair a misconception when it directly answers the repair question or rejects the mistaken contrast, even if it does not cover a full expectation. For example, if the tutor asks whether an interval estimates individual scores or the population mean, "the population mean" repairs the individual-scores misconception.',
    'When the latest learner answer repairs a misconception, set that misconception to current false, confidence 0, repaired true, and explain the repair in repairEvidence. Do not carry forward a prior misconception solely because earlier dialogue showed it.',
    'For a previously repaired misconception, keep current false and confidence 0 unless the latest learner answer reintroduces that misconception. If it is reintroduced, set current true and repaired false.',
    'Assertion restatement is also a first-class scoring decision. If the prior tutor state shows an expectation was tutoredByAssertion and the latest tutor turn asked the learner to restate or apply that asserted idea, score the latest learner answer first as uptake of that expectation.',
    'A cooperative restatement or concrete application of the asserted idea counts as learner knowledge. When the latest learner answer adequately restates or applies the asserted expectation, set learnerRestatedAfterAssertion true and assign enough expectation coverage for that idea to count as learned, even if earlier learner attempts had low coverage.',
    'Do not let prior failures prevent a proper post-assertion restatement from counting. Prior dialogue may explain why the assertion was needed, but the latest learner answer is the fresh evidence for whether the asserted idea is now understood.',
    'Do not choose a dialogue target, choose a dialogue move, or write the tutor response.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA, null, 2),
    'Include every authored expectation ID under expectationScores and every authored misconception ID under misconceptionScores on every turn.',
    'Do not invent expectation or misconception IDs.',
    'Set expectation coverage from 0 to 1, provide brief evidence, and include missing elements when coverage is incomplete.',
    'Set misconception confidence from 0 to 1.',
    'Set coherence and centrality from 0 to 1. Set frontier equal to coverage. Set priority using frontierWeight 0.5, coherenceWeight 0.3, and centralityWeight 0.2; the app will recompute priority after validation.',
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function buildScoringUserPrompt(studentAnswer: string, state: AutoTutorState): string {
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Prior tutor state:',
    JSON.stringify(summarizeState(state), null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(state.dialogue, null, 2),
  ].join('\n');
}

function buildUtteranceSystemPrompt(config: AutoTutorConfig): string {
  return [
    'You are the MoFaCTS AutoTutor tutor voice for one learner.',
    'The application has already selected the tutorial target and dialogue move. You must not change them.',
    'Echo the selected targetType, targetId, and selectedMove exactly. If targetId is null, return null; do not invent a script ID or lesson ID.',
    'Use only the authored AutoTutor lesson content and the supplied dialogue context. For out-of-scope learner questions, state that this tutor can only answer from the lesson content, then continue with the selected move.',
    'Every non-summary move must keep the dialogue going with a concrete follow-up question to the learner.',
    'When the learner has made progress on or covered a prior expectation, briefly acknowledge that progress before continuing.',
    'Use learnerContribution metadata to shape tone without changing the selected plan. For idk or help_request, be supportive and give the selected hint, prompt, or assertion. For uncertainty, validate the tentative attempt briefly before continuing. For affect, briefly acknowledge the feeling without analyzing it, then continue the selected instructional move. For meta, answer the procedural concern briefly if possible, then resume the selected instructional move. For off_task, redirect briefly into the selected move without scolding.',
    'The user prompt includes transition metadata. When targetChanged is true, begin tutorMessage with a brief acknowledgement of what the learner just contributed or repaired, then name the new focus before asking the next hint, prompt, pump, or correction.',
    'Use the full dialogue history to avoid repeating failed attempts. When a hint, prompt, assertion, or correction has not helped the learner make progress, take a new pathway or perspective toward the unspoken expectation or unresolved misconception.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task, do not scold or analyze the behavior. Re-prompt from a new angle for the app-selected target and move.',
    'Correction moves include an app-selected correctionStage. For correctionStage "hint", give a light cue that helps the learner notice why the misconception may not work. For "prompt", ask a targeted question that helps the learner explain why it is wrong. For "assertion", state exactly how it is wrong and ask the learner to restate or apply the repair.',
    'If the same misconception remains active across turns, continue the repair from the selected correctionStage and full dialogue history rather than repeating the same angle.',
    'For assertion moves, supply the missing content briefly, then ask the learner to restate or apply that idea.',
    'Keep the tutor message concise, conversational, and addressed to the student.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_UTTERANCE_ENVELOPE_SCHEMA, null, 2),
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function getTargetContent(config: AutoTutorConfig, plan: AutoTutorPlan): unknown {
  if (plan.target.type === 'expectation') {
    return config.script.expectations.find((expectation) => expectation.id === plan.target.id);
  }
  if (plan.target.type === 'misconception') {
    return (config.script.misconceptions || []).find((misconception) => misconception.id === plan.target.id);
  }
  if (plan.target.type === 'completion') {
    return { summary: config.script.summary };
  }
  return { authoredContentBoundary: 'Answer only from the supplied lesson content and dialogue history.' };
}

function getPlanTransitionMetadata(state: AutoTutorState, plan: AutoTutorPlan) {
  const previousTargetType = state.planner.lastSelectedTargetType || null;
  const previousTargetId = state.planner.lastSelectedTargetId || null;
  const currentTargetType = plan.target.type;
  const currentTargetId = plan.target.id || null;
  const targetChanged = previousTargetType !== currentTargetType || previousTargetId !== currentTargetId;
  return {
    previousTargetType,
    previousTargetId,
    currentTargetType,
    currentTargetId,
    targetChanged,
  };
}

function buildUtteranceUserPrompt(config: AutoTutorConfig, studentAnswer: string, state: AutoTutorState, plan: AutoTutorPlan): string {
  const transition = getPlanTransitionMetadata(state, plan);
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Learner contribution classification:',
    JSON.stringify(state.learnerContribution, null, 2),
    '',
    'App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response. Use correctionStage when present:',
    JSON.stringify({
      targetType: plan.target.type,
      targetId: plan.target.id || null,
      selectedMove: plan.selectedMove,
      correctionStage: plan.correctionStage || null,
    }, null, 2),
    '',
    'Transition metadata. If targetChanged is true, begin tutorMessage with a brief acknowledgement of the learner contribution or repaired understanding that allowed the transition, then name the new focus before asking the selected move:',
    JSON.stringify(transition, null, 2),
    '',
    'Relevant authored target content:',
    JSON.stringify(getTargetContent(config, plan), null, 2),
    '',
    'Current scored planner state:',
    JSON.stringify(state.planner, null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(state.dialogue, null, 2),
  ].join('\n');
}

function validateScoreEnvelopeIds(envelope: AutoTutorScoreEnvelope, state: AutoTutorState): void {
  const expectationIds = Object.keys(state.expectations);
  const misconceptionIds = Object.keys(state.misconceptions);
  const returnedExpectationIds = Object.keys(envelope.expectationScores);
  const returnedMisconceptionIds = Object.keys(envelope.misconceptionScores);

  for (const id of expectationIds) {
    if (!returnedExpectationIds.includes(id)) {
      throw new Error(`AutoTutor response omitted expectation "${id}"`);
    }
  }
  for (const id of returnedExpectationIds) {
    if (!expectationIds.includes(id)) {
      throw new Error(`AutoTutor response included unknown expectation "${id}"`);
    }
  }
  for (const id of misconceptionIds) {
    if (!returnedMisconceptionIds.includes(id)) {
      throw new Error(`AutoTutor response omitted misconception "${id}"`);
    }
  }
  for (const id of returnedMisconceptionIds) {
    if (!misconceptionIds.includes(id)) {
      throw new Error(`AutoTutor response included unknown misconception "${id}"`);
    }
  }
}

function validateUtteranceEnvelope(envelope: AutoTutorUtteranceEnvelope, plan: AutoTutorPlan): void {
  if (envelope.targetType !== plan.target.type) {
    throw new Error(`AutoTutor utterance response changed target type from "${plan.target.type}" to "${envelope.targetType}"`);
  }
  if ((envelope.targetId || undefined) !== (plan.target.id || undefined)) {
    throw new Error(`AutoTutor utterance response changed target ID from "${plan.target.id || ''}" to "${envelope.targetId || ''}"`);
  }
  if (envelope.selectedMove !== plan.selectedMove) {
    throw new Error(`AutoTutor utterance response changed selected move from "${plan.selectedMove}" to "${envelope.selectedMove}"`);
  }
}

function validateSavedExpectationScores(
  value: unknown,
  expectedIds: string[],
): AutoTutorState['expectations'] {
  const fieldName = 'expectations';
  if (!isRecord(value)) {
    throw new Error(`AutoTutor saved history state.${fieldName} must be an object`);
  }
  const returnedIds = Object.keys(value);
  for (const id of expectedIds) {
    if (!returnedIds.includes(id)) {
      throw new Error(`AutoTutor saved history omitted ${fieldName.slice(0, -1)} "${id}"`);
    }
  }
  for (const id of returnedIds) {
    if (!expectedIds.includes(id)) {
      throw new Error(`AutoTutor saved history included unknown ${fieldName.slice(0, -1)} "${id}"`);
    }
  }

  const parsed: AutoTutorState['expectations'] = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.current !== 'boolean') {
      throw new Error(`AutoTutor saved history state.${fieldName}.${id}.current must be boolean`);
    }
    let missing: string[] | undefined;
    if (entry.missing !== undefined) {
      if (!Array.isArray(entry.missing) || entry.missing.some((item) => typeof item !== 'string')) {
        throw new Error(`AutoTutor saved history state.${fieldName}.${id}.missing must be a string array`);
      }
      missing = entry.missing;
    }
    parsed[id] = {
      current: entry.current,
      coverage: requiredScore(entry.coverage, `state.${fieldName}.${id}.coverage`),
      ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
      ...(missing ? { missing } : {}),
      ...(typeof entry.tutoredByAssertion === 'boolean' ? { tutoredByAssertion: entry.tutoredByAssertion } : {}),
      ...(typeof entry.learnerRestatedAfterAssertion === 'boolean' ? { learnerRestatedAfterAssertion: entry.learnerRestatedAfterAssertion } : {}),
      frontier: requiredScore(entry.frontier, `state.${fieldName}.${id}.frontier`),
      coherence: requiredScore(entry.coherence, `state.${fieldName}.${id}.coherence`),
      centrality: requiredScore(entry.centrality, `state.${fieldName}.${id}.centrality`),
      priority: requiredScore(entry.priority, `state.${fieldName}.${id}.priority`),
    };
  }
  return parsed;
}

function validateSavedMisconceptionScores(
  value: unknown,
  expectedIds: string[],
): AutoTutorState['misconceptions'] {
  const fieldName = 'misconceptions';
  if (!isRecord(value)) {
    throw new Error(`AutoTutor saved history state.${fieldName} must be an object`);
  }
  const returnedIds = Object.keys(value);
  for (const id of expectedIds) {
    if (!returnedIds.includes(id)) {
      throw new Error(`AutoTutor saved history omitted ${fieldName.slice(0, -1)} "${id}"`);
    }
  }
  for (const id of returnedIds) {
    if (!expectedIds.includes(id)) {
      throw new Error(`AutoTutor saved history included unknown ${fieldName.slice(0, -1)} "${id}"`);
    }
  }

  const parsed: AutoTutorState['misconceptions'] = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.current !== 'boolean') {
      throw new Error(`AutoTutor saved history state.${fieldName}.${id}.current must be boolean`);
    }
    parsed[id] = {
      current: entry.current,
      confidence: requiredScore(entry.confidence, `state.${fieldName}.${id}.confidence`),
      ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
      ...(typeof entry.repaired === 'boolean' ? { repaired: entry.repaired } : {}),
      ...(typeof entry.repairEvidence === 'string' ? { repairEvidence: entry.repairEvidence } : {}),
    };
  }
  return parsed;
}

function validateSavedLearnerContribution(value: unknown): AutoTutorLearnerContributionScore | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error('AutoTutor saved history state.learnerContribution must be an object when present');
  }
  if (typeof value.type !== 'string' || !AUTO_TUTOR_LEARNER_CONTRIBUTION_TYPES.has(value.type)) {
    throw new Error('AutoTutor saved history state.learnerContribution.type is invalid');
  }
  return {
    type: value.type as AutoTutorLearnerContributionScore['type'],
    confidence: requiredScore(value.confidence, 'state.learnerContribution.confidence'),
    ...(typeof value.evidence === 'string' ? { evidence: value.evidence } : {}),
  };
}

function requiredScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`AutoTutor saved history ${field} must be a number from 0 to 1`);
  }
  return value;
}

function validateSavedPlannerState(value: unknown, expectedState: AutoTutorState): AutoTutorPlannerState {
  if (!isRecord(value)) {
    throw new Error('AutoTutor saved history state.planner must be an object');
  }
  const planner = value as AutoTutorPlannerState;
  validatePlannerState({
    expectations: Object.keys(expectedState.expectations).map((id) => ({ id, proposition: id, assertion: id })),
    misconceptions: Object.keys(expectedState.misconceptions).map((id) => ({ id, correction: id, repairQuestion: id })),
    dialogPolicy: { requiredExpectations: Object.keys(expectedState.expectations) },
    summary: '',
  }, planner);
  return planner;
}

function validateSavedState(
  state: AutoTutorHistoryNote['state'],
  expectedState: AutoTutorState,
): AutoTutorHistoryNote['state'] {
  const answerQuality = state.answerQuality;
  if (!['low', 'partial', 'high', 'none'].includes(answerQuality)) {
    throw new Error('AutoTutor saved history state.answerQuality is invalid');
  }
  if (typeof state.studentAskedQuestion !== 'boolean') {
    throw new Error('AutoTutor saved history state.studentAskedQuestion must be boolean');
  }
  if (typeof state.selectedMove !== 'string') {
    throw new Error('AutoTutor saved history state.selectedMove must be string');
  }
  if (!Number.isInteger(state.turnCount) || state.turnCount < 0) {
    throw new Error('AutoTutor saved history state.turnCount must be a non-negative integer');
  }
  if (typeof state.costUsd !== 'number' || !Number.isFinite(state.costUsd) || state.costUsd < 0) {
    throw new Error('AutoTutor saved history state.costUsd must be a non-negative number');
  }
  if (typeof state.completed !== 'boolean') {
    throw new Error('AutoTutor saved history state.completed must be boolean');
  }
  if (typeof state.mastered !== 'boolean') {
    throw new Error('AutoTutor saved history state.mastered must be boolean');
  }
  if (!isAutoTutorEndReason(state.endReason)) {
    throw new Error('AutoTutor saved history state.endReason is invalid');
  }
  const expectations = validateSavedExpectationScores(state.expectations, Object.keys(expectedState.expectations));
  const misconceptions = validateSavedMisconceptionScores(state.misconceptions, Object.keys(expectedState.misconceptions));
  const learnerContribution = validateSavedLearnerContribution(state.learnerContribution);
  const planner = validateSavedPlannerState(state.planner, expectedState);

  return {
    expectations,
    misconceptions,
    planner,
    answerQuality,
    learnerContribution,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove as AutoTutorMove | '',
    turnCount: state.turnCount,
    costUsd: state.costUsd,
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
  };
}

function readOpenRouterCost(response: unknown): number {
  if (!isRecord(response) || !isRecord(response.usage) || typeof response.usage.cost !== 'number') {
    throw new Error('OpenRouter response did not include usage.cost; AutoTutor cannot enforce the 20 cent cap');
  }
  return response.usage.cost;
}

function readOpenRouterMessageContent(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.choices)) {
    throw new Error('OpenRouter response missing choices array');
  }
  const firstChoice = response.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string') {
    throw new Error('OpenRouter response missing choices[0].message.content');
  }
  return firstChoice.message.content;
}

async function readOpenRouterResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      return {};
    }
    throw new Error('OpenRouter response was empty');
  }
  try {
    return JSON.parse(text);
  } catch {
    const status = response.ok ? '' : ` for HTTP ${response.status}`;
    throw new Error(`OpenRouter returned non-JSON response${status}`);
  }
}

async function callOpenRouter(config: AutoTutorConfig, messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const response = await fetch(OPEN_ROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'MoFaCTS AutoTutor',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      stream: false,
    }),
  });

  const responseBody = await readOpenRouterResponseBody(response);
  if (!response.ok) {
    const responseError = isRecord(responseBody) && isRecord(responseBody.error)
      ? responseBody.error
      : {};
    const errorMessage = typeof responseError.message === 'string'
      ? responseError.message
      : `OpenRouter request failed with HTTP ${response.status}`;
    throw new Error(redactSecrets(errorMessage));
  }

  return {
    content: readOpenRouterMessageContent(responseBody),
    costUsd: readOpenRouterCost(responseBody),
  };
}

async function callOpenRouterScoring(config: AutoTutorConfig, state: AutoTutorState, studentAnswer: string) {
  return await callOpenRouter(config, [
    { role: 'system', content: buildScoringSystemPrompt(config) },
    { role: 'user', content: buildScoringUserPrompt(studentAnswer, state) },
  ]);
}

async function callOpenRouterUtterance(config: AutoTutorConfig, state: AutoTutorState, studentAnswer: string, plan: AutoTutorPlan) {
  return await callOpenRouter(config, [
    { role: 'system', content: buildUtteranceSystemPrompt(config) },
    { role: 'user', content: buildUtteranceUserPrompt(config, studentAnswer, state, plan) },
  ]);
}

function computeProgress(state: AutoTutorState): number {
  const expectationCount = Object.keys(state.expectations).length;
  if (expectationCount === 0) {
    throw new Error('AutoTutor state has no expectations');
  }
  const coverageSum = Object.values(state.expectations).reduce((sum, entry) => sum + entry.coverage, 0);
  const activeMisconceptionPenalty = Object.values(state.misconceptions)
    .filter((entry) => !entry.repaired && entry.current && entry.confidence >= 0.65)
    .length;
  return Math.max(0, coverageSum - activeMisconceptionPenalty) / expectationCount;
}

function countCoveredRequiredExpectations(state: AutoTutorState, config: AutoTutorConfig): number {
  return getRequiredExpectationIds(config.script).filter((id) => {
    const score = state.expectations[id];
    return Boolean(score && score.coverage >= 0.8);
  }).length;
}

function countActiveMisconceptions(state: AutoTutorState): number {
  return Object.values(state.misconceptions)
    .filter((entry) => !entry.repaired && entry.current && entry.confidence >= 0.65)
    .length;
}

function computeProgressCounts(state: AutoTutorState, config: AutoTutorConfig): AutoTutorProgressCounts {
  return {
    coveredExpectations: countCoveredRequiredExpectations(state, config),
    requiredExpectations: getRequiredExpectationIds(config.script).length,
    neededExpectations: config.graduation.requiredExpectationCount,
    activeMisconceptions: countActiveMisconceptions(state),
    totalMisconceptions: Object.keys(state.misconceptions).length,
    maxActiveMisconceptions: config.graduation.maxActiveMisconceptions,
  };
}

function getRequiredExpectationIds(script: AutoTutorScript): string[] {
  const required = script.dialogPolicy.requiredExpectations;
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error('AutoTutor runtime requires autoTutor.dialogPolicy.requiredExpectations');
  }
  const authoredIds = new Set(script.expectations.map((expectation) => expectation.id));
  return required.map((id) => {
    if (typeof id !== 'string' || !authoredIds.has(id)) {
      throw new Error(`AutoTutor runtime required expectation references unknown ID "${String(id)}"`);
    }
    return id;
  });
}

function validateGraduationAgainstScript(config: AutoTutorConfig): void {
  const requiredExpectationCount = getRequiredExpectationIds(config.script).length;
  if (config.graduation.requiredExpectationCount > requiredExpectationCount) {
    throw new Error(
      `AutoTutor graduation.requiredExpectationCount cannot exceed ${requiredExpectationCount} required expectations`
    );
  }
  const misconceptionCount = config.script.misconceptions?.length || 0;
  if (config.graduation.maxActiveMisconceptions > misconceptionCount) {
    throw new Error(
      `AutoTutor graduation.maxActiveMisconceptions cannot exceed ${misconceptionCount} authored misconceptions`
    );
  }
}

function computeGraduationMet(state: AutoTutorState, config: AutoTutorConfig): boolean {
  const progressCounts = computeProgressCounts(state, config);
  return progressCounts.coveredExpectations >= config.graduation.requiredExpectationCount &&
    progressCounts.activeMisconceptions <= config.graduation.maxActiveMisconceptions;
}

function publishState(capabilities: AutoTutorRuntimeCapabilities, state: AutoTutorState, config: AutoTutorConfig): void {
  capabilities.session.publishAutoTutorState({
    ...summarizeState(state),
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
    stoppedByCost: state.stoppedByCost,
    progress: computeProgress(state),
    progressCounts: computeProgressCounts(state, config),
  });
}

function readHistoryNote(row: AutoTutorHistoryRow): AutoTutorHistoryNote {
  if (typeof row.CFNote !== 'string' || !row.CFNote.trim()) {
    throw new Error('AutoTutor history row is missing CFNote');
  }
  let note: unknown;
  try {
    note = JSON.parse(row.CFNote);
  } catch {
    throw new Error('AutoTutor history row CFNote is not valid JSON');
  }
  if (!isRecord(note) || note.kind !== 'autotutor' || !isRecord(note.state)) {
    throw new Error('AutoTutor history row CFNote has an invalid AutoTutor payload');
  }
  if ('schemaVersion' in note) {
    throw new Error('AutoTutor history row CFNote must not include schemaVersion');
  }
  return note as AutoTutorHistoryNote;
}

function validateSavedEndState(note: AutoTutorHistoryNote): void {
  if (typeof note.completed !== 'boolean' || typeof note.stoppedByCost !== 'boolean') {
    throw new Error('AutoTutor saved history completion flags must be boolean');
  }
  if (typeof note.mastered !== 'boolean' || !isAutoTutorEndReason(note.endReason)) {
    throw new Error('AutoTutor saved history mastery flags must be present and valid');
  }
}

function applySavedHistory(config: AutoTutorConfig, state: AutoTutorState, rows: AutoTutorHistoryRow[]): void {
  if (rows.length === 0) {
    return;
  }
  const dialogue: AutoTutorState['dialogue'] = [];
  for (const row of rows) {
    const studentText = typeof row.input === 'string' && row.input.trim()
      ? row.input.trim()
      : (typeof row.responseValue === 'string' ? row.responseValue.trim() : '');
    const tutorText = typeof row.feedbackText === 'string' ? row.feedbackText.trim() : '';
    if (!studentText || !tutorText) {
      throw new Error('AutoTutor history row is missing student or tutor text');
    }
    dialogue.push({ role: 'student', text: studentText });
    dialogue.push({ role: 'tutor', text: tutorText });
  }

  const latestRow = rows[rows.length - 1];
  if (!latestRow) {
    throw new Error('AutoTutor history resume expected at least one row');
  }
  const latest = readHistoryNote(latestRow);
  if (latest.scriptId !== config.script.id) {
    throw new Error(`AutoTutor saved history scriptId "${latest.scriptId}" does not match current script "${config.script.id}"`);
  }
  validateSavedEndState(latest);
  const savedState = validateSavedState(latest.state, state);
  if (
    latest.completed !== savedState.completed ||
    latest.mastered !== savedState.mastered ||
    latest.endReason !== savedState.endReason
  ) {
    throw new Error('AutoTutor saved history top-level end state does not match state payload');
  }
  state.expectations = savedState.expectations;
  state.misconceptions = savedState.misconceptions;
  state.planner = savedState.planner;
  state.answerQuality = savedState.answerQuality;
  state.learnerContribution = savedState.learnerContribution;
  state.studentAskedQuestion = savedState.studentAskedQuestion;
  state.selectedMove = savedState.selectedMove;
  state.turnCount = savedState.turnCount;
  state.costUsd = savedState.costUsd;
  state.completed = savedState.completed;
  state.mastered = savedState.mastered;
  state.endReason = savedState.endReason;
  state.stoppedByCost = latest.stoppedByCost;
  state.dialogue = dialogue;
}

async function loadSavedAutoTutorHistory(capabilities: AutoTutorRuntimeCapabilities): Promise<AutoTutorHistoryRow[]> {
  const snapshot = capabilities.session.getAutoTutorSessionSnapshot();
  if (!snapshot.currentUserId) {
    throw new Error('AutoTutor resume requires current user, TDF id, and unit number');
  }
  return await capabilities.serverMethods.getAutoTutorHistoryForUnit(
    snapshot.currentUserId,
    snapshot.currentTdfId,
    snapshot.currentUnitNumber,
  ) as AutoTutorHistoryRow[];
}

function buildHistoryNote(config: AutoTutorConfig, state: AutoTutorState, tutorMessage: string): AutoTutorHistoryNote {
  return {
    kind: 'autotutor',
    model: config.model,
    scriptId: config.script.id,
    state: summarizeState(state),
    progress: computeProgress(state),
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
    stoppedByCost: state.stoppedByCost,
    tutorMessage,
  };
}

async function insertAutoTutorHistoryTurn(config: AutoTutorConfig, state: AutoTutorState, args: {
  capabilities: AutoTutorRuntimeCapabilities;
  studentAnswer: string;
  tutorMessage: string;
  turnStartedAt: number;
  turnEndedAt: number;
}) {
  const snapshot = args.capabilities.session.getAutoTutorSessionSnapshot();
  const currentTdfFile = snapshot.currentTdfFile as {
    tdfs?: { tutor?: { unit?: unknown[] } };
  } | null | undefined;
  const tutor = currentTdfFile?.tdfs?.tutor;
  const unitNumber = snapshot.currentUnitNumber;
  const unit = (tutor?.unit?.[unitNumber] || {}) as { unitname?: unknown };
  const unitName = typeof unit?.unitname === 'string' ? unit.unitname : config.unitName;
  const cluster = args.capabilities.stimuli.getStimCluster(config.clusterIndex);
  const stim = (cluster?.stims?.[0] || {}) as { _id?: unknown; stimulusKC?: unknown };
  const sessionID = (new Date(args.turnStartedAt)).toUTCString().substr(0, 16) + ' ' + snapshot.currentTdfName;
  const note = buildHistoryNote(config, state, args.tutorMessage);

  const historyRecord: AutoTutorCompressedHistoryRecord = {
    itemId: stim?._id || config.script.id,
    KCId: stim?.stimulusKC || config.script.id,
    userId: snapshot.currentUserId,
    TDFId: snapshot.currentTdfId,
    outcome: state.mastered ? 'correct' : 'incorrect',
    probabilityEstimate: null,
    typeOfResponse: 'autotutor-chat',
    responseValue: legacyTrim(args.studentAnswer),
    displayedStimulus: { text: config.prompt },
    sectionId: snapshot.sectionId,
    teacherId: snapshot.teacherId,
    anonStudentId: snapshot.currentUsername,
    sessionID,
    conditionNameA: 'tdf file',
    conditionTypeA: snapshot.currentTdfName,
    conditionNameB: 'xcondition',
    conditionTypeB: snapshot.conditionName || null,
    conditionNameC: 'schedule condition',
    conditionTypeC: null,
    conditionNameD: 'how answered',
    conditionTypeD: 'autotutor-chat',
    conditionNameE: 'section',
    conditionTypeE: snapshot.entryPoint && snapshot.entryPoint !== 'direct'
      ? snapshot.entryPoint
      : null,
    responseDuration: args.turnEndedAt - args.turnStartedAt,
    levelUnit: unitNumber,
    levelUnitName: unitName,
    levelUnitType: 'autotutor',
    problemName: config.prompt,
    stepName: config.script.id,
    time: args.turnEndedAt,
    problemStartTime: args.turnStartedAt,
    selection: 'autotutor-chat',
    action: getAutoTutorHistoryAction(state),
    input: legacyTrim(args.studentAnswer),
    studentResponseType: 'ATTEMPT',
    studentResponseSubtype: 'autotutor',
    tutorResponseType: state.completed ? 'RESULT' : 'HINT_MSG',
    KCDefault: stim?.stimulusKC || config.script.id,
    KCCategoryDefault: '',
    KCCluster: cluster?.clusterKC || config.script.topic,
    KCCategoryCluster: '',
    CFAudioInputEnabled: false,
    CFAudioOutputEnabled: false,
    CFDisplayOrder: state.turnCount,
    CFStimFileIndex: config.clusterIndex,
    CFSetShuffledIndex: config.clusterIndex,
    CFAlternateDisplayIndex: null,
    CFStimulusVersion: 0,
    CFCorrectAnswer: config.script.idealAnswer,
    CFOverlearning: false,
    CFResponseTime: args.turnEndedAt,
    CFStartLatency: 0,
    CFEndLatency: args.turnEndedAt - args.turnStartedAt,
    CFFeedbackLatency: 0,
    CFReviewEntry: '',
    CFButtonOrder: '',
    CFItemRemoved: false,
    CFNote: JSON.stringify(note),
    feedbackText: legacyTrim(args.tutorMessage),
    feedbackType: state.mastered ? 'correct' : (state.completed ? 'incorrect' : 'autotutor'),
    instructionQuestionResult: false,
    entryPoint: snapshot.entryPoint || '',
    eventType: 'autotutor-turn',
  };
  await args.capabilities.history.writeCompressedHistory(historyRecord);
}

export async function createAutoTutorRuntime(): Promise<AutoTutorRuntime> {
  const capabilities = createMeteorAutoTutorRuntimeCapabilities();
  const config = readAutoTutorConfig(capabilities);
  validateGraduationAgainstScript(config);
  const state = createInitialState(config.script);
  applySavedHistory(config, state, await loadSavedAutoTutorHistory(capabilities));
  publishState(capabilities, state, config);

  return {
    config,
    getState: () => cloneJson(state),
    getProgress: () => computeProgress(state),
    getProgressCounts: () => computeProgressCounts(state, config),
    getDialogue: () => cloneJson(state.dialogue),
    async submitStudentAnswer(studentAnswer: string) {
      const cleanedAnswer = requiredString(studentAnswer, 'student answer');
      if (state.completed) {
        throw new Error('AutoTutor session is already complete');
      }
      if (state.costUsd > AUTO_TUTOR_COST_CAP_USD) {
        applyAutoTutorEndReason(state, 'cost_cap');
        publishState(capabilities, state, config);
        return {
          message: 'We need to stop here because this AutoTutor session reached the configured cost cap.',
          completed: true,
          mastered: false,
          endReason: 'cost_cap',
          stoppedByCost: true,
        };
      }

      const turnStartedAt = Date.now();
      const scoreResult = await callOpenRouterScoring(config, state, cleanedAnswer);
      const scoreEnvelope = parseAutoTutorScoreEnvelope(scoreResult.content);
      validateScoreEnvelopeIds(scoreEnvelope, state);

      const nextState = cloneJson(state);
      nextState.costUsd += scoreResult.costUsd;
      const durableExpectationScores = preserveDurableExpectationCoverage(
        config.script,
        state.expectations,
        scoreEnvelope.expectationScores,
      );
      const scoredExpectations = recomputeExpectationPriorities(config.script, durableExpectationScores);
      const scoredMisconceptions = preserveRepairedMisconceptionState(
        config.script,
        state.misconceptions,
        scoreEnvelope.misconceptionScores,
      );
      nextState.expectations = scoredExpectations;
      nextState.misconceptions = scoredMisconceptions;
      nextState.planner.expectationScores = scoredExpectations;
      nextState.planner.misconceptionScores = scoredMisconceptions;
      nextState.answerQuality = scoreEnvelope.answerQuality;
      nextState.learnerContribution = scoreEnvelope.learnerContribution;
      nextState.studentAskedQuestion = scoreEnvelope.learnerQuestion.current;
      const stateForUtterancePlan = cloneJson(nextState);
      const plan = planAutoTutorTurn({
        script: config.script,
        plannerState: nextState.planner,
        learnerQuestion: scoreEnvelope.learnerQuestion,
        learnerContribution: scoreEnvelope.learnerContribution,
        answerQuality: scoreEnvelope.answerQuality,
        requireFinalAnswerPrompt: config.requireFinalAnswerPrompt,
      });
      nextState.planner = plan.nextPlannerState;
      nextState.selectedMove = plan.selectedMove;
      nextState.turnCount += 1;
      nextState.dialogue.push({ role: 'student', text: cleanedAnswer });

      if (nextState.costUsd > AUTO_TUTOR_COST_CAP_USD) {
        applyAutoTutorEndReason(nextState, 'cost_cap');
      } else {
        const graduationMet = computeGraduationMet(nextState, config);
        if (graduationMet && (plan.target.type !== 'completion' || plan.selectedMove === 'summary')) {
          applyAutoTutorEndReason(nextState, 'mastery');
        } else if (nextState.turnCount >= config.turnLimit.maxTurns) {
          applyAutoTutorEndReason(nextState, 'max_turns');
        } else {
          applyAutoTutorEndReason(nextState, 'in_progress');
        }
      }
      let tutorMessage = 'We need to stop here because this AutoTutor session reached the configured cost cap.';
      if (!nextState.stoppedByCost) {
        const utteranceResult = await callOpenRouterUtterance(config, stateForUtterancePlan, cleanedAnswer, plan);
        nextState.costUsd += utteranceResult.costUsd;
        const utteranceEnvelope = parseAutoTutorUtteranceEnvelope(utteranceResult.content);
        validateUtteranceEnvelope(utteranceEnvelope, plan);
        tutorMessage = utteranceEnvelope.tutorMessage;
        if (nextState.costUsd > AUTO_TUTOR_COST_CAP_USD) {
          applyAutoTutorEndReason(nextState, 'cost_cap');
          tutorMessage = 'We need to stop here because this AutoTutor session reached the configured cost cap.';
        }
      }
      nextState.dialogue.push({ role: 'tutor', text: tutorMessage });
      const turnEndedAt = Date.now();
      await capabilities.history.writeAutoTutorTurn({
        config,
        state: nextState,
        studentAnswer: cleanedAnswer,
        tutorMessage,
        startedAt: turnStartedAt,
        endedAt: turnEndedAt,
      });
      Object.assign(state, nextState);
      publishState(capabilities, state, config);

      return {
        message: tutorMessage,
        completed: state.completed,
        mastered: state.mastered,
        endReason: state.endReason,
        stoppedByCost: state.stoppedByCost,
      };
    },
  };
}
