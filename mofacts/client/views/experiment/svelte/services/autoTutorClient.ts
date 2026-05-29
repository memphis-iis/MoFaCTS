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
  getScoreableExpectationIds,
  mergeScoreableExpectationScores,
  planAutoTutorTurn,
  preserveRepairedMisconceptionState,
  recomputeExpectationPriorities,
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
  AutoTutorCanonicalHistoryRecord,
  AutoTutorHistoryTurn,
  AutoTutorRuntimeCapabilities,
} from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeCapabilities';
import {
  getRequiredExpectationIds,
  readAutoTutorConfig,
  validateGraduationAgainstScript,
  type AutoTutorConfig,
  type AutoTutorScript,
} from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeConfig';
import {
  applyAutoTutorEndReason,
  getAutoTutorHistoryAction,
  type AutoTutorEndReason,
} from '../../../../../../learning-components/units/autotutor/AutoTutorEndState';
import {
  AUTO_TUTOR_SCORING_TEMPERATURE,
} from '../../../../../../learning-components/units/autotutor/AutoTutorGenerationConfig';
import {
  readAutoTutorHistoryNote,
  validateAutoTutorSavedEndState,
  type AutoTutorHistoryNote,
  type AutoTutorHistoryRow,
} from '../../../../../../learning-components/units/autotutor/AutoTutorSavedHistory';
import {
  validateAutoTutorSavedState,
  type AutoTutorSavedStateShape,
} from '../../../../../../learning-components/units/autotutor/AutoTutorSavedState';

const OPEN_ROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AUTO_TUTOR_COST_CAP_USD = 0.20;
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

