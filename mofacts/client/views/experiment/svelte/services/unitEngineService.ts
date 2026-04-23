/**
 * Unit Engine Service
 *
 * Wraps existing unitEngine.js functionality for XState machine.
 * Handles card selection, scheduling, and adaptive learning algorithms.
 *
 * Reference:
 * - unitEngine.js (createScheduleUnit, createModelUnit, createEmptyUnit)
 */

import { Session } from 'meteor/session';
import { createScheduleUnit, createModelUnit, createEmptyUnit, createVideoUnit } from '../../unitEngine';
import { getStimCluster, getCurrentDeliveryParams } from '../../../../lib/currentTestingHelpers';
import { clientConsole } from '../../../../lib/clientLogger';
import { UiSettingsStore } from '../../../../lib/state/uiSettingsStore';
import { getEngine } from '../../../../lib/engineManager';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { computePracticeTimeMs } from '../../../../../lib/practiceTime';
import { calculateTrialTimings } from './historyLogging';
import { getExperimentState } from './experimentState';
import { sanitizeHTML, nextChar } from '../../../../lib/stringUtils';
import { Answers } from '../../answerAssess';
import { CardStore } from '../../modules/cardStore';
import { resolveDynamicAssetPath } from './mediaResolver';
import { sanitizeUiSettings } from '../utils/uiSettingsValidator';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../../../lib/idContext';
import type {
  EngineServiceResult,
  ExperimentState,
  SelectCardServiceEvent,
  UnitEngineLike,
  UpdateEngineServiceEvent,
} from '../../../../../common/types';

/**
 * Local runtime shapes used by the Svelte experiment layer.
 */
interface UnitEngineServiceContext extends Record<string, unknown> {
  engine?: UnitEngineLike | null;
  questionIndex?: number;
  isCorrect?: boolean;
  testType?: string;
  timestamps?: {
    trialEnd: number;
    trialStart: number;
    firstKeypress: number;
    feedbackStart: number;
    feedbackEnd?: number;
  };
  engineIndices?: {
    clusterIndex?: number;
    stimIndex?: number;
  };
  videoSession?: {
    pendingQuestionIndex?: number;
  };
}

interface UpdateEngineServiceContext extends UnitEngineServiceContext {
  timestamps: {
    trialEnd: number;
    trialStart: number;
    firstKeypress: number;
    feedbackStart: number;
    feedbackEnd?: number;
  };
}

interface StimResponseLike {
  incorrectResponses?: unknown;
}

interface StimLike extends Record<string, unknown> {
  _id?: unknown;
  display?: Record<string, unknown>;
  text?: string;
  textStimulus?: string;
  clozeText?: string;
  clozeStimulus?: string;
  imageStimulus?: string;
  audioStimulus?: string;
  videoStimulus?: string;
  correctResponse?: string;
  answer?: string;
  response?: string | StimResponseLike;
  testType?: string;
  incorrectResponses?: unknown;
  stimuliSetId?: unknown;
  stimulusKC?: unknown;
  clusterKC?: unknown;
  speechHintExclusionList?: string;
  probFunctionParameters?: unknown;
}

interface StimClusterLike extends Record<string, unknown> {
  stims: StimLike[];
  clusterKC?: unknown;
}

interface TdfUnitLike extends Record<string, unknown> {
  assessmentsession?: unknown;
  learningsession?: unknown;
  videosession?: unknown;
  unitname?: string;
  buttonorder?: string;
  buttonOptions?: unknown;
  isButtonTrial?: unknown;
  buttonTrial?: unknown;
  buttontrial?: unknown;
  uiSettings?: Record<string, unknown>;
}

interface TdfFileLike extends Record<string, unknown> {
  tdfs?: {
    tutor?: {
      unit?: TdfUnitLike[];
      title?: string;
      setspec?: {
        uiSettings?: Record<string, unknown>;
      };
    };
  };
  name?: string;
}

type RuntimeUiSettings = ReturnType<typeof sanitizeUiSettings> & {
  isVideoSession?: boolean;
  videoUrl?: string;
};

interface EngineCardInfo extends Record<string, unknown> {
  whichStim: number;
  probabilityEstimate?: unknown;
  clusterIndex?: number;
  forceButtonTrial?: boolean;
}

interface PreparedTrialContent extends Record<string, unknown> {
  currentDisplay?: Record<string, unknown>;
  currentAnswer?: string;
  originalAnswer?: string;
  buttonTrial?: boolean;
  buttonList?: unknown[];
  testType?: string;
  deliveryParams?: Record<string, unknown>;
  uiSettings?: Record<string, unknown>;
  setspec?: Record<string, unknown>;
  engineIndices?: Record<string, unknown> | null;
  engine?: UnitEngineLike | null;
  unitFinished?: boolean;
  questionIndex?: number;
  preparedAdvanceMode?: string;
  speechHintExclusionList?: string;
  preparedSelection?: Record<string, unknown> | null;
}

function requireScheduleDisplayQuestionIndex(selection: Record<string, unknown>): number {
  const scheduleIndex = Number(selection.scheduleIndex);
  if (!Number.isFinite(scheduleIndex) || scheduleIndex < 0) {
    throw new Error('Schedule selection must include a valid non-negative scheduleIndex');
  }
  return Math.floor(scheduleIndex) + 1;
}

