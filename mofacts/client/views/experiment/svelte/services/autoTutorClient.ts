import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import {
  AUTO_TUTOR_RESPONSE_ENVELOPE_SCHEMA,
  parseAutoTutorResponseEnvelope,
  type AutoTutorResponseEnvelope,
} from '../../../../../common/lib/autoTutorContract';
import { getStimCluster } from '../../../../lib/currentTestingHelpers';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { legacyTrim } from '../../../../../common/underscoreCompat';

const OPEN_ROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AUTO_TUTOR_COST_CAP_USD = 0.20;

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
  minExpectationScore: number;
  requireNoCurrentMisconceptions: boolean;
  maxTurns: number;
};

type AutoTutorConfig = {
  apiKey: string;
  model: string;
  graduation: AutoTutorGraduation;
  prompt: string;
  script: AutoTutorScript;
  unitName: string;
  clusterIndex: number;
};

type AutoTutorState = {
  expectations: Record<string, { current: boolean; evidence?: string }>;
  misconceptions: Record<string, { current: boolean; evidence?: string }>;
  answerQuality: 'low' | 'partial' | 'high' | 'none';
  studentAskedQuestion: boolean;
  selectedMove: string;
  turnCount: number;
  costUsd: number;
  completed: boolean;
  stoppedByCost: boolean;
  dialogue: Array<{ role: 'student' | 'tutor'; text: string }>;
};

export type AutoTutorRuntime = {
  config: AutoTutorConfig;
  getState: () => AutoTutorState;
  getProgress: () => number;
  getDialogue: () => AutoTutorState['dialogue'];
  submitStudentAnswer: (studentAnswer: string) => Promise<{ message: string; completed: boolean; stoppedByCost: boolean }>;
};

type AutoTutorHistoryNote = {
  kind: 'autotutor';
  schemaVersion: 1;
  model: string;
  scriptId: string;
  state: ReturnType<typeof summarizeState>;
  progress: number;
  completed: boolean;
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

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`AutoTutor runtime requires boolean ${field}`);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function redactSecrets(message: string): string {
  return message.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
}

function getTutorFromSession(): Record<string, unknown> {
  const currentTdfFile = Session.get('currentTdfFile');
  const tutor = currentTdfFile?.tdfs?.tutor;
  if (!isRecord(tutor)) {
    throw new Error('AutoTutor runtime requires currentTdfFile.tdfs.tutor in Session');
  }
  return tutor;
}

function getCurrentUnit(): Record<string, unknown> {
  const unit = Session.get('currentTdfUnit');
  if (!isRecord(unit)) {
    throw new Error('AutoTutor runtime requires currentTdfUnit in Session');
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
  const minExpectationScore = requiredNumber(graduation.minExpectationScore, 'autotutorsession.graduation.minExpectationScore');
  if (minExpectationScore < 0 || minExpectationScore > 1) {
    throw new Error('AutoTutor runtime requires graduation.minExpectationScore from 0 to 1');
  }
  const maxTurns = requiredNumber(graduation.maxTurns, 'autotutorsession.graduation.maxTurns');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error('AutoTutor runtime requires graduation.maxTurns to be a positive integer');
  }
  return {
    minExpectationScore,
    requireNoCurrentMisconceptions: requiredBoolean(
      graduation.requireNoCurrentMisconceptions,
      'autotutorsession.graduation.requireNoCurrentMisconceptions',
    ),
    maxTurns,
  };
}

function readAutoTutorConfig(): AutoTutorConfig {
  const tutor = getTutorFromSession();
  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};
  const unit = getCurrentUnit();
  const session = unit.autotutorsession as Record<string, unknown>;
  const clusterIndex = requiredNumber(session.cluster, 'autotutorsession.cluster');
  if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
    throw new Error('AutoTutor runtime requires autotutorsession.cluster to be a non-negative integer');
  }

  const cluster = getStimCluster(clusterIndex);
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
    prompt: requiredString(display.text, `cluster ${clusterIndex} display.text`),
    script: cloneJson(script as AutoTutorScript),
    unitName: typeof unit.unitname === 'string' ? unit.unitname : 'AutoTutor',
    clusterIndex,
  };
}

