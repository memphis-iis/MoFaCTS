/**
 * History Logging Service
 *
 * This ensures 100% data parity for research analysis and reporting.
 *
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { _ as underscore } from 'meteor/underscore';
type UnderscoreLike = {
  map<T, R>(arr: T[] | null | undefined, iteratee: (value: T) => R): R[];
};
const _ = underscore as unknown as UnderscoreLike;
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { CardStore } from '../../modules/cardStore';
import { getStimCluster, getStimCount } from '../../../../lib/currentTestingHelpers';
import { clientConsole } from '../../../../lib/clientLogger';
import { parseSchedItemCondition } from '../../../../lib/tdfUtils';
import { SCHEDULE_UNIT } from '../../../../../common/Definitions';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import {
  applyMappingRecordToSession,
  loadMappingRecord,
  resolveOriginalClusterIndex,
  validateMappingRecord,
} from './mappingRecordService';
import type {
  HistoryLoggingEvent,
  HistoryLoggingResult,
  HistoryRecord,
  TrialTimingSummary,
  UnitEngineLike,
} from '../../../../../common/types';

import { legacyTrim } from '../../../../../common/underscoreCompat';
type HistoryLoggingServiceContext = {
  testType: string;
  isCorrect: boolean;
  timestamps: {
    trialEnd: number;
    trialStart: number;
    firstKeypress: number;
    feedbackStart: number;
    feedbackEnd?: number;
  };
  source?: string;
  userAnswer?: string;
  deliverySettings: Record<string, unknown>;
  wasReportedForRemoval?: boolean;
  engine?: UnitEngineLike | null;
  currentDisplay?: Record<string, unknown> & {
    text?: string;
    clozeText?: string;
  };
  buttonList?: Array<Record<string, unknown>>;
  buttonTrial?: boolean;
  questionIndex?: number;
  alternateDisplayIndex?: number | null;
  reviewEntry?: string;
  originalAnswer?: unknown;
  currentAnswer?: unknown;
  feedbackText?: string;
  feedbackSuppressed?: boolean;
};
type HistoryAnswerContext = {
  originalDisplay?: unknown;
  originalAnswer?: unknown;
  currentAnswer?: unknown;
};
type HistoryEngineLike = UnitEngineLike & {
  findCurrentCardInfo: () => {
    whichStim: number;
    probabilityEstimate?: unknown;
  };
  unitType?: unknown;
};
type HistoryStimLike = {
  _id?: string;
  clusterKC?: string;
  stimulusKC?: string;
};
type H5PResultBatch = {
  contentId?: string;
  library?: string;
  widgetType?: string;
  completed?: boolean;
  passed?: boolean;
  score?: number;
  maxScore?: number;
  scaledScore?: number;
  responseSummary?: unknown;
  events?: Array<Record<string, unknown>>;
};

function getTrialSelection(wasButtonTrial: boolean): string {
  return wasButtonTrial ? 'multiple choice' : 'answer';
}

function getTrialAction(testType: string): string {
  return testType === 's' ? 'study' : 'respond';
}

function getTrialOutcome(testType: string, isCorrect: boolean): string {
  if (testType === 's') {
    return 'study';
  }
  return isCorrect ? 'correct' : 'incorrect';
}

function getDisplayedFeedbackText(testType: string, feedbackText?: string, feedbackSuppressed = false): string {
  if (testType === 't' || testType === 'h' || testType === 's') {
    return '';
  }

  if (feedbackSuppressed) {
    return '';
  }

  if (typeof feedbackText !== 'string' || legacyTrim(feedbackText) === '') {
    throw new Error('[History Logging] feedbackText missing before history write');
  }

  return feedbackText;
}

function getLoggedFeedbackType(testType: string, isCorrect: boolean, feedbackSuppressed = false): string {
  if (testType === 't' || testType === 'h' || testType === 's' || feedbackSuppressed) {
    return '';
  }
  return isCorrect ? 'correct' : 'incorrect';
}

function truncateToFiveDecimals(value: number): number {
  return Math.trunc(value * 100000) / 100000;
}

type HistoryClusterLike = {
  stims: HistoryStimLike[];
  clusterIndex?: number;
  shufIndex?: number;
};
type SessionWithAll = typeof Session & {
  all?: () => Record<string, unknown>;
};
type ConsoleWithLogs = Console & {
  logs?: unknown;
};
type MeteorAudioSettings = {
  audioInputMode?: boolean;
};
type MeteorUserLike = {
  username?: string;
  loginParams?: { entryPoint?: string };
  audioSettings?: MeteorAudioSettings;
};

function getMeteorUser(): MeteorUserLike | null | undefined {
  return Meteor.user() as MeteorUserLike | null | undefined;
}

/**
 * Check if a value appears to be an image file path.
 * Used for auto-detecting whether response type should be 'image' or 'text'.
 *
 * @param {string} value - The value to check
 * @returns {boolean} - True if value looks like an image path
 */