type AutoTutorSavedHistoryNote = AutoTutorHistoryNote<ReturnType<typeof summarizeState>>;

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
      async writeCanonicalHistory(record: AutoTutorCanonicalHistoryRecord) {
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function redactSecrets(message: string): string {
  return message.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
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

function buildScoringSystemPrompt(config: AutoTutorConfig, scoreableExpectationIds: string[]): string {
  const frozenExpectationIds = config.script.expectations
    .map((expectation) => expectation.id)
    .filter((id) => !scoreableExpectationIds.includes(id));
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
    'When scoring a repair answer, interpret pronouns and short phrases in the context of the tutor question and active repair context. Do not require the learner to restate every contrast perfectly if their answer substantially accepts the repair target.',
    'If an authored misconception includes repairCriteria or acceptableRepairAnswers, use those fields as the authoritative standard for whether the latest learner answer repaired that misconception.',
    'If the latest learner answer uses words such as it, they, them, each one, repetitions, or those intervals, resolve those words from the latest tutor repair question before judging misconception evidence.',
    'For confidence intervals, if the tutor asks about repeating the sampling and interval-construction process, an answer like "sometimes it would have the mean and sometimes not; 95% of the time, in the long run, it would have the mean" should repair the misconception that the fixed population mean has a 95% probability of lying in this one already-computed interval, because "it" refers to the repeated/new intervals in the asked context.',
    'For confidence intervals, if the tutor asks whether newly computed intervals would contain the true mean about 95% of the time, an answer like "they would always or never have the true mean because it is fixed; 95% of repetitions would have the true mean; each one is yes or no" repairs the specific-interval probability misconception. It may still be missing some expectation wording, but it should not keep that misconception active.',
    'When a latest repair answer is mostly right but slightly ambiguous, prefer lowering or clearing the active misconception and recording remaining missing expectation elements over keeping the misconception active from prior dialogue.',
    'If you keep a misconception active after a repair question, the misconception evidence must quote or tightly paraphrase the latest learner answer itself. Do not use wording from earlier learner turns as evidence that the latest answer still has the misconception.',
    'When the latest learner answer repairs a misconception, set that misconception to current false, confidence 0, repaired true, and explain the repair in repairEvidence. Do not carry forward a prior misconception solely because earlier dialogue showed it.',
    'For a previously repaired misconception, keep current false and confidence 0 unless the latest learner answer reintroduces that misconception. If it is reintroduced, set current true and repaired false.',
    'Assertion restatement is also a first-class scoring decision. If the prior tutor state shows an expectation was tutoredByAssertion and the latest tutor turn asked the learner to restate or apply that asserted idea, score the latest learner answer first as uptake of that expectation.',
    'A cooperative restatement or concrete application of the asserted idea counts as learner knowledge. When the latest learner answer adequately restates or applies the asserted expectation, set learnerRestatedAfterAssertion true and assign enough expectation coverage for that idea to count as learned, even if earlier learner attempts had low coverage.',
    'Do not let prior failures prevent a proper post-assertion restatement from counting. Prior dialogue may explain why the assertion was needed, but the latest learner answer is the fresh evidence for whether the asserted idea is now understood.',
    'Do not choose a dialogue target, choose a dialogue move, or write the tutor response.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA, null, 2),
    scoreableExpectationIds.length > 0
      ? `Include exactly these expectation IDs under expectationScores on this turn: ${JSON.stringify(scoreableExpectationIds)}.`
      : 'Set expectationScores to an empty object on this turn.',
    frozenExpectationIds.length > 0
      ? `Do not include these already covered expectation IDs under expectationScores: ${JSON.stringify(frozenExpectationIds)}. The app will carry their prior scores forward unchanged.`
      : 'No authored expectations are frozen on this turn.',
    'Include every authored misconception ID under misconceptionScores on every turn.',
    'Do not invent expectation or misconception IDs.',
    'Set expectation coverage from 0 to 1, provide brief evidence, and include missing elements when coverage is incomplete.',
    'Set misconception confidence from 0 to 1.',
    'Set coherence and centrality from 0 to 1. Do not return frontier or priority; the app derives those values deterministically from coverage, coherence, and centrality.',
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function getActiveRepairContext(config: AutoTutorConfig, state: AutoTutorState) {
  const lastTargetType = state.planner.lastSelectedTargetType;
  const lastTargetId = state.planner.lastSelectedTargetId;
  if (lastTargetType !== 'misconception' || !lastTargetId) {
    return null;
  }
  const misconception = (config.script.misconceptions || [])
    .find((entry) => entry.id === lastTargetId);
  if (!misconception) {
    return null;
  }
  const latestTutorTurn = [...state.dialogue].reverse()
    .find((turn) => turn.role === 'tutor');
  return {
    activeMisconceptionId: lastTargetId,
    latestTutorRepairQuestionOrPrompt: latestTutorTurn?.text || '',
    authoredRepairQuestion: misconception.repairQuestion,
    repairCriteria: misconception.repairCriteria || '',
    acceptableRepairAnswers: misconception.acceptableRepairAnswers || [],
  };
}

function buildScoringUserPrompt(config: AutoTutorConfig, studentAnswer: string, state: AutoTutorState, scoreableExpectationIds: string[]): string {
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Expectation score scope. Score only these expectation IDs. Treat all other prior expectation scores as frozen context:',
    JSON.stringify(scoreableExpectationIds, null, 2),
    '',
    'Active repair context. If present, score the latest answer against this repair context before carrying forward prior misconception state:',
    JSON.stringify(getActiveRepairContext(config, state), null, 2),
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
    'The targetType, targetId, selectedMove, expectation IDs, misconception IDs, rubric labels, scoring fields, and planner state are internal application metadata. Never mention them in tutorMessage.',
    'When referring to prior learner progress or the next focus, use only regular English concepts from the visible dialogue, the learner’s own words, and the authored lesson content. Translate internal targets into plain lesson language before speaking.',
    'Use only the authored AutoTutor lesson content and the supplied dialogue context. For out-of-scope learner questions, state that this tutor can only answer from the lesson content, then continue with the selected move.',
    'Every non-summary move must keep the dialogue going with a concrete follow-up question to the learner.',
    'When the learner has made progress on or covered a prior expectation, briefly acknowledge that progress before continuing.',
    'Use learnerContribution metadata to shape tone without changing the selected plan. For idk or help_request, be supportive and give the selected hint, prompt, or assertion. For uncertainty, validate the tentative attempt briefly before continuing. For affect, briefly acknowledge the feeling without analyzing it, then continue the selected instructional move. For meta, answer the procedural concern briefly if possible, then resume the selected instructional move. For off_task, redirect briefly into the selected move without scolding.',
    'The user prompt includes transition metadata. When targetChanged is true, begin tutorMessage with a brief acknowledgement of what the learner just contributed or repaired, then name the new focus before asking the next hint, prompt, pump, or correction.',
    'Use the full dialogue history to avoid repeating failed attempts. When a hint, prompt, assertion, or correction has not helped the learner make progress, take a new pathway or perspective toward the unspoken expectation or unresolved misconception.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task, do not scold or analyze the behavior. Re-prompt from a new angle for the app-selected target and move.',
    'Correction moves include an app-selected correctionStage. Treat the authored repairQuestion as the repair goal, not as a required verbatim line.',
    'For correctionStage "hint", give a light cue that helps the learner notice why the misconception may not work, then ask a short question from a fresh angle.',
    'For correctionStage "prompt", ask a targeted question that helps the learner explain why the misconception is wrong. Do not repeat the previous correction question verbatim.',
    'For correctionStage "assertion", state exactly how the misconception is wrong and ask the learner to restate or apply the repair in their own words.',
    'If the same misconception remains active across turns, continue the repair from the selected correctionStage and full dialogue history. Never ask the identical repair question twice in a row.',
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

function buildCorrectionStageGuidance(plan: AutoTutorPlan): string {
  if (plan.target.type !== 'misconception' || !plan.correctionStage) {
    return 'No correction-stage guidance applies.';
  }
  if (plan.correctionStage === 'hint') {
    return 'Use a misconception repair hint. Point to the contrast the learner should notice, but do not fully state the repair yet. Ask a brief follow-up question that is not just the authored repairQuestion copied verbatim.';
  }
  if (plan.correctionStage === 'prompt') {
    return 'Use a misconception repair prompt. Ask the learner to make the key contrast explicitly. If this misconception was already prompted earlier, change the wording and angle rather than repeating the same question.';
  }
  return 'Use a misconception repair assertion. State the correct distinction directly, then ask the learner to restate or apply it. Do not merely ask the authored repairQuestion again.';
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
    'Correction-stage guidance:',
    buildCorrectionStageGuidance(plan),
    '',
    'Transition metadata. If targetChanged is true, begin tutorMessage with a brief acknowledgement of the learner contribution or repaired understanding that allowed the transition, then name the new focus before asking the selected move:',
    JSON.stringify(transition, null, 2),
    '',
    'Tutor-message boundary: do not expose IDs or internal labels from the app-selected plan, transition metadata, scored planner state, or authored script. Talk about the underlying lesson idea in ordinary English.',
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

function validateScoreEnvelopeIds(envelope: AutoTutorScoreEnvelope, state: AutoTutorState, scoreableExpectationIds: string[]): void {
  const expectationIds = scoreableExpectationIds;
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

async function callOpenRouter(
  config: AutoTutorConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  temperature: number,
) {
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
      temperature,
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

async function callOpenRouterScoring(
  config: AutoTutorConfig,
  state: AutoTutorState,
  studentAnswer: string,
  scoreableExpectationIds: string[],
) {
  return await callOpenRouter(config, [
    { role: 'system', content: buildScoringSystemPrompt(config, scoreableExpectationIds) },
    { role: 'user', content: buildScoringUserPrompt(config, studentAnswer, state, scoreableExpectationIds) },
  ], AUTO_TUTOR_SCORING_TEMPERATURE);
}

async function callOpenRouterUtterance(config: AutoTutorConfig, state: AutoTutorState, studentAnswer: string, plan: AutoTutorPlan) {
  return await callOpenRouter(config, [
    { role: 'system', content: buildUtteranceSystemPrompt(config) },
    { role: 'user', content: buildUtteranceUserPrompt(config, studentAnswer, state, plan) },
  ], config.utteranceTemperature);
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
  const latest = readAutoTutorHistoryNote<ReturnType<typeof summarizeState>>(latestRow);
  if (latest.scriptId !== config.script.id) {
    throw new Error(`AutoTutor saved history scriptId "${latest.scriptId}" does not match current script "${config.script.id}"`);
  }
  validateAutoTutorSavedEndState(latest);
  const savedState = validateAutoTutorSavedState(latest.state as AutoTutorSavedStateShape, state);
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

function buildHistoryNote(config: AutoTutorConfig, state: AutoTutorState, tutorMessage: string): AutoTutorSavedHistoryNote {
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

  const historyRecord: AutoTutorCanonicalHistoryRecord = {
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
  await args.capabilities.history.writeCanonicalHistory(historyRecord);
}

export async function createAutoTutorRuntime(
  capabilities: AutoTutorRuntimeCapabilities = createMeteorAutoTutorRuntimeCapabilities(),
): Promise<AutoTutorRuntime> {
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
      const scoreableExpectationIds = getScoreableExpectationIds(config.script, state.expectations);
      const frozenExpectationIds = config.script.expectations
        .map((expectation) => expectation.id)
        .filter((id) => !scoreableExpectationIds.includes(id));
      const scoreResult = await callOpenRouterScoring(config, state, cleanedAnswer, scoreableExpectationIds);
      const scoreEnvelope = parseAutoTutorScoreEnvelope(scoreResult.content, {
        scoreableExpectationIds,
        frozenExpectationIds,
      });
      validateScoreEnvelopeIds(scoreEnvelope, state, scoreableExpectationIds);

      const nextState = cloneJson(state);
      nextState.costUsd += scoreResult.costUsd;
      const durableExpectationScores = mergeScoreableExpectationScores(
        config.script,
        state.expectations,
        scoreEnvelope.expectationScores,
        scoreableExpectationIds,
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