function createInitialState(script: AutoTutorScript): AutoTutorState {
  const expectations: AutoTutorState['expectations'] = {};
  for (const expectation of script.expectations) {
    expectations[expectation.id] = { current: false };
  }
  const misconceptions: AutoTutorState['misconceptions'] = {};
  for (const misconception of script.misconceptions || []) {
    misconceptions[misconception.id] = { current: false };
  }
  return {
    expectations,
    misconceptions,
    answerQuality: 'none',
    studentAskedQuestion: false,
    selectedMove: '',
    turnCount: 0,
    costUsd: 0,
    completed: false,
    stoppedByCost: false,
    dialogue: [],
  };
}

function summarizeState(state: AutoTutorState) {
  return {
    expectations: state.expectations,
    misconceptions: state.misconceptions,
    answerQuality: state.answerQuality,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove,
    turnCount: state.turnCount,
    costUsd: state.costUsd,
  };
}

function buildSystemPrompt(config: AutoTutorConfig): string {
  return [
    'You are the MoFaCTS AutoTutor controller and tutor voice for one learner.',
    'Evaluate the latest student answer against the authored AutoTutor script, update the tutor state, choose the next dialogue move, and write the next tutor utterance.',
    'Use AutoTutor-style expectation and misconception tutoring: ask short targeted prompts, give hints before assertions when the student is stuck, correct misconceptions briefly, and keep the learner doing the cognitive work.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_RESPONSE_ENVELOPE_SCHEMA, null, 2),
    'Include every authored expectation ID under stateUpdate.expectations and every authored misconception ID under stateUpdate.misconceptions on every turn.',
    'Do not invent expectation or misconception IDs.',
    'Keep tutorMessage concise, conversational, and addressed to the student.',
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function buildUserPrompt(studentAnswer: string, state: AutoTutorState): string {
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Prior tutor state:',
    JSON.stringify(summarizeState(state), null, 2),
    '',
    'Recent dialogue history:',
    JSON.stringify(state.dialogue.slice(-8), null, 2),
  ].join('\n');
}

function validateEnvelopeIds(envelope: AutoTutorResponseEnvelope, state: AutoTutorState): void {
  const expectationIds = Object.keys(state.expectations);
  const misconceptionIds = Object.keys(state.misconceptions);
  const returnedExpectationIds = Object.keys(envelope.stateUpdate.expectations);
  const returnedMisconceptionIds = Object.keys(envelope.stateUpdate.misconceptions);

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

function validateStateMapIds(
  value: unknown,
  expectedIds: string[],
  fieldName: 'expectations' | 'misconceptions',
): Record<string, { current: boolean; evidence?: string }> {
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

  const parsed: Record<string, { current: boolean; evidence?: string }> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.current !== 'boolean') {
      throw new Error(`AutoTutor saved history state.${fieldName}.${id}.current must be boolean`);
    }
    parsed[id] = {
      current: entry.current,
      ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
    };
  }
  return parsed;
}