function isImagePath(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const imageExtensions = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i;
  return imageExtensions.test(value.trim());
}

/**
 * Find simplified question type string based on display properties.
 * Returns string like 'T' (text), 'I' (image), 'A' (audio), 'C' (cloze), 'V' (video), or 'NA'.
 * Multiple types concatenate (e.g., 'TI' for text + image).
 *
 * @param {Record<string, unknown>} currentDisplay - The display object
 * @returns {string} - Question type string
 */
function findQTypeSimpified(currentDisplay: Record<string, unknown>): string {
  let QTypes = '';

  if (currentDisplay.text) QTypes = QTypes + 'T'; // T for Text
  if (currentDisplay.imgSrc) QTypes = QTypes + 'I'; // I for Image
  if (currentDisplay.audioSrc) QTypes = QTypes + 'A'; // A for Audio
  if (currentDisplay.clozeText) QTypes = QTypes + 'C'; // C for Cloze
  if (currentDisplay.videoSrc) QTypes = QTypes + 'V'; // V for video

  if (QTypes == '') QTypes = 'NA'; // NA for Not Applicable

  return QTypes;
}

/**
 * Ensure cluster state is valid for logging.
 * Throws error if critical state is missing (prevents corrupt logs).
 *
 */
function ensureClusterStateForLogging() {
  const experimentState = ExperimentStateStore.get() || {};
  const mappingRecord = loadMappingRecord(experimentState);
  if (!mappingRecord) {
    clientConsole(1, '[History Logging] Cluster mapping missing when attempting to log answer - aborting log until restored');
    throw new Error('Cluster mapping not initialized');
  }
  applyMappingRecordToSession(mappingRecord);

  const setSpec = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec || {};
  const stimCount = getStimCount();
  if (!Number.isInteger(stimCount) || stimCount <= 0) {
    clientConsole(1, '[History Logging] Stim count unavailable when validating cluster mapping - aborting log');
    throw new Error('Stim count unavailable');
  }
  const mappingValid = validateMappingRecord(mappingRecord, stimCount, setSpec);
  if (!mappingValid) {
    clientConsole(1, '[History Logging] Cluster mapping invalid/incompatible for current setSpec - aborting log until mapping restored');
    throw new Error('Cluster mapping invalid');
  }

  let clusterIndex = Session.get('clusterIndex');
  const expShufIndex = (typeof experimentState.shufIndex === 'number')
    ? experimentState.shufIndex
    : experimentState.clusterIndex;

  if (typeof clusterIndex === 'undefined' && typeof expShufIndex === 'number') {
    Session.set('clusterIndex', expShufIndex);
    clusterIndex = expShufIndex;
  }

  if (typeof clusterIndex !== 'number') {
    clientConsole(1, '[History Logging] Cluster index missing when attempting to log answer - aborting log until restored');
    throw new Error('Cluster index not initialized');
  }

  const resolvedOriginalIndex = resolveOriginalClusterIndex(clusterIndex, mappingRecord);
  if (
    typeof resolvedOriginalIndex !== 'number' ||
    resolvedOriginalIndex < 0 ||
    resolvedOriginalIndex >= stimCount
  ) {
    clientConsole(1, '[History Logging] Cluster mapping out of range for current index - aborting log until mapping restored',
        clusterIndex, mappingRecord.mappingTable);
    throw new Error('Cluster mapping mismatch');
  }
}