function requireLiveScheduleDisplayQuestionIndex(): number {
  const questionIndex = Number(CardStore.getQuestionIndex());
  if (!Number.isFinite(questionIndex) || questionIndex < 1) {
    throw new Error('Schedule selection must publish a live display question index');
  }
  return Math.floor(questionIndex);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveStimAnswer(stim: StimLike): string {
  const candidates = [stim.correctResponse, stim.answer];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  if (typeof stim.response === 'string') {
    return stim.response;
  }
  return '';
}

function hasIncorrectResponses(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return false;
}

/**
 * Initialize unit engine based on TDF and unit type.
 * Creates schedule unit, model unit, or empty unit.
 *
 * @param {Record<string, unknown>} tdf - TDF object
 * @param {number} unitNumber - Unit index
 * @param {string} unitType - 'schedule', 'model', or other
 * @returns {Promise<UnitEngineLike>} Engine instance
 */
export async function initializeEngine(tdf: TdfFileLike, unitNumber: number, unitType: string) {
  assertIdInvariants('unitEngine.initializeEngine', { requireCurrentTdfId: true, requireStimuliSetId: false });
  

  // Validate inputs
  if (!tdf) {
    throw new Error('initializeEngine: tdf is null/undefined');
  }

  if (!Number.isInteger(unitNumber) || unitNumber < 0) {
    throw new Error(`initializeEngine: invalid unitNumber ${unitNumber}`);
  }

  const unit = tdf.tdfs?.tutor?.unit?.[unitNumber];
  if (!unit) {
    throw new Error(`initializeEngine: unit at index ${unitNumber} is null/undefined`);
  }

  

  const sessionUnitNumber = Session.get('currentUnitNumber');
  if (!Number.isInteger(sessionUnitNumber) || sessionUnitNumber !== unitNumber) {
    clientConsole(1, '[Unit Engine] Session currentUnitNumber mismatch - resetting', {
      sessionUnitNumber,
      unitNumber,
    });
    Session.set('currentUnitNumber', unitNumber);
  }

  // PHASE 8 FIX: Load experiment state and wrap in curExperimentData
  const experimentState = await getExperimentState();
  const normalizedExperimentState = experimentState || {};
  const curExperimentData = {
    experimentState: normalizedExperimentState, // Engine expects experimentState
    curExperimentState: normalizedExperimentState
  };

  

  let engine = null;

  if (unitType === 'schedule') {
    engine = await createScheduleUnit(curExperimentData);  // FIXED: 1 param with wrapper
    
  } else if (unitType === 'model') {
    engine = await createModelUnit(curExperimentData);     // FIXED: 1 param with wrapper
    
  } else if (unitType === 'video') {
    engine = await createVideoUnit(curExperimentData);
    
  } else if (unitType === 'instruction-only') {
    // ONLY create empty unit if explicitly marked as instruction-only
    
    engine = await createEmptyUnit(curExperimentData);     // FIXED: 1 param with wrapper
  } else {
    // NO SILENT FALLBACK - throw error for unknown types
    const availableTypes = [];
    if (unit.assessmentsession) availableTypes.push('assessmentsession');
    if (unit.learningsession) availableTypes.push('learningsession');
    if (unit.videosession) availableTypes.push('videosession');
    throw new Error(
      `initializeEngine: Unknown or undefined unit type "${unitType}" for unit "${unit.unitname}" at index ${unitNumber}. ` +
      `Expected 'schedule', 'model', or 'instruction-only'. ` +
      `Unit has: ${availableTypes.length ? availableTypes.join(', ') : 'no session types'}`
    );
  }

  
  return engine;
}

/**
 * @param {string} src
 * @returns {string}
 */
function resolveImageUrl(src: unknown, fallbackStimuliSetId: unknown = null): string {
  return resolveDynamicAssetPath(src, {
    logPrefix: '[Unit Engine]',
    fallbackStimuliSetId
  });
}

/**
 * Return first non-empty string from candidate list.
 */
function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function resolveStimMediaSource(
  stim: Record<string, unknown>,
  kind: 'image' | 'audio' | 'video'
): string {
  const displayObj = (stim.display && typeof stim.display === 'object')
    ? (stim.display as Record<string, unknown>)
    : {};

  if (kind === 'image') {
    return firstNonEmptyString(
      displayObj.imgSrc,
      stim.imageStimulus
    );
  }
  if (kind === 'audio') {
    return firstNonEmptyString(
      displayObj.audioSrc,
      stim.audioStimulus
    );
  }
  return firstNonEmptyString(
    displayObj.videoSrc,
    stim.videoStimulus
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isImagePath(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  const imageExtensions = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i;
  return imageExtensions.test(value.trim());
}

/**
 * @param {unknown} buttonOptions
 * @returns {string[]}
 */
function normalizeButtonOptions(buttonOptions: unknown): string[] {
  if (!buttonOptions) return [];
  if (Array.isArray(buttonOptions)) {
    return buttonOptions.slice();
  }
  if (typeof buttonOptions === 'string') {
    return buttonOptions.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (typeof buttonOptions === 'object') {
    return Array.isArray(buttonOptions) ? buttonOptions.slice() : [];
  }
  return [];
}

/**
 * @param {Record<string, unknown> | null | undefined} stim
 * @returns {Array<string | unknown>}
 */
function getStimIncorrectResponses(stim: Record<string, unknown> | null | undefined): Array<string | unknown> {
  if (!stim) return [];
  const response = stim.response as { incorrectResponses?: unknown } | undefined;
  const raw = stim.incorrectResponses ?? response?.incorrectResponses;
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' ? item.trim() : item)).filter(Boolean);
  }
  return [];
}

/**
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
function shuffleArray<T>(values: T[]): T[] {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * @param {{
 *   curUnit: Record<string, unknown> | null | undefined;
 *   stim: Record<string, unknown>;
 *   originalAnswer: string;
 *   correctAnswer: string;
 *   deliveryParams: Record<string, unknown> | null | undefined;
 * }} params
 * @returns {Array<{
 *   verbalChoice: string;
 *   buttonName: unknown;
 *   buttonValue: string;
 *   isImage: boolean;
 * }>}
 */
function buildButtonList({
  curUnit,
  stim,
  originalAnswer,
  correctAnswer,
  deliveryParams,
}: {
  curUnit: TdfUnitLike | null | undefined;
  stim: StimLike;
  originalAnswer: string;
  correctAnswer: string;
  deliveryParams: Record<string, unknown> | null | undefined;
}) {
  const buttonOrder = curUnit?.buttonorder ? curUnit.buttonorder.trim().toLowerCase() : '';
  const unitButtonOptions = normalizeButtonOptions(curUnit?.buttonOptions);
  let buttonChoices = [];
  let correctButtonPopulated = null;

  if (unitButtonOptions.length) {
    buttonChoices = unitButtonOptions;
    correctButtonPopulated = true;
  } else {
    buttonChoices = getStimIncorrectResponses(stim);
    correctButtonPopulated = false;
  }

  if (correctButtonPopulated === null) {
    throw new Error('Bad TDF/Stim file - no buttonOptions and no false responses');
  }

  const displayCorrectAnswer = Answers.getDisplayAnswerText(originalAnswer || correctAnswer || '');
  const wrongButtonLimitValue = deliveryParams?.falseAnswerLimit;
  const wrongButtonLimit = typeof wrongButtonLimitValue === 'number'
    ? wrongButtonLimitValue
    : Number(wrongButtonLimitValue);

  if (wrongButtonLimit) {
    let foundIsCurrentAnswer = undefined;
    let correctAnswerIndex = undefined;
    if (correctButtonPopulated) {
      correctAnswerIndex = buttonChoices.findIndex((answer) => {
        if (answer === originalAnswer) {
          foundIsCurrentAnswer = true;
          return true;
        }
        if (answer === displayCorrectAnswer) {
          foundIsCurrentAnswer = false;
          return true;
        }
        return false;
      });
      if (correctAnswerIndex !== -1) buttonChoices.splice(correctAnswerIndex, 1);
      else correctAnswerIndex = undefined;
    }

    const numberOfWrongButtonsToPrune = buttonChoices.length - wrongButtonLimit;
    for (let i = 0; i < numberOfWrongButtonsToPrune; i += 1) {
      const randomIndex = Math.floor(Math.random() * buttonChoices.length);
      buttonChoices.splice(randomIndex, 1);
    }

    if (correctAnswerIndex) {
      buttonChoices.unshift(foundIsCurrentAnswer ? originalAnswer : displayCorrectAnswer);
    }
  }

  if (!correctButtonPopulated) {
    buttonChoices.unshift(displayCorrectAnswer);
  }

  if (buttonOrder === 'random') {
    buttonChoices = shuffleArray(buttonChoices);
  }

  let curChar = 'a';
  return buttonChoices.map((value) => {
    const rawValue = value ?? '';
    const entry = {
      verbalChoice: curChar,
      buttonName: rawValue,
      buttonValue: sanitizeHTML(String(rawValue)),
      isImage: isImagePath(String(rawValue)),
    };
    curChar = nextChar(curChar);
    return entry;
  });
}

function buildCardDataFromResolvedTrial(params: {
  resolvedClusterIndex: number;
  whichStim: number;
  probabilityEstimate?: unknown;
  forceButtonTrial?: boolean;
  questionIndex: number;
  currentDisplay: Record<string, unknown>;
  fullAnswer: string;
  correctAnswer: string;
  testTypeOverride?: string;
}) {
  const {
    resolvedClusterIndex,
    whichStim,
    probabilityEstimate,
    forceButtonTrial,
    questionIndex,
    currentDisplay,
    fullAnswer,
    correctAnswer,
    testTypeOverride,
  } = params;
  const cluster = getStimCluster(resolvedClusterIndex) as StimClusterLike;
  const stim = cluster.stims[whichStim] as StimLike;
  const curUnit = Session.get('currentTdfUnit') as TdfUnitLike | null | undefined;
  let buttonTrial = false;

  if (typeof curUnit?.isButtonTrial === 'string' ||
      typeof curUnit?.buttonTrial === 'string' ||
      typeof curUnit?.buttontrial === 'string') {
    buttonTrial = (
      curUnit.isButtonTrial === 'true' ||
      curUnit.buttonTrial === 'true' ||
      curUnit.buttontrial === 'true'
    );
  } else if (typeof curUnit?.isButtonTrial === 'undefined' &&
             typeof curUnit?.buttonTrial === 'undefined' &&
             typeof curUnit?.buttontrial === 'undefined') {
    buttonTrial = false;
  } else {
    buttonTrial = Boolean(curUnit?.isButtonTrial || curUnit?.buttonTrial || curUnit?.buttontrial);
  }

  if (forceButtonTrial) {
    buttonTrial = true;
  } else if (
    hasIncorrectResponses(stim.incorrectResponses) ||
    (typeof stim.response === 'object' &&
      stim.response !== null &&
      hasIncorrectResponses((stim.response as StimResponseLike).incorrectResponses))
  ) {
    buttonTrial = true;
  } else {
    const currentUnitUsesSchedule = Boolean(curUnit?.assessmentsession);
    const schedule = currentUnitUsesSchedule ? Session.get('schedule') : null;
    if (schedule?.isButtonTrial) {
      buttonTrial = true;
    }
  }

  const deliveryParams = getCurrentDeliveryParams();
  const currentTdfFile = Session.get('currentTdfFile') as TdfFileLike | null | undefined;
  const currentTdfUnit = (Session.get('currentTdfUnit') as TdfUnitLike | null | undefined) || {};
  const existingUiSettings = (UiSettingsStore.get() || {}) as RuntimeUiSettings;
  const mergedUiSettings = {
    ...existingUiSettings,
    ...(currentTdfFile?.tdfs?.tutor?.setspec?.uiSettings || {}),
    ...(currentTdfUnit?.uiSettings || {}),
  };
  const tdfName = currentTdfFile?.tdfs?.tutor?.title || currentTdfFile?.name || '';
  const uiSettings = sanitizeUiSettings(mergedUiSettings, { tdfName, silent: true }) as RuntimeUiSettings;
  if (Session.get('isVideoSession') === true) {
    uiSettings.isVideoSession = true;
    if (
      (typeof uiSettings.videoUrl !== 'string' || uiSettings.videoUrl.trim().length === 0) &&
      typeof existingUiSettings.videoUrl === 'string' &&
      existingUiSettings.videoUrl.trim().length > 0
    ) {
      uiSettings.videoUrl = existingUiSettings.videoUrl;
    }
  }
  const setspec = currentTdfFile?.tdfs?.tutor?.setspec || {};

  const sessionTestType = typeof Session.get('testType') === 'string'
    ? String(Session.get('testType')).trim().toLowerCase()
    : '';
  const stimTestType = typeof stim.testType === 'string'
    ? String(stim.testType).trim().toLowerCase()
    : '';
  const testType = testTypeOverride || stimTestType || sessionTestType || 'd';

  const buttonList = buttonTrial
    ? buildButtonList({
        curUnit,
        stim,
        originalAnswer: fullAnswer,
        correctAnswer,
        deliveryParams,
      })
    : [];

  return {
    currentDisplay,
    originalAnswer: fullAnswer,
    currentAnswer: correctAnswer,
    questionIndex,
    testType,
    buttonTrial,
    buttonList,
    deliveryParams,
    uiSettings,
    setspec,
    engineIndices: {
      clusterIndex: resolvedClusterIndex,
      stimIndex: whichStim,
      whichStim,
      probabilityEstimate,
    },
    itemId: stim._id,
    stimulusKC: stim.stimulusKC,
    clusterKC: stim.clusterKC || cluster.clusterKC,
    speechHintExclusionList: stim.speechHintExclusionList || '',
  };
}

function getPreparedCardDataFromSelection(
  engine: UnitEngineLike,
  selection: Record<string, unknown>,
  questionIndex: number,
) {
  const resolvedClusterIndex = Number(selection.clusterIndex ?? 0);
  const whichStim = Number(selection.stimIndex ?? selection.whichStim ?? 0);
  const cluster = getStimCluster(resolvedClusterIndex) as StimClusterLike;
  const stim = cluster.stims[whichStim] as StimLike;
  const preparedState = (selection.preparedState || selection.currentPreparedState || {}) as Record<string, unknown>;
  const stimScopedSetId = stim?.stimuliSetId ?? Session.get('currentStimuliSetId') ?? null;
  const rawImgSrc = resolveStimMediaSource(stim, 'image');
  const rawVideoSrc = resolveStimMediaSource(stim, 'video');
  const rawAudioSrc = resolveStimMediaSource(stim, 'audio');
  const preparedDisplay = (preparedState.currentDisplay || preparedState.currentDisplayEngine || {}) as Record<string, unknown>;
  const currentDisplay = {
    text: String(preparedDisplay.text ?? stim.display?.text ?? stim.text ?? stim.textStimulus ?? ''),
    clozeText: String(preparedDisplay.clozeText ?? stim.display?.clozeText ?? stim.clozeText ?? stim.clozeStimulus ?? ''),
    imgSrc: typeof preparedDisplay.imgSrc === 'string' && preparedDisplay.imgSrc.trim().length > 0
      ? preparedDisplay.imgSrc
      : resolveImageUrl(rawImgSrc, stimScopedSetId),
    videoSrc: typeof preparedDisplay.videoSrc === 'string' && preparedDisplay.videoSrc.trim().length > 0
      ? preparedDisplay.videoSrc
      : resolveImageUrl(rawVideoSrc, stimScopedSetId),
    audioSrc: typeof preparedDisplay.audioSrc === 'string' && preparedDisplay.audioSrc.trim().length > 0
      ? preparedDisplay.audioSrc
      : resolveImageUrl(rawAudioSrc, stimScopedSetId),
  };
  const fullAnswer = typeof preparedState.newExperimentState === 'object' &&
    typeof (preparedState.newExperimentState as Record<string, unknown>).originalAnswer === 'string'
    ? String((preparedState.newExperimentState as Record<string, unknown>).originalAnswer)
    : resolveStimAnswer(stim);
  const correctAnswer = typeof preparedState.currentAnswer === 'string'
    ? String(preparedState.currentAnswer)
    : (fullAnswer.split('~')[0] ?? '').trim();

  return buildCardDataFromResolvedTrial({
    resolvedClusterIndex,
    whichStim,
    probabilityEstimate: selection.probabilityEstimate,
    forceButtonTrial: selection.forceButtonTrial === true,
    questionIndex,
    currentDisplay,
    fullAnswer,
    correctAnswer,
    ...(typeof selection.testType === 'string'
      ? { testTypeOverride: selection.testType }
      : {}),
  });
}

function buildPreparedTrialPayload(params: {
  engine: UnitEngineLike;
  selection: Record<string, unknown>;
  questionIndex: number;
  preparedAdvanceMode: 'seamless' | 'fallback';
}): PreparedTrialContent {
  const { engine, selection, questionIndex, preparedAdvanceMode } = params;
  const resolvedQuestionIndex = engine.unitType === 'schedule'
    ? requireScheduleDisplayQuestionIndex(selection)
    : questionIndex;
  return {
    ...getPreparedCardDataFromSelection(engine, selection, resolvedQuestionIndex),
    engine,
    unitFinished: false,
    preparedAdvanceMode,
    questionIndex: resolvedQuestionIndex,
    preparedSelection: selection,
  };
}

async function prepareLockedNextTrial(
  engine: UnitEngineLike,
  context: UnitEngineServiceContext,
  curExperimentState: ExperimentState,
  questionIndex: number,
): Promise<PreparedTrialContent | null> {
  const existingPrepared = typeof engine.getPreparedNextTrialContent === 'function'
    ? engine.getPreparedNextTrialContent()
    : (engine.nextTrialContent || null);
  if (existingPrepared) {
    return {
      ...existingPrepared,
      engine,
      unitFinished: false,
      preparedAdvanceMode: 'seamless',
      questionIndex,
      preparedSelection: (existingPrepared as PreparedTrialContent).preparedSelection || engine._lockedNextSelection || null,
    };
  }

  if (typeof engine.lockNextCardEarly !== 'function') {
    return null;
  }

  const currentCardRef = engine.currentCardRef || {
    clusterIndex: context.engineIndices?.clusterIndex,
    stimIndex: context.engineIndices?.stimIndex,
  };
  const ownerToken = engine.currentCardOwnerToken || null;
  const selection = await engine.lockNextCardEarly(undefined, curExperimentState, {
    currentCardRef,
    ownerToken,
  });
  if (!selection) {
    return null;
  }

  const preparedPayload = buildPreparedTrialPayload({
    engine,
    selection,
    questionIndex,
    preparedAdvanceMode: 'seamless',
  });
  if (typeof engine.setPreparedNextTrialContent === 'function') {
    engine.setPreparedNextTrialContent(preparedPayload);
  } else {
    engine.nextTrialContent = preparedPayload;
  }
  return preparedPayload;
}

async function prepareNextScheduledTrial(
  engine: UnitEngineLike,
  questionIndex: number,
): Promise<PreparedTrialContent | null> {
  if (typeof engine.prepareNextScheduledCard !== 'function') {
    return null;
  }

  const selection = await engine.prepareNextScheduledCard();
  if (!selection) {
    return null;
  }

  return buildPreparedTrialPayload({
    engine,
    selection,
    questionIndex,
    preparedAdvanceMode: 'fallback',
  });
}

/**
 * Get card data from engine for display.
 * Extracts stim, answer, display type, buttons, etc.
 *
 * @param {UnitEngineLike} engine - Unit engine instance
 * @param {number} clusterIndex - Current cluster index
 * @param {number} questionIndex - Current question index (1-based)
 * @returns {Record<string, unknown>} Card data for machine context
 */
export function getCardDataFromEngine(engine: UnitEngineLike, clusterIndex: number, questionIndex: number) {
  // Get current card info from engine
  const { whichStim, probabilityEstimate, clusterIndex: engineClusterIndex, forceButtonTrial } =
    engine.findCurrentCardInfo?.() as EngineCardInfo;
  const resolvedClusterIndex = engineClusterIndex ?? clusterIndex ?? 0;
  return getPreparedCardDataFromSelection(
    engine,
    {
      clusterIndex: resolvedClusterIndex,
      stimIndex: whichStim,
      probabilityEstimate,
      forceButtonTrial,
      currentPreparedState: (engine as UnitEngineLike & { currentPreparedState?: Record<string, unknown> | null }).currentPreparedState,
    },
    questionIndex,
  );
}

/**
 * Check if unit is finished.
 * Unit is finished when engine has no more cards to show.
 *
 * @param {UnitEngineLike | null | undefined} engine - Unit engine instance
 * @returns {boolean} True if unit is finished
 */
async function isUnitFinished(engine: UnitEngineLike | null | undefined) {
  if (!engine) {
    clientConsole(1, '[Unit Engine] No engine - assuming unit finished');
    return true;
  }

  // Check if engine has unitFinished method/property
  if (typeof engine.unitFinished === 'function') {
    return await engine.unitFinished();
  } else if (typeof engine.unitFinished === 'boolean') {
    return engine.unitFinished;
  }

  // Fallback: check if current index is beyond bounds
  const currentIndex = engine.currentIndex || 0;
  const totalCards = engine.totalCards || 0;

  return currentIndex >= totalCards;
}

/**
 * Advance engine to next card.
 * Updates engine state based on performance.
 *
 * @param {UnitEngineLike | null | undefined} engine - Unit engine instance
 * @param {boolean} isCorrect - Was last answer correct
 * @param {number} responseTime - Response time in ms
 * @returns {void}
 */
function advanceEngine(engine: UnitEngineLike | null | undefined, isCorrect: boolean, responseTime: number): void {
  if (!engine) {
    clientConsole(1, '[Unit Engine] No engine - cannot advance');
    return;
  }

  // Call engine's advance method (varies by engine type)
  if (typeof engine.advance === 'function') {
    engine.advance(isCorrect, responseTime);
  } else if (typeof engine.next === 'function') {
    engine.next();
  } else {
    clientConsole(1, '[Unit Engine] Engine has no advance/next method');
  }
}

function isPreparedAdvanceEligible(
  engine: UnitEngineLike | null | undefined,
  context?: UnitEngineServiceContext | UpdateEngineServiceContext,
): boolean {
  if (!engine || engine.unitType !== 'model') {
    return false;
  }
  if (Session.get('isVideoSession') === true) {
    return false;
  }
  if (Session.get('resumeToQuestion') === true || Session.get('resumeInProgress') === true) {
    return false;
  }
  if (context?.videoSession?.pendingQuestionIndex !== undefined && context?.videoSession?.pendingQuestionIndex !== null) {
    return false;
  }
  return true;
}

export function clearPreparedNextRuntimeState(
  engine: UnitEngineLike | null | undefined,
  reason = 'runtime-reset',
): void {
  if (!engine) {
    return;
  }
  if (typeof engine.clearRuntimeNextCardState === 'function') {
    engine.clearRuntimeNextCardState(reason);
    return;
  }
  if (typeof engine.clearLockedNextCard === 'function') {
    engine.clearLockedNextCard(reason);
  }
  engine.nextTrialContent = null;
}

export function startEarlyLockForCurrentTrial(
  context: UnitEngineServiceContext,
  engineArg?: UnitEngineLike | null | undefined,
): void {
  const engine = (engineArg || context.engine || getEngine()) as UnitEngineLike | null | undefined;
  if (!isPreparedAdvanceEligible(engine, context) || typeof engine?.lockNextCardEarly !== 'function') {
    return;
  }

  const currentCardRef = engine.currentCardRef || {
    clusterIndex: context.engineIndices?.clusterIndex,
    stimIndex: context.engineIndices?.stimIndex,
  };
  const ownerToken = engine.currentCardOwnerToken || null;
  const nextQuestionIndex = Number.isFinite(context.questionIndex) ? Number(context.questionIndex) + 1 : 1;
  void engine.lockNextCardEarly(undefined, ExperimentStateStore.get(), {
    currentCardRef,
    ownerToken,
  })
    .then((selection) => {
      if (!selection || !engine || typeof engine.setPreparedNextTrialContent !== 'function') {
        return;
      }
      const lockedOwnerToken = typeof selection.ownerToken === 'string' ? selection.ownerToken : null;
      if (lockedOwnerToken && engine.currentCardOwnerToken && lockedOwnerToken !== engine.currentCardOwnerToken) {
        return;
      }
      const nextTrialContent = getPreparedCardDataFromSelection(engine, selection, nextQuestionIndex);
      engine.setPreparedNextTrialContent({
        ...nextTrialContent,
        preparedAdvanceMode: 'seamless',
        questionIndex: nextQuestionIndex,
        preparedSelection: selection,
      });
      clientConsole(2, '[EARLY LOCK] nextTrialContent ready', {
        clusterIndex: selection.clusterIndex,
        stimIndex: selection.stimIndex,
        ownerToken: lockedOwnerToken,
      });
    })
    .catch((error: unknown) => {
      clientConsole(1, '[EARLY LOCK] Failed to prepare locked next card:', error);
    });
}

export async function prepareIncomingTrialService(
  context: UnitEngineServiceContext,
  event: SelectCardServiceEvent | UpdateEngineServiceEvent | Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const engine = (event?.engine || context.engine || getEngine()) as UnitEngineLike | null | undefined;
  if (!engine) {
    throw new Error('No engine available for prepared incoming trial');
  }

  const nextQuestionIndex = Number.isFinite(context.questionIndex) ? Number(context.questionIndex) + 1 : 1;
  const curExperimentState = (ExperimentStateStore.get() || {}) as ExperimentState;
  if (engine.unitType === 'model') {
    const preparedTrial = await prepareLockedNextTrial(engine, context, curExperimentState, nextQuestionIndex);
    if (preparedTrial) {
      return preparedTrial;
    }
  }

  if (engine.unitType === 'schedule') {
    const preparedTrial = await prepareNextScheduledTrial(engine, nextQuestionIndex);
    if (preparedTrial) {
      return preparedTrial;
    }
  }

  return {
    unitFinished: await isUnitFinished(engine),
    preparedAdvanceMode: engine.unitType === 'model' ? 'seamless' : 'fallback',
    engine,
    questionIndex: nextQuestionIndex,
  };
}

export function commitPreparedTrialRuntime(
  context: { preparedTrial?: Record<string, unknown> | null; engine?: UnitEngineLike | null | undefined },
): void {
  const preparedTrial = (context.preparedTrial || null) as PreparedTrialContent | null;
  if (!preparedTrial) {
    return;
  }

  const engine = (preparedTrial.engine || context.engine || getEngine()) as UnitEngineLike | null | undefined;
  const curExperimentState = (ExperimentStateStore.get() || {}) as ExperimentState;
  const preparedSelection = preparedTrial.preparedSelection || null;
  let committed = false;

  if (engine?.unitType === 'model' && typeof engine.commitLockedNextCard === 'function') {
    committed = engine.commitLockedNextCard(curExperimentState);
  } else if (engine?.unitType === 'schedule' && typeof engine.commitPreparedScheduledCard === 'function') {
    committed = engine.commitPreparedScheduledCard(preparedSelection || preparedTrial);
  }

  if (!committed) {
    throw new Error(`Prepared trial commit failed for unit type "${engine?.unitType || 'unknown'}"`);
  }

  CardStore.setButtonTrial(Boolean(preparedTrial.buttonTrial));
  CardStore.setButtonList(Array.isArray(preparedTrial.buttonList) ? preparedTrial.buttonList : []);
  if (preparedTrial.deliveryParams) {
    Session.set('currentDeliveryParams', preparedTrial.deliveryParams);
  }
  if (preparedTrial.engineIndices) {
    const { clusterIndex, whichStim, stimIndex } = preparedTrial.engineIndices;
    if (typeof clusterIndex === 'number') Session.set('clusterIndex', clusterIndex);
    if (typeof whichStim === 'number') Session.set('whichStim', whichStim);
    if (typeof stimIndex === 'number') Session.set('stimIndex', stimIndex);
  }
  const questionIndex = preparedTrial.questionIndex;
  if (typeof questionIndex === 'number') {
    CardStore.setQuestionIndex(questionIndex);
  }
  Session.set('currentAnswer', preparedTrial.currentAnswer || '');

  if (typeof engine?.setPreparedNextTrialContent === 'function') {
    engine.setPreparedNextTrialContent(null);
  } else if (engine) {
    engine.nextTrialContent = null;
  }
}

/**
 * XState service for selecting next card (Promise-based for invoke.onDone).
 * Used by cardMachine.js in presenting.loading state.
 *
 * Flow:
 * 1. Call engine.selectNextCard() to prepare next trial (sets internal state)
 * 2. Call getCardDataFromEngine() to extract display, answer, buttons, etc.
 * 3. Return complete card data to machine
 *
 * @param {UnitEngineServiceContext} context - Machine context
 * @param {SelectCardServiceEvent} event - Event that triggered the service (contains engine, sessionId, etc.)
 * @returns {Promise<Record<string, unknown>>} Card data object
 */
export async function selectCardService(
  context: UnitEngineServiceContext,
  event: SelectCardServiceEvent
): Promise<Record<string, unknown>> {
  try {
    assertIdInvariants('unitEngine.selectCardService', { requireCurrentTdfId: true, requireStimuliSetId: false });
    
    // Service wrapper passes invoke input as "event", and the original machine
    // event is nested under event.event.
    const machineEvent = (event?.event || event || {}) as Record<string, unknown>;

    // Get engine from event data, context, or global engineManager
    const engine = (event.engine || context.engine || getEngine()) as UnitEngineLike | null | undefined;
    const pendingVideoQuestionIndex = context?.videoSession?.pendingQuestionIndex;
    const resolvedVideoClusterIndex = getFiniteNumber(pendingVideoQuestionIndex);
    const eventClusterIndex = getFiniteNumber(machineEvent.clusterIndex);
    const contextClusterIndex = getFiniteNumber(context.engineIndices?.clusterIndex);
    const sessionClusterIndex = getFiniteNumber(Session.get('clusterIndex')) ?? 0;
    const clusterIndex = eventClusterIndex !== undefined
      ? eventClusterIndex
      : resolvedVideoClusterIndex !== undefined
        ? resolvedVideoClusterIndex
        : contextClusterIndex !== undefined
          ? contextClusterIndex
          : sessionClusterIndex;
    const eventQuestionIndex = getFiniteNumber(machineEvent.questionIndex);
    const questionIndex = eventQuestionIndex !== undefined
      ? eventQuestionIndex
      : (context.questionIndex || 1);
    let engineIndices = Session.get('engineIndices');
    if (Session.get('isVideoSession') && Number.isFinite(resolvedVideoClusterIndex)) {
      engineIndices = { clusterIndex: resolvedVideoClusterIndex, stimIndex: 0 };
      Session.set('engineIndices', engineIndices);
    }
    const resumeRequested = Session.get('resumeToQuestion') === true;
    const isVideoCheckpointSelection = machineEvent?.type === 'VIDEO_CHECKPOINT' ||
      Number.isFinite(resolvedVideoClusterIndex);
    const isResume = resumeRequested && !isVideoCheckpointSelection;
    if (resumeRequested && isVideoCheckpointSelection) {
      Session.set('resumeToQuestion', false);
    }
    if (machineEvent?.type === 'START' || isResume) {
      clearPreparedNextRuntimeState(engine, isResume ? 'resume-entry' : 'start-entry');
    }
    /** @type {ExperimentState} */
    const curExperimentState = (ExperimentStateStore.get() || {}) as ExperimentState;
    if (!Session.get('currentTdfId')) {
      logIdInvariantBreachOnce('unitEngine.selectCardService:missing-currentTdfId');
    }

    if (!engine) {
      throw new Error('No engine available for card selection (check engineManager)');
    }
    if (typeof engine.selectNextCard !== 'function') {
      throw new Error('Engine is missing selectNextCard');
    }

    

    // Check if unit is finished
    if (await isUnitFinished(engine)) {
      
      return {
        unitFinished: true,
        currentDisplay: { text: '' },
        originalAnswer: '',
        currentAnswer: '',
        testType: 'd',
        buttonTrial: false,
        buttonList: [],
        deliveryParams: getCurrentDeliveryParams(),
        uiSettings: UiSettingsStore.get() || {},
        engineIndices: { clusterIndex },
        questionIndex,
        engine
      };
    }

    // CRITICAL: Call engine.selectNextCard() first to prepare internal state
    // This must be called before getCardDataFromEngine() which calls findCurrentCardInfo()
    if (isResume) {
      await engine.selectNextCard(engineIndices, curExperimentState);
      Session.set('resumeToQuestion', false);
    } else {
      if (typeof engine.clearPrefetchedNextCard === 'function') {
        engine.clearPrefetchedNextCard();
      }

      await engine.selectNextCard(engineIndices, curExperimentState);
    }

    // Schedule units maintain the live pointer in CardStore during selectNextCard().
    // Use that runtime pointer as the exported question index so resume/start logic
    // cannot overwrite the fixed schedule position with a stale machine counter.
    const exportedQuestionIndex = engine.unitType === 'schedule'
      ? requireLiveScheduleDisplayQuestionIndex()
      : questionIndex;

    // Now get card data (engine has prepared internal state)
    const cardData = getCardDataFromEngine(engine, clusterIndex, exportedQuestionIndex);

    

    // Return complete card data (available as event.output in onDone)
    return {
      ...cardData,
      unitFinished: false,
      engine // Pass engine back to update context
    };
  } catch (error: unknown) {
    clientConsole(1, '[Unit Engine] Error selecting card:', error);
    throw error; // Will trigger onError in machine
  }
}


/**
 * XState service for updating engine after trial completion.
 * Records performance and updates adaptive algorithm.
 *
 * Usage in cardMachine.js:
 * ```
 * invoke: {
 *   src: 'updateEngineService',
 *   data: {
 *     engine: context.engine,
 *     isCorrect: context.isCorrect,
 *     responseTime: context.timestamps.trialEnd - context.timestamps.trialStart
 *   },
 *   onDone: { actions: 'onEngineUpdated' },
 *   onError: { target: 'error', actions: 'onEngineUpdateError' }
 * }
 * ```
 *
 * @param {UnitEngineServiceContext} context - Machine context
 * @param {UpdateEngineServiceEvent} event - Event payload
 * @returns {Promise<EngineServiceResult>} Status result
 */
export async function updateEngineService(
  context: UpdateEngineServiceContext,
  event: UpdateEngineServiceEvent
): Promise<EngineServiceResult> {
  try {
    

    const engine = (event.engine || context.engine) as UnitEngineLike | null | undefined;
    const isCorrect = event.isCorrect !== undefined ? event.isCorrect : Boolean(context.isCorrect);
    const responseTime = event.responseTime || 0;
    const testType = context.testType || 'd';

    

    if (!engine) {
      clientConsole(1, '[Unit Engine] No engine - skipping update');
      return { status: 'skipped' };
    }

    if (typeof engine.cardAnswered === 'function') {
      const timings = calculateTrialTimings(
        context.timestamps.trialEnd,
        context.timestamps.trialStart,
        context.timestamps.firstKeypress,
        context.timestamps.feedbackStart,
        context.timestamps.feedbackEnd,
        testType
      );
      const practiceTime = computePracticeTimeMs(timings.endLatency, timings.feedbackLatency);
      
      await engine.cardAnswered(isCorrect, practiceTime, testType);

      if (!Session.get('isVideoSession')) {
        if (engine.unitType === 'model' && engine.currentCardRef) {
          Session.set('engineIndices', {
            clusterIndex: engine.currentCardRef.clusterIndex,
            stimIndex: engine.currentCardRef.stimIndex,
          });
        } else {
          Session.set('engineIndices', undefined);
        }
      }
    } else {
      advanceEngine(engine, isCorrect, responseTime);
    }

    // MEDIUM FIX #1: Check if unit is finished after updating engine
    // This prevents the machine from looping to display an empty card
    // after the last trial. Without this check, unitFinished only comes
    // from selectCardService (pre-trial), causing one extra loop.
    const unitFinished = await isUnitFinished(engine);
    if (unitFinished) {
      clearPreparedNextRuntimeState(engine, 'unit-finished-after-answer');
    }

    
    return { status: 'updated', unitFinished };
  } catch (error: unknown) {
    clientConsole(1, '[Unit Engine] Error updating engine:', error);
    return { status: 'error', error: getErrorMessage(error) };
  }
}