function validateSavedState(state: AutoTutorHistoryNote['state'], expectedState: AutoTutorState): AutoTutorHistoryNote['state'] {
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
  return {
    expectations: validateStateMapIds(state.expectations, Object.keys(expectedState.expectations), 'expectations'),
    misconceptions: validateStateMapIds(state.misconceptions, Object.keys(expectedState.misconceptions), 'misconceptions'),
    answerQuality,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove,
    turnCount: state.turnCount,
    costUsd: state.costUsd,
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

async function callOpenRouter(config: AutoTutorConfig, state: AutoTutorState, studentAnswer: string) {
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
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        { role: 'user', content: buildUserPrompt(studentAnswer, state) },
      ],
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

function computeProgress(state: AutoTutorState): number {
  const expectationCount = Object.keys(state.expectations).length;
  if (expectationCount === 0) {
    throw new Error('AutoTutor state has no expectations');
  }
  const currentExpectations = Object.values(state.expectations).filter((entry) => entry.current).length;
  const currentMisconceptions = Object.values(state.misconceptions).filter((entry) => entry.current).length;
  return Math.max(0, currentExpectations - currentMisconceptions) / expectationCount;
}

function computeCompleted(state: AutoTutorState, graduation: AutoTutorGraduation): boolean {
  if (state.turnCount >= graduation.maxTurns) {
    return true;
  }
  const progress = computeProgress(state);
  const hasCurrentMisconceptions = Object.values(state.misconceptions).some((entry) => entry.current);
  return progress >= graduation.minExpectationScore &&
    (!graduation.requireNoCurrentMisconceptions || !hasCurrentMisconceptions);
}

function publishState(state: AutoTutorState): void {
  Session.set('autoTutorState', {
    ...summarizeState(state),
    completed: state.completed,
    stoppedByCost: state.stoppedByCost,
    progress: computeProgress(state),
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
  if (!isRecord(note) || note.kind !== 'autotutor' || note.schemaVersion !== 1 || !isRecord(note.state)) {
    throw new Error('AutoTutor history row CFNote has an invalid AutoTutor payload');
  }
  return note as AutoTutorHistoryNote;
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
  if (typeof latest.completed !== 'boolean' || typeof latest.stoppedByCost !== 'boolean') {
    throw new Error('AutoTutor saved history completion flags must be boolean');
  }
  const savedState = validateSavedState(latest.state, state);
  state.expectations = savedState.expectations;
  state.misconceptions = savedState.misconceptions;
  state.answerQuality = savedState.answerQuality;
  state.studentAskedQuestion = savedState.studentAskedQuestion;
  state.selectedMove = savedState.selectedMove;
  state.turnCount = savedState.turnCount;
  state.costUsd = savedState.costUsd;
  state.completed = latest.completed;
  state.stoppedByCost = latest.stoppedByCost;
  state.dialogue = dialogue;
}

async function loadSavedAutoTutorHistory(): Promise<AutoTutorHistoryRow[]> {
  const userId = Meteor.userId();
  const tdfId = Session.get('currentTdfId');
  const unitNumber = Number(Session.get('currentUnitNumber'));
  if (!userId || !tdfId || !Number.isInteger(unitNumber) || unitNumber < 0) {
    throw new Error('AutoTutor resume requires current user, TDF id, and unit number');
  }
  return await meteorCallAsync('getAutoTutorHistoryForUnit', userId, tdfId, unitNumber);
}

function buildHistoryNote(config: AutoTutorConfig, state: AutoTutorState, tutorMessage: string): AutoTutorHistoryNote {
  return {
    kind: 'autotutor',
    schemaVersion: 1,
    model: config.model,
    scriptId: config.script.id,
    state: summarizeState(state),
    progress: computeProgress(state),
    completed: state.completed,
    stoppedByCost: state.stoppedByCost,
    tutorMessage,
  };
}

async function insertAutoTutorHistoryTurn(config: AutoTutorConfig, state: AutoTutorState, args: {
  studentAnswer: string;
  tutorMessage: string;
  turnStartedAt: number;
  turnEndedAt: number;
}) {
  const currentTdfFile = Session.get('currentTdfFile');
  const tutor = currentTdfFile?.tdfs?.tutor;
  const unitNumber = Number(Session.get('currentUnitNumber'));
  const unit = tutor?.unit?.[unitNumber] || {};
  const unitName = typeof unit?.unitname === 'string' ? unit.unitname : config.unitName;
  const cluster = getStimCluster(config.clusterIndex) as { clusterKC?: unknown; stims?: unknown[] } | null;
  const stim = (cluster?.stims?.[0] || {}) as { _id?: unknown; stimulusKC?: unknown };
  const meteorUser = Meteor.user() as { username?: string; loginParams?: { entryPoint?: string } } | null;
  const sessionID = (new Date(args.turnStartedAt)).toUTCString().substr(0, 16) + ' ' + Session.get('currentTdfName');
  const note = buildHistoryNote(config, state, args.tutorMessage);

  await insertCompressedHistory({
    itemId: stim?._id || config.script.id,
    KCId: stim?.stimulusKC || config.script.id,
    userId: Meteor.userId(),
    TDFId: Session.get('currentTdfId'),
    outcome: state.completed ? 'correct' : 'incorrect',
    probabilityEstimate: null,
    typeOfResponse: 'autotutor-chat',
    responseValue: legacyTrim(args.studentAnswer),
    displayedStimulus: { text: config.prompt },
    sectionId: Session.get('curSectionId'),
    teacherId: Session.get('curTeacher')?._id,
    anonStudentId: meteorUser?.username,
    sessionID,
    conditionNameA: 'tdf file',
    conditionTypeA: Session.get('currentTdfName'),
    conditionNameB: 'xcondition',
    conditionTypeB: Session.get('experimentXCond') || null,
    conditionNameC: 'schedule condition',
    conditionTypeC: null,
    conditionNameD: 'how answered',
    conditionTypeD: 'autotutor-chat',
    conditionNameE: 'section',
    conditionTypeE: meteorUser?.loginParams?.entryPoint && meteorUser.loginParams.entryPoint !== 'direct'
      ? meteorUser.loginParams.entryPoint
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
    action: state.completed ? 'autotutor-complete' : 'autotutor-turn',
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
    feedbackType: state.completed ? 'correct' : 'autotutor',
    instructionQuestionResult: false,
    entryPoint: meteorUser?.loginParams?.entryPoint || '',
    eventType: 'autotutor-turn',
  });
}

export async function createAutoTutorRuntime(): Promise<AutoTutorRuntime> {
  const config = readAutoTutorConfig();
  const state = createInitialState(config.script);
  applySavedHistory(config, state, await loadSavedAutoTutorHistory());
  publishState(state);

  return {
    config,
    getState: () => cloneJson(state),
    getProgress: () => computeProgress(state),
    getDialogue: () => cloneJson(state.dialogue),
    async submitStudentAnswer(studentAnswer: string) {
      const cleanedAnswer = requiredString(studentAnswer, 'student answer');
      if (state.completed) {
        throw new Error('AutoTutor session is already complete');
      }
      if (state.costUsd > AUTO_TUTOR_COST_CAP_USD) {
        state.stoppedByCost = true;
        state.completed = true;
        publishState(state);
        return {
          message: 'We need to stop here because this AutoTutor session reached the configured cost cap.',
          completed: true,
          stoppedByCost: true,
        };
      }

      const turnStartedAt = Date.now();
      const result = await callOpenRouter(config, state, cleanedAnswer);
      const envelope = parseAutoTutorResponseEnvelope(result.content);
      validateEnvelopeIds(envelope, state);

      const nextState = cloneJson(state);
      nextState.costUsd += result.costUsd;
      nextState.expectations = envelope.stateUpdate.expectations;
      nextState.misconceptions = envelope.stateUpdate.misconceptions;
      nextState.answerQuality = envelope.stateUpdate.answerQuality;
      nextState.studentAskedQuestion = envelope.stateUpdate.studentAskedQuestion;
      nextState.selectedMove = envelope.stateUpdate.selectedMove;
      nextState.turnCount += 1;
      nextState.dialogue.push({ role: 'student', text: cleanedAnswer });

      if (nextState.costUsd > AUTO_TUTOR_COST_CAP_USD) {
        nextState.stoppedByCost = true;
        nextState.completed = true;
      } else {
        nextState.completed = computeCompleted(nextState, config.graduation);
      }
      const tutorMessage = nextState.stoppedByCost
        ? 'We need to stop here because this AutoTutor session reached the configured cost cap.'
        : (nextState.completed ? config.script.summary : envelope.tutorMessage);
      nextState.dialogue.push({ role: 'tutor', text: tutorMessage });
      const turnEndedAt = Date.now();
      await insertAutoTutorHistoryTurn(config, nextState, {
        studentAnswer: cleanedAnswer,
        tutorMessage,
        turnStartedAt,
        turnEndedAt,
      });
      Object.assign(state, nextState);
      publishState(state);

      return {
        message: tutorMessage,
        completed: state.completed,
        stoppedByCost: state.stoppedByCost,
      };
    },
  };
}