/**
 * Calculate timing latencies based on test type.
 *
 * Test types:
 * - 's' (study): Only feedback latency (time viewing study material)
 * - 'd' (drill): All latencies calculated (start, response, feedback)
 * - 't' (test): No feedback shown, endLatency = 0, feedbackLatency = -1
 *
 *
 * @param {number} trialEndTimeStamp - When trial ended (answer submitted or timeout)
 * @param {number} trialStartTimeStamp - When trial started (question displayed)
 * @param {number} firstActionTimestamp - First keypress or button click (null if timeout)
 * @param {number} userFeedbackStart - When feedback started displaying
 * @param {number | undefined} reviewEnd - When feedback/review exposure ended
 * @param {string} testType - 's', 'd', or 't'
 * @returns {TrialTimingSummary} {responseDuration, startLatency, endLatency, feedbackLatency}
 */
export function calculateTrialTimings(
  trialEndTimeStamp: number,
  trialStartTimeStamp: number,
  firstActionTimestamp: number,
  userFeedbackStart: number,
  reviewEnd: number | undefined,
  testType: string
): TrialTimingSummary {
  let feedbackLatency;

  if (userFeedbackStart) {
    feedbackLatency = Number(reviewEnd) - userFeedbackStart;
  } else {
    feedbackLatency = 0;
  }

  // No-input trials (e.g., timeout) use submit time as first action for compatibility.
  const firstAction = firstActionTimestamp ?? trialEndTimeStamp;
  let responseDuration = trialEndTimeStamp - firstAction;
  let startLatency = firstAction - trialStartTimeStamp;
  let endLatency = trialEndTimeStamp - trialStartTimeStamp;

  // Validate timestamps
  const timestampsAreFinite = [firstAction, trialEndTimeStamp, trialStartTimeStamp]
    .every((value) => Number.isFinite(value));
  const feedbackTimingIsValid = !userFeedbackStart ||
    (Number.isFinite(userFeedbackStart) && Number.isFinite(reviewEnd) && feedbackLatency >= 0);
  if (!timestampsAreFinite || !feedbackTimingIsValid || firstAction < 0 || trialEndTimeStamp < 0 ||
    trialStartTimeStamp <= 0 || endLatency < 0) {

    const errorDescription = `One or more timestamps were set to 0 or null.
    firstActionTimestamp: ${firstActionTimestamp}
    trialEndTimeStamp: ${trialEndTimeStamp}
    trialStartTimeStamp: ${trialStartTimeStamp}
    userFeedbackStart: ${userFeedbackStart}
    reviewEnd: ${reviewEnd}`;

    clientConsole(1, '[History Logging] Invalid timestamps:', {
      responseDuration,
      startLatency,
      endLatency,
      firstActionTimestamp,
      trialEndTimeStamp,
      trialStartTimeStamp,
      userFeedbackStart,
      reviewEnd
    });

    // Report error to server
    const curUser = Meteor.userId();
    const curPage = document.location.pathname;
    const sessionVars = (Session as SessionWithAll).all?.() ?? {};
    const userAgent = navigator.userAgent;
    const logs = (console as ConsoleWithLogs).logs;
    const currentExperimentState = ExperimentStateStore.get();

    meteorCallAsync('sendUserErrorReport', curUser, errorDescription, curPage, sessionVars,
        userAgent, logs, currentExperimentState).catch((err: unknown) => {
      clientConsole(1, '[History Logging] Failed to send error report:', err);
    });

    throw new Error('Invalid timestamps - trial aborted');
  }

  // Adjust timing based on test type
  if (testType === 't' || testType === 'h') {
    // Test: no feedback shown
    endLatency = 0;
    feedbackLatency = -1;
  } else if (testType === 's') {
    // Study: only review latency (in endLatency)
    feedbackLatency = endLatency;
    endLatency = -1;
    startLatency = -1;
  }
  // Drill ('d'): all latencies calculated normally

  return { responseDuration, startLatency, endLatency, feedbackLatency };
}

/**
 * Check if audio input mode (SR) is enabled.
 * SR requires BOTH user preference AND TDF support.
 *
 * @returns {boolean} - True if SR is enabled
 */
function checkAudioInputMode(): boolean {
  const userAudioToggled = getMeteorUser()?.audioSettings?.audioInputMode || false;
  const tdfAudioEnabled = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.audioInputEnabled === 'true';
  return userAudioToggled && tdfAudioEnabled;
}

function recordSessionOutcomeHistories(testType: string, isCorrect: boolean): void {
  if (typeof testType !== 'string') {
    throw new Error('[History Logging] testType is missing or invalid');
  }
  const overallOutcomeHistory = Session.get('overallOutcomeHistory');
  if (!Array.isArray(overallOutcomeHistory)) {
    throw new Error('[History Logging] overallOutcomeHistory is not initialized');
  }

  if (testType !== 'i' && testType !== 's') {
    if (typeof isCorrect !== 'boolean') {
      throw new Error('[History Logging] isCorrect is invalid for outcome history update');
    }
    overallOutcomeHistory.push(isCorrect ? 1 : 0);
    Session.set('overallOutcomeHistory', overallOutcomeHistory);
  }

  const overallStudyHistory = Session.get('overallStudyHistory');
  if (!Array.isArray(overallStudyHistory)) {
    throw new Error('[History Logging] overallStudyHistory is not initialized');
  }

  if (testType === 's') {
    overallStudyHistory.push(1);
  }
  if (testType === 'd') {
    overallStudyHistory.push(0);
  }
  Session.set('overallStudyHistory', overallStudyHistory);
}

/**
 *
 * This function recreates the exact schema from gatherAnswerLogRecord with all ~60 fields.
 * DO NOT modify field names or types without updating both old and new cards.
 *
 *
 * @param {Object} params - Logging parameters
 * @param {number} params.trialEndTimeStamp - When trial ended
 * @param {number} params.trialStartTimeStamp - When trial started
 * @param {number} params.transactionTimeStamp - DataShop transaction time
 * @param {string} params.source - How answered ('keyboard', 'button', 'timeout', 'SR', 'simulation')
 * @param {string} params.userAnswer - User's answer (trimmed)
 * @param {boolean} params.isCorrect - Was answer correct
 * @param {string} params.testType - 's', 'd', or 't'
 * @param {Record<string, unknown>} params.deliverySettings - Delivery parameters object
 * @param {boolean} params.wasReportedForRemoval - Was item flagged for removal
 * @param {UnitEngineLike} params.engine - Unit engine instance
 * @param {Record<string, unknown>} params.currentDisplay - Display object
 * @param {Array<Record<string, unknown>>} params.buttonList - Button list (if button trial)
 * @param {boolean} params.wasButtonTrial - Was this a button trial
 * @param {number} params.questionIndex - Question index (1-based)
 * @param {number} params.alternateDisplayIndex - Alternate display index (if applicable)
 * @returns {HistoryRecord} answerLogRecord
 */
export function createHistoryRecord({
  trialEndTimeStamp,
  trialStartTimeStamp,
  transactionTimeStamp,
  source,
  userAnswer,
  isCorrect,
  testType,
  deliverySettings: _deliverySettings,
  wasReportedForRemoval = false,
  engine,
  currentDisplay,
  buttonList = [],
  wasButtonTrial = false,
  questionIndex = 1,
  alternateDisplayIndex = null,
  feedbackText = '',
  feedbackSuppressed = false,
  reviewEntry = '',
  answerContext = {}
}: {
  trialEndTimeStamp: number;
  trialStartTimeStamp: number;
  transactionTimeStamp: number;
  source: string;
  userAnswer: string;
  isCorrect: boolean;
  testType: string;
  deliverySettings: Record<string, unknown>;
  wasReportedForRemoval?: boolean;
  engine: HistoryEngineLike;
  currentDisplay: Record<string, unknown> | null | undefined;
  buttonList?: Array<Record<string, unknown>>;
  wasButtonTrial?: boolean;
  questionIndex?: number;
  alternateDisplayIndex?: number | null;
  feedbackText?: string;
  feedbackSuppressed?: boolean;
  reviewEntry?: string;
  answerContext?: HistoryAnswerContext;
}): HistoryRecord {
  // Validate critical state before proceeding
  ensureClusterStateForLogging();

  // Figure out button trial entries
  let buttonEntries = '';
  if (wasButtonTrial) {
    buttonEntries = _.map(buttonList, (val: Record<string, unknown>) => String(val.buttonValue || '')).join(',');
  }

  // Get cluster and stim info
  const clusterIndex = Session.get('clusterIndex');
  const cardInfo = engine.findCurrentCardInfo();
  const whichStim = typeof cardInfo.whichStim === 'number' ? cardInfo.whichStim : 0;
  const probabilityEstimate = typeof cardInfo.probabilityEstimate === 'number'
    ? truncateToFiveDecimals(cardInfo.probabilityEstimate)
    : cardInfo.probabilityEstimate;
  const cluster = getStimCluster(clusterIndex) as HistoryClusterLike;
  const { _id, clusterKC, stimulusKC } = cluster.stims[whichStim] || {};

  // Get TDF info
  const curTdf = Session.get('currentTdfFile');
  const unitNumber = Number(Session.get('currentUnitNumber') || 0);
  const unitName = legacyTrim(curTdf?.tdfs?.tutor?.unit?.[unitNumber]?.unitname || '');

  // Problem/step names
  const experimentState = (ExperimentStateStore.get() || {}) as Record<string, unknown>;
  const problemName = answerContext.originalDisplay ?? experimentState.originalDisplay;
  const stepName = problemName;  // Simplified (no step counting)

  // Determine indices based on unit type
  const isStudy = testType === 's';
  let shufIndex = clusterIndex;
  const rawClusterIndex = typeof cluster.clusterIndex === 'number' ? cluster.clusterIndex : clusterIndex;
  let stimFileIndex = rawClusterIndex;
  let schedCondition = 'N/A';

  const displayOrder = Number(CardStore.getQuestionIndex() || questionIndex);

  if (engine.unitType == SCHEDULE_UNIT) {
    const sched = Session.get('schedule');
    if (sched && sched.q && sched.q.length) {
      const schedItemIndex = displayOrder - 1;
      shufIndex = schedItemIndex;
      if (schedItemIndex >= 0 && schedItemIndex < sched.q.length) {
        schedCondition = parseSchedItemCondition(sched.q[schedItemIndex]?.condition);
        stimFileIndex = sched.q[schedItemIndex]?.clusterIndex;
      }
    }
  } else {
    shufIndex = cluster.shufIndex;
    stimFileIndex = rawClusterIndex;
  }

  // Get answers
  const originalAnswer = answerContext.originalAnswer ?? experimentState.originalAnswer;
  const currentAnswer = answerContext.currentAnswer ?? experimentState.currentAnswer;
  const fullAnswer = (typeof(originalAnswer) == 'undefined' || originalAnswer == '') ? currentAnswer : originalAnswer;
  const temp = legacyTrim((fullAnswer || '')).split('~');
  const correctAnswer = temp[0];

  // Clone and fill in display object
  if (!currentDisplay) {
    clientConsole(1, '[History Logging] currentDisplay is undefined in createHistoryRecord');
    return {} as HistoryRecord;
  }
  const filledInDisplay = JSON.parse(JSON.stringify(currentDisplay));
  if (filledInDisplay.attribution) {
    delete filledInDisplay.attribution;
  }

  if (filledInDisplay.clozeText) {
    filledInDisplay.clozeText = filledInDisplay.clozeText.replace(/___+/g, correctAnswer);
  }

  // Session ID (date + TDF name)
  const sessionID = (new Date(trialStartTimeStamp)).toUTCString().substr(0, 16) + ' ' + Session.get('currentTdfName');

  const outcome = getTrialOutcome(testType, isCorrect);
  const selection = getTrialSelection(wasButtonTrial);
  const action = getTrialAction(testType);

  const meteorUser = getMeteorUser();

  // Build complete record
  const answerLogRecord = {
    // Core IDs
    'itemId': _id,
    'KCId': stimulusKC,
    'userId': Meteor.userId(),
    'TDFId': Session.get('currentTdfId'),

    // Trial outcome
    'outcome': outcome,
    'probabilityEstimate': probabilityEstimate || null,

    // Response data
    'typeOfResponse': isImagePath(correctAnswer || '') ? 'image' : 'text',
    'responseValue': legacyTrim(userAnswer),
    'displayedStimulus': filledInDisplay,

    // User/section context
    'sectionId': Session.get('curSectionId'),
    'teacherId': Session.get('curTeacher')?._id,
    'anonStudentId': meteorUser?.username,
    'sessionID': sessionID,

    // Experimental conditions (5 types A-E)
    'conditionNameA': 'tdf file',
    'conditionTypeA': Session.get('currentTdfName'),
    'conditionNameB': 'xcondition',
    'conditionTypeB': Session.get('experimentXCond') || null,
    'conditionNameC': 'schedule condition',
    'conditionTypeC': schedCondition,
    'conditionNameD': 'how answered',
    'conditionTypeD': legacyTrim(source),
    'conditionNameE': 'section',
    'conditionTypeE': meteorUser?.loginParams?.entryPoint &&
        meteorUser.loginParams.entryPoint !== 'direct' ? meteorUser.loginParams.entryPoint : null,

    // Timing (will be filled in later)
    'responseDuration': null,

    // Unit/problem context
    'levelUnit': unitNumber,
    'levelUnitName': unitName,
    'levelUnitType': Session.get('unitType'),
    'problemName': problemName,
    'stepName': stepName,
    'time': transactionTimeStamp,
    'problemStartTime': trialStartTimeStamp,

    'selection': selection,
    'action': action,
    'input': legacyTrim(userAnswer),

    // Student response classification
    'studentResponseType': isStudy ? 'HINT_REQUEST' : 'ATTEMPT',
    'studentResponseSubtype': legacyTrim(findQTypeSimpified(currentDisplay)),
    'tutorResponseType': isStudy ? 'HINT_MSG' : 'RESULT',

    // Knowledge components (multiple types)
    'KCDefault': stimulusKC,
    'KCCategoryDefault': '',
    'KCCluster': clusterKC,
    'KCCategoryCluster': '',

    // Custom fields (CF prefix)
    'CFAudioInputEnabled': checkAudioInputMode(),
    'CFAudioOutputEnabled': Session.get('enableAudioPromptAndFeedback'),
    'CFDisplayOrder': displayOrder,
    'CFStimFileIndex': stimFileIndex,
    'CFSetShuffledIndex': shufIndex,
    'CFAlternateDisplayIndex': CardStore.getAlternateDisplayIndex() || alternateDisplayIndex || null,
    'CFStimulusVersion': whichStim,
    'CFCorrectAnswer': correctAnswer,
    'CFOverlearning': false,
    'CFResponseTime': trialEndTimeStamp,
    'CFStartLatency': null,  // Filled in later
    'CFEndLatency': null,    // Filled in later
    'CFFeedbackLatency': null,  // Filled in later
    'CFReviewEntry': legacyTrim(reviewEntry || ''),
    'CFButtonOrder': buttonEntries,
    'CFItemRemoved': wasReportedForRemoval,
    'CFNote': '',

    // Feedback
    'feedbackText': legacyTrim(feedbackText || ''),
    'feedbackType': getLoggedFeedbackType(testType, isCorrect, feedbackSuppressed),

    'instructionQuestionResult': Session.get('instructionQuestionResult') || false,

    // Entry point
    'entryPoint': meteorUser?.loginParams?.entryPoint || '',
    'eventType': ''
  };

  return answerLogRecord;
}

  /**
   * Insert history record via Meteor method.
   *
   * @param {HistoryRecord} answerLogRecord - Complete history record
   * @returns {Promise<void>}
   */
async function insertHistoryRecord(answerLogRecord: HistoryRecord): Promise<void> {
  try {
    await insertCompressedHistory(answerLogRecord as Record<string, unknown>);
  } catch (e) {
    clientConsole(1, '[History Logging] Error writing history record:', e);
    throw new Error('Error inserting history: ' + e);
  }
}

function getCurrentH5PResultBatch(display: Record<string, unknown> | undefined): H5PResultBatch | null {
  const h5p = display?.h5p as Record<string, unknown> | undefined;
  if (!h5p || h5p.sourceType !== 'self-hosted') {
    return null;
  }
  const batch = Session.get('currentH5PResultBatch') as H5PResultBatch | null;
  if (!batch || batch.contentId !== h5p.contentId) {
    return null;
  }
  return batch;
}

async function insertH5PHistoryRows(baseRecord: HistoryRecord, batch: H5PResultBatch): Promise<void> {
  const events = Array.isArray(batch.events) ? batch.events : [];
  const batchId = [
    baseRecord.TDFId,
    baseRecord.sessionID,
    baseRecord.levelUnit,
    baseRecord.levelUnitName,
    baseRecord.CFStimFileIndex,
    batch.contentId,
    baseRecord.problemStartTime,
  ].map((part) => String(part ?? '')).join('|');

  for (const [index, event] of events.entries()) {
    const eventIndex = Number.isFinite(Number(event.eventIndex)) ? Number(event.eventIndex) : index;
    const isCorrect = event.correct === true;
    const row: HistoryRecord = {
      ...baseRecord,
      input: String(event.response ?? batch.responseSummary ?? ''),
      outcome: isCorrect ? 'correct' : 'incorrect',
      typeOfResponse: 'h5p',
      responseValue: String(event.response ?? ''),
      selection: 'h5p interaction',
      action: 'h5p interaction',
      eventType: 'h5p',
      responseDuration: Number(event.latencyMs) || baseRecord.responseDuration,
      h5p: {
        contentId: batch.contentId,
        library: batch.library,
        widgetType: batch.widgetType,
        eventType: 'part',
        subContentId: event.partId,
        targetId: event.targetId,
        targetLabel: event.targetLabel,
        label: event.label,
        batchId,
        eventIndex,
        completed: batch.completed === true,
        passed: batch.passed,
        score: batch.score,
        maxScore: batch.maxScore,
        scaledScore: batch.scaledScore,
        response: event.response,
        correct: isCorrect,
        timestamp: event.timestamp,
        latencyMs: event.latencyMs,
        idempotencyKey: `${batchId}|${eventIndex}`,
      },
    };
    await insertHistoryRecord(row);
  }
}

/**
 * XState service for logging trial completion.
 * Invoked when transitioning out of feedback or test trial.
 *
 * Usage in cardMachine.js:
 * ```
 * invoke: {
 *   src: 'historyLoggingService',
 *   onDone: { target: 'transition', actions: 'onHistoryLogged' },
 *   onError: { target: 'error', actions: 'onHistoryError' }
 * }
 * ```
 */
/**
 * @param {HistoryLoggingContext} context
 * @param {HistoryLoggingEvent} event
 * @returns {Promise<HistoryLoggingResult>}
 */
export async function historyLoggingService(
  context: HistoryLoggingServiceContext,
  event: HistoryLoggingEvent
): Promise<HistoryLoggingResult> {
  try {
    

    if (!(event as Record<string, unknown>)?.skipOutcomeHistoryUpdate) {
      recordSessionOutcomeHistories(context.testType, context.isCorrect);
    }

    // Calculate timings
    const timings = calculateTrialTimings(
      context.timestamps.trialEnd,
      context.timestamps.trialStart,
      context.timestamps.firstKeypress,
      context.timestamps.feedbackStart,
      context.timestamps.feedbackEnd,
      context.testType
    );
    const transactionTimeStamp = context.testType === 's'
      ? context.timestamps.trialStart
      : context.timestamps.firstKeypress ?? context.timestamps.trialEnd;

    const feedbackText = getDisplayedFeedbackText(context.testType, context.feedbackText, context.feedbackSuppressed === true);

    const h5pBatch = getCurrentH5PResultBatch(context.currentDisplay);

    // Create record
    const engine = (event.engine || context.engine) as HistoryEngineLike;

    const record = createHistoryRecord({
      trialEndTimeStamp: context.timestamps.trialEnd,
      trialStartTimeStamp: context.timestamps.trialStart,
      transactionTimeStamp,
      source: context.source || 'keyboard',  // 'keyboard', 'button', 'timeout', 'SR', 'simulation'
      userAnswer: context.userAnswer || '',
      isCorrect: context.isCorrect,
      testType: context.testType,
      deliverySettings: context.deliverySettings,
      wasReportedForRemoval: context.wasReportedForRemoval || false,
      engine,
      currentDisplay: context.currentDisplay,
      buttonList: context.buttonList || [],
      wasButtonTrial: context.buttonTrial === true,
      questionIndex: context.questionIndex ?? 1,
      alternateDisplayIndex: context.alternateDisplayIndex ?? null,
      feedbackText,
      feedbackSuppressed: context.feedbackSuppressed === true,
      reviewEntry: context.reviewEntry || '',
      answerContext: {
        originalDisplay: context.currentDisplay?.text || context.currentDisplay?.clozeText || '',
        originalAnswer: context.originalAnswer,
        currentAnswer: context.currentAnswer,
      }
    });

    // Fill in timing fields
    record.responseDuration = timings.responseDuration;
    record.CFStartLatency = timings.startLatency;
    record.CFEndLatency = timings.endLatency;
    record.CFFeedbackLatency = timings.feedbackLatency;
    if (h5pBatch) {
      record.h5p = {
        contentId: h5pBatch.contentId,
        library: h5pBatch.library,
        widgetType: h5pBatch.widgetType,
        eventType: 'summary',
        completed: h5pBatch.completed === true,
        passed: h5pBatch.passed,
        score: h5pBatch.score,
        maxScore: h5pBatch.maxScore,
        scaledScore: h5pBatch.scaledScore,
        response: h5pBatch.responseSummary,
      };
    }

    // Insert record
    await insertHistoryRecord(record);
    if (h5pBatch) {
      await insertH5PHistoryRows(record, h5pBatch);
      Session.set('currentH5PResultBatch', null);
    }

    return { status: 'logged', record };
  } catch (error: unknown) {
    clientConsole(1, '[History Logging] Service error:', error);
    throw error;
  }
}
