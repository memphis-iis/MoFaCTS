/**
 * Svelte Card Initialization
 *
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../index';
import { checkUserSession, clientConsole, startSessionCheckInterval } from '../../../../lib/userSessionHelpers';
import { ensureStimDisplayTypeMapReady, startStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
import {
  getCurrentDeliveryParams,
  getUserDisplayIdentifier,
  setStudentPerformance,
  getStimCount,
  extractDelimFields,
  rangeVal
} from '../../../../lib/currentTestingHelpers';
import { DeliveryParamsStore } from '../../../../lib/state/deliveryParamsStore';
import { UiSettingsStore } from '../../../../lib/state/uiSettingsStore';
import {
  getAudioInputSensitivity,
  getAudioPromptSpeakingRate,
  setAudioPromptSpeakingRate
} from '../../../../lib/state/audioState';
import { audioManager } from '../../../../lib/audioContextManager';
import { getEngine, setEngine } from '../../../../lib/engineManager';
import { initializeEngine } from '../services/unitEngineService';
import { getExperimentState, createExperimentState } from '../services/experimentState';
import { resumeFromExperimentState } from '../services/resumeService';
import { createMappingSignature } from '../../../../lib/mappingSignature';
import { hasMeaningfulMappingProgress, isStrictMappingMismatchEnforcementEnabled } from './mappingProgressPolicy';
import {
  applyMappingRecordToSession,
  createMappingRecord,
  loadMappingRecord,
  validateMappingRecord,
} from './mappingRecordService';
import { CardStore } from '../../modules/cardStore';
import { checkForFileImage, unitHasLockout } from '../../instructions';
import { sanitizeUiSettings } from '../utils/uiSettingsValidator';
import { initializeAudioRecorder } from './speechRecognitionService';
import { leavePage } from './navigationCleanup';
import { ensureCurrentStimuliSetId, resolveDynamicAssetPath } from './mediaResolver';
import { resolveVideoResumeAnchor } from './videoResume';
import { withStartupTimeout } from '../../../../lib/audioStartup';
import { evaluateSrAvailability } from '../../../../lib/audioAvailability';
import { finishLaunchLoading, markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../../../lib/launchLoading';
import {
  CARD_ENTRY_INTENT,
  classifyCardRefreshRebuild,
  clearCardEntryContext,
  getCardEntryContext,
  setCardEntryIntent,
  shouldUseProgressBootstrapForEntryIntent,
} from '../../../../lib/cardEntryIntent';
import { isConditionRootWithoutUnitArray } from '../../../../lib/tdfUtils';
import {
  assertIdInvariants,
  setActiveTdfContext,
} from '../../../../lib/idContext';
import type {
  ExperimentState,
  RewindCheckpointData,
  SvelteCardInitResult,
  UnitEngineLike,
  UnitType,
  VideoCheckpointBehavior,
} from '../../../../../common/types';
import type { UiSettings } from '../../../../../common/types';
import { repairFormattedStimuliResponsesFromRaw } from '../../../../../common/lib/stimuliResponseRepair';
import '../../../../../common/Collections';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
type MeteorUserLike = {
  _id?: string;
  username?: string;
  audioSettings?: { audioInputMode?: boolean };
};

type UnknownRecord = Record<string, unknown>;

interface VideoCheckpointLike extends UnknownRecord {
  time?: unknown;
}

interface VideoSessionLike extends UnknownRecord {
  videosource?: string;
  questions?: unknown;
  questiontimes?: unknown;
  checkpointQuestions?: unknown;
  checkpointBehavior?: unknown;
  checkpoints?: VideoCheckpointLike[];
  rewindOnIncorrect?: unknown;
}

interface TdfUnitLike extends UnknownRecord {
  assessmentsession?: unknown;
  videosession?: VideoSessionLike;
  learningsession?: unknown;
  unitinstructions?: unknown;
  picture?: unknown;
  unitinstructionsquestion?: unknown;
  unitname?: string;
  uiSettings?: UnknownRecord;
}

interface TdfFileLike extends UnknownRecord {
  tdfs?: {
    tutor?: {
      title?: string;
      unit?: TdfUnitLike[];
      setspec?: {
        audioInputSensitivity?: string;
        audioPromptSpeakingRate?: string;
        audioInputEnabled?: string | boolean;
        speechAPIKey?: string;
        tips?: unknown[];
        uiSettings?: UnknownRecord;
        unitTemplate?: unknown;
        shuffleclusters?: string;
        swapclusters?: string;
      };
    };
  };
  stimuliSetId?: string;
  stimuli?: unknown[];
  content?: {
    stimuli?: unknown[];
  };
  name?: string;
  fileName?: string;
}

interface RuntimeEngine extends UnitEngineLike {
  __unitNumber?: number;
  __tdfId?: string | null;
  __unitName?: string | null;
  loadResumeState?: () => Promise<void> | void;
}

type RuntimeUiSettings = UiSettings & {
  isVideoSession?: boolean;
  videoUrl?: string;
};

type CardPopstateHandler = (this: Window, event: PopStateEvent) => void;
type TutorLike = NonNullable<NonNullable<TdfFileLike['tdfs']>['tutor']>;
type ResolvedStandardInitTdfContext = {
  tdfFile: TdfFileLike;
  tutor: TutorLike;
};

function getMeteorUser(): MeteorUserLike | null | undefined {
  return Meteor.user() as MeteorUserLike | null | undefined;
}
let cardPopstateHandler: CardPopstateHandler | null = null;

async function restoreHiddenItemsFromHistory(): Promise<void> {
  const userId = Meteor.userId();
  const currentTdfId = Session.get('currentTdfId');
  if (!userId || typeof currentTdfId !== 'string' || currentTdfId.trim() === '') {
    CardStore.resetHiddenItems();
    return;
  }

  try {
    markLaunchLoadingTiming('restoreHiddenItemsFromHistory:start');
    const hiddenItems = await meteorCallAsync<Array<string | number>>(
      'getHiddenStimulusKCsFromHistory',
      userId,
      currentTdfId
    );
    CardStore.setHiddenItems(Array.isArray(hiddenItems) ? hiddenItems : []);
    markLaunchLoadingTiming('restoreHiddenItemsFromHistory:complete', {
      count: Array.isArray(hiddenItems) ? hiddenItems.length : 0,
    });
  } catch (error) {
    clientConsole(1, '[Svelte Init] Failed to restore hidden items from history:', error);
    CardStore.resetHiddenItems();
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} unit
 * @returns {UnitType | undefined}
 */
function deriveUnitType(unit: TdfUnitLike | null | undefined): UnitType | undefined {
  if (!unit) {
    clientConsole(1, '[Svelte Init] deriveUnitType: unit is null/undefined', {
      stack: new Error().stack,
      currentUnitNumber: Session.get('currentUnitNumber'),
      currentTdfUnit: Session.get('currentTdfUnit'),
    });
    return undefined;
  }

  

  if (unit.assessmentsession) return 'schedule';
  if (unit.videosession) return 'video';
  if (unit.learningsession) return 'model';

  // Check if this is a legitimate instruction-only unit
  const hasInstructions = unit.unitinstructions || unit.picture || unit.unitinstructionsquestion;
  if (hasInstructions && !unit.assessmentsession && !unit.learningsession && !unit.videosession) {
    
    return 'instruction-only';
  }

  clientConsole(1, '[Svelte Init] deriveUnitType: Cannot determine type for unit', {
    unitname: unit.unitname,
    hasInstructions,
    unitStructure: Object.keys(unit),
  });
  return undefined;
}

const VIDEO_CHECKPOINT_BEHAVIORS = new Set(['none', 'pause', 'all', 'some', 'adaptive']);

function normalizeVideoBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * @param {unknown} value
 * @returns {VideoCheckpointBehavior}
 */
function parseVideoCheckpointBehavior(value: unknown): VideoCheckpointBehavior {
  if (value == null || value === '') {
    return 'none';
  }
  if (typeof value !== 'string') {
    throw new Error('[Svelte Init] Video session checkpointBehavior must be a string');
  }
  const normalized = value.trim().toLowerCase();
  if (!VIDEO_CHECKPOINT_BEHAVIORS.has(normalized)) {
    throw new Error(`[Svelte Init] Unsupported checkpointBehavior "${value}"`);
  }
  return normalized as VideoCheckpointBehavior;
}

/**
 * @param {unknown} values
 * @param {string} fieldName
 * @returns {number[]}
 */
function parseNumericArray(values: unknown, fieldName: string): number[] {
  if (!Array.isArray(values)) {
    throw new Error(`[Svelte Init] ${fieldName} must be an array`);
  }
  return values.map((value: unknown, index: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[Svelte Init] ${fieldName}[${index}] is not numeric`);
    }
    return parsed;
  });
}

/**
 * @param {number[]} values
 * @returns {number[]}
 */
function uniqueSortedNumeric(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * @param {number[]} questionTimes
 * @param {Record<string, unknown> | null | undefined} videoSession
 * @returns {number[]}
 */
function buildSelectiveCheckpointTimes(questionTimes: number[], videoSession: VideoSessionLike | null | undefined): number[] {
  const checkpointQuestions = videoSession?.checkpointQuestions;
  if (Array.isArray(checkpointQuestions) && checkpointQuestions.length > 0) {
    const selected = checkpointQuestions.map((value: unknown, index: number) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`[Svelte Init] checkpointQuestions[${index}] must be an integer`);
      }
      const timeIndex = parsed - 1;
      if (timeIndex < 0 || timeIndex >= questionTimes.length) {
        throw new Error(`[Svelte Init] checkpointQuestions[${index}] is out of range`);
      }
      return questionTimes[timeIndex]!;
    });
    return uniqueSortedNumeric(selected);
  }

  const currentStimuliSet = Session.get('currentStimuliSet') as Array<{ checkpoint?: boolean }> | null | undefined;
  if (!Array.isArray(currentStimuliSet) || currentStimuliSet.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "some" requires checkpointQuestions or currentStimuliSet checkpoint flags');
  }

  const selected: number[] = [];
  for (let i = 0; i < questionTimes.length; i++) {
    if (currentStimuliSet[i]?.checkpoint === true) {
      selected.push(questionTimes[i]!);
    }
  }

  if (selected.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "some" resolved no checkpoint times');
  }

  return uniqueSortedNumeric(selected);
}

/**
 * @param {Record<string, unknown> | null | undefined} videoSession
 * @returns {number[]}
 */
function buildAdaptiveCheckpointTimes(videoSession: VideoSessionLike | null | undefined): number[] {
  if (!Array.isArray(videoSession?.checkpoints) || videoSession.checkpoints.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "adaptive" requires videosession.checkpoints');
  }
  const selected = videoSession.checkpoints.map((checkpoint: VideoCheckpointLike, index: number) => {
    const parsed = Number(checkpoint?.time);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[Svelte Init] checkpoints[${index}].time is not numeric`);
    }
    return parsed;
  });
  return uniqueSortedNumeric(selected);
}

/**
 * @param {Record<string, unknown> | null | undefined} videoSession
 * @param {number[]} questionTimes
 * @returns {RewindCheckpointData}
 */
function buildRewindCheckpointData(
  videoSession: VideoSessionLike | null | undefined,
  questionTimes: number[]
): RewindCheckpointData {
  const checkpointBehavior = parseVideoCheckpointBehavior(videoSession?.checkpointBehavior);

  if (!normalizeVideoBoolean(videoSession?.rewindOnIncorrect)) {
    return {
      checkpointBehavior,
      rewindCheckpoints: [],
    };
  }

  if (checkpointBehavior === 'pause' || checkpointBehavior === 'all') {
    return {
      checkpointBehavior,
      rewindCheckpoints: uniqueSortedNumeric(questionTimes),
    };
  }
  if (checkpointBehavior === 'some') {
    return {
      checkpointBehavior,
      rewindCheckpoints: buildSelectiveCheckpointTimes(questionTimes, videoSession),
    };
  }
  if (checkpointBehavior === 'adaptive') {
    return {
      checkpointBehavior,
      rewindCheckpoints: buildAdaptiveCheckpointTimes(videoSession),
    };
  }

  return {
    checkpointBehavior,
    rewindCheckpoints: [],
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} curTdfUnit
 * @returns {void}
 */
async function initVideoSessionData(curTdfUnit: TdfUnitLike | null | undefined) {
  const videoSession = curTdfUnit?.videosession;
  if (!videoSession) {
    Session.set('isVideoSession', false);
    Session.set('videoResumeAnchor', null);
    return;
  }

  Session.set('isVideoSession', true);

  if (!videoSession.videosource) {
    throw new Error('[Svelte Init] Video session missing videosource');
  }

  let questions = videoSession.questions;
  if (typeof questions === 'string') {
    const questionIndices = [];
    const clusterList: string[] = [];
    extractDelimFields(questions, clusterList);
    for (let i = 0; i < clusterList.length; i++) {
      const nums = rangeVal(clusterList[i]);
      questionIndices.push(...nums);
    }
    questions = questionIndices;
  } else if (questions == null) {
    throw new Error('[Svelte Init] Video session missing questions list');
  } else if (!Array.isArray(questions)) {
    throw new Error('[Svelte Init] Video session questions must be an array or range string');
  }
  const parsedQuestions = parseNumericArray(questions, 'Video session questions').map((value: number, index: number) => {
    if (!Number.isInteger(value)) {
      throw new Error(`[Svelte Init] Video session questions[${index}] must be an integer`);
    }
    return value;
  });

  const questionTimes = videoSession.questiontimes;
  if (questionTimes == null) {
    throw new Error('[Svelte Init] Video session missing question times');
  } else if (!Array.isArray(questionTimes)) {
    throw new Error('[Svelte Init] Video session questiontimes must be an array');
  }

  const times = parseNumericArray(questionTimes, 'Video session questiontimes');
  if (parsedQuestions.length !== times.length) {
    throw new Error('[Svelte Init] Video session questions do not match question times length');
  }

  const { checkpointBehavior, rewindCheckpoints } = buildRewindCheckpointData(videoSession, times);

  Session.set('videoCheckpoints', {
    times,
    questions: parsedQuestions,
    checkpointBehavior,
    rewindCheckpoints,
  });

  let completedCheckpointQuestionCount = 0;
  const userId = Meteor.userId();
  const currentTdfId = Session.get('currentTdfId');
  const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
  if (userId && typeof currentTdfId === 'string' && currentTdfId.trim() !== '' && Number.isFinite(currentUnitNumber)) {
    completedCheckpointQuestionCount = await meteorCallAsync(
      'getVideoCompletedCheckpointQuestionCountFromHistory',
      userId,
      currentTdfId,
      currentUnitNumber
    );
  }
  const videoResumeAnchor = resolveVideoResumeAnchor(times, completedCheckpointQuestionCount);
  Session.set('videoResumeAnchor', videoResumeAnchor);

  let resolvedVideoUrl = resolveDynamicAssetPath(videoSession.videosource, { logPrefix: '[Svelte Init]' });

  const currentUiSettings = (UiSettingsStore.get() || {}) as RuntimeUiSettings;
  UiSettingsStore.set({
    ...currentUiSettings,
    isVideoSession: true,
    videoUrl: resolvedVideoUrl,
  } as Parameters<typeof UiSettingsStore.set>[0]);
}

function restoreCanonicalTdfFileForStandardInit(
  initialTdfFile: TdfFileLike,
  experimentState: ExperimentState
): ResolvedStandardInitTdfContext {
  let tdfFile = initialTdfFile;
  let tutor = tdfFile.tdfs!.tutor!;
  const experimentTdf = experimentState?.currentTdfFile as TdfFileLike | null | undefined;
  const hasUnitTemplate = !!tutor.setspec?.unitTemplate;

  if (hasUnitTemplate && experimentTdf?.tdfs?.tutor?.unit?.length) {
    Session.set('currentTdfFile', experimentTdf);
    tdfFile = experimentTdf;
    tutor = tdfFile.tdfs!.tutor!;
    if (experimentTdf.fileName) {
      Session.set('currentTdfName', experimentTdf.fileName);
    }
  }

  if (
    (!tdfFile.tdfs?.tutor?.unit || !tdfFile.tdfs.tutor.unit.length) &&
    experimentTdf?.tdfs?.tutor?.unit?.length
  ) {
    Session.set('currentTdfFile', experimentTdf);
    tdfFile = experimentTdf;
    tutor = tdfFile.tdfs!.tutor!;
  }

  const resolvedUnits = tdfFile.tdfs?.tutor?.unit;
  if (!Array.isArray(resolvedUnits) || resolvedUnits.length === 0) {
    throw new Error('[Svelte Init] Standard init requires currentTdfFile with a populated tutor.unit array after canonical TDF restore');
  }

  return { tdfFile, tutor };
}

function restoreCurrentUnitNumberForRefreshRebuild(
  dispatchContext: CardEntryDispatchContext,
  experimentState: ExperimentState
): void {
  const { requestedIntent, effectiveIntent } = dispatchContext;
  if (requestedIntent !== CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD) {
    return;
  }

  if (Session.get('currentUnitNumber') !== null && Session.get('currentUnitNumber') !== undefined) {
    return;
  }

  const persistedUnitNumber = Number(experimentState.currentUnitNumber);
  if (!Number.isFinite(persistedUnitNumber) || persistedUnitNumber < 0) {
    throw new Error('[Svelte Init] card_refresh_rebuild standard init requires a persisted currentUnitNumber');
  }

  Session.set('currentUnitNumber', persistedUnitNumber);
  clientConsole(2, '[Svelte Init] Restored currentUnitNumber for refresh rebuild standard init', {
    currentUnitNumber: persistedUnitNumber,
    resolvedIntent: effectiveIntent,
  });
}

async function ensureCanonicalStimuliSetLoadedForStandardInit(tdfFile: TdfFileLike): Promise<void> {
  const sessionStimuliSet = Session.get('currentStimuliSet');
  if (Array.isArray(sessionStimuliSet) && sessionStimuliSet.length > 0) {
    const repairedSessionStimuliSet = repairFormattedStimuliResponsesFromRaw(
      sessionStimuliSet,
      tdfFile.rawStimuliFile
    );
    if (repairedSessionStimuliSet !== sessionStimuliSet) {
      Session.set('currentStimuliSet', repairedSessionStimuliSet);
    }
    if (!Session.get('currentStimuliSetId') && tdfFile.stimuliSetId) {
      setActiveTdfContext({
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
        currentStimuliSetId: tdfFile.stimuliSetId,
      }, 'svelteInit.stimuli-restore');
    }
    ensureCurrentStimuliSetId(tdfFile.stimuliSetId);
    return;
  }

  const inlineStimuliSet = tdfFile.stimuli || tdfFile.content?.stimuli || null;
  if (Array.isArray(inlineStimuliSet) && inlineStimuliSet.length > 0) {
    Session.set(
      'currentStimuliSet',
      repairFormattedStimuliResponsesFromRaw(
        inlineStimuliSet as Record<string, unknown>[],
        tdfFile.rawStimuliFile
      )
    );
  } else {
    const stimuliSetId = Session.get('currentStimuliSetId') || tdfFile.stimuliSetId;
    if (!stimuliSetId) {
      throw new Error('[Svelte Init] Standard init requires current stimuli or a canonical stimuliSetId');
    }
    const fetchedSet = await meteorCallAsync('getStimuliSetById', stimuliSetId);
    if (!Array.isArray(fetchedSet) || fetchedSet.length === 0) {
      throw new Error(`[Svelte Init] Stimuli set ${String(stimuliSetId)} could not be loaded for standard initialization`);
    }
    Session.set('currentStimuliSet', fetchedSet);
  }

  if (!Session.get('currentStimuliSetId') && tdfFile.stimuliSetId) {
    setActiveTdfContext({
      currentRootTdfId: Session.get('currentRootTdfId'),
      currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
      currentStimuliSetId: tdfFile.stimuliSetId,
    }, 'svelteInit.stimuli-restore');
  }
  ensureCurrentStimuliSetId(tdfFile.stimuliSetId);
}

type CardEntryIntentValue = ReturnType<typeof getCardEntryContext>['intent'];

type CardEntryDispatchContext = {
  requestedIntent: CardEntryIntentValue;
  effectiveIntent: CardEntryIntentValue;
  prefetchedExperimentState: ExperimentState | null;
  refreshRebuildClassification: ReturnType<typeof classifyCardRefreshRebuild> | null;
  requiresConditionResolution: boolean;
  shouldUseProgressBootstrap: boolean;
};

function describeCardEntryBootstrapMode(
  shouldUseProgressBootstrap: boolean,
  requiresConditionResolution: boolean
): 'standard' | 'persisted-progress' | 'condition-resolve' {
  if (!shouldUseProgressBootstrap) {
    return 'standard';
  }
  if (requiresConditionResolution) {
    return 'condition-resolve';
  }
  return 'persisted-progress';
}

async function initializePersistedProgressResumeCard(
  tdfFile: TdfFileLike,
  effectiveIntent: CardEntryIntentValue
): Promise<SvelteCardInitResult> {
  const resumeResult = await resumeFromExperimentState(tdfFile) as SvelteCardInitResult;

  Session.set('resumeToQuestion', !!resumeResult?.resumeToQuestion);

  if (resumeResult.redirected) {
    if (resumeResult.redirectTo) {
      await leavePage(resumeResult.redirectTo);
    }
    return resumeResult;
  }

  if (resumeResult.moduleCompleted) {
    await leavePage('/home');
    return resumeResult;
  }

  if (resumeResult.engine) {
    setEngine(resumeResult.engine);
  }

  await initVideoSessionData(Session.get('currentTdfUnit'));

  return {
    redirected: false,
    engine: resumeResult.engine,
    isResume: effectiveIntent === CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
  };
}

async function initializeInitialEntryCard(
  tdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  clientConsole(2, '[Svelte Init] initializeInitialEntryCard', {
    bootstrapMode: describeCardEntryBootstrapMode(
      dispatchContext.shouldUseProgressBootstrap,
      dispatchContext.requiresConditionResolution
    ),
  });
  if (dispatchContext.shouldUseProgressBootstrap) {
    return initializePersistedProgressResumeCard(tdfFile, dispatchContext.effectiveIntent);
  }
  return initializeStandardCardEntry(tdfFile, dispatchContext);
}

async function initializeInstructionContinueCard(
  tdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  clientConsole(2, '[Svelte Init] initializeInstructionContinueCard');
  return initializeStandardCardEntry(tdfFile, dispatchContext);
}

async function initializeCardRefreshRebuild(
  tdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  clientConsole(2, '[Svelte Init] initializeCardRefreshRebuild', {
    resolvedIntent: dispatchContext.effectiveIntent,
    refreshRebuildClassification: dispatchContext.refreshRebuildClassification,
  });
  if (dispatchContext.shouldUseProgressBootstrap) {
    return initializePersistedProgressResumeCard(tdfFile, dispatchContext.effectiveIntent);
  }
  return initializeStandardCardEntry(tdfFile, dispatchContext);
}

async function initializeStandardCardEntry(
  initialTdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  const { requestedIntent, effectiveIntent, prefetchedExperimentState } = dispatchContext;

  Session.set('resumeToQuestion', false);

  if (!prefetchedExperimentState) {
    markLaunchLoadingTiming('getExperimentState:start', { source: 'initializeStandardCardEntry' });
  }
  const experimentState: ExperimentState = prefetchedExperimentState || await getExperimentState();
  if (!prefetchedExperimentState) {
    markLaunchLoadingTiming('getExperimentState:complete', { source: 'initializeStandardCardEntry' });
  }
  restoreCurrentUnitNumberForRefreshRebuild(dispatchContext, experimentState);
  const { tdfFile, tutor } = restoreCanonicalTdfFileForStandardInit(initialTdfFile, experimentState);

  const tips = tutor.setspec?.tips || [];
  if (Array.isArray(tips) && tips.length) {
    const formattedTips = tips.map((tip) => checkForFileImage(tip));
    Session.set('curTdfTips', formattedTips);
  }

  const unitIndex = Session.get('currentUnitNumber') || 0;
  const tdfSettings = tutor.setspec?.uiSettings || {};
  const unitSettings = tutor.unit?.[unitIndex]?.uiSettings || {};
  const merged = { ...tdfSettings, ...unitSettings };
  const tdfName = tutor.title || tdfFile?.name || '';
  UiSettingsStore.set(sanitizeUiSettings(merged, { tdfName }));

  await checkUserSession();

  startSessionCheckInterval('svelte init');

  await ensureStimDisplayTypeMapReady('svelte init');
  startStimDisplayTypeMapVersionSync('svelte init');

  await ensureCanonicalStimuliSetLoadedForStandardInit(tdfFile);

  const stimCount = getStimCount();
  if (stimCount > 0) {
    const setSpec = tutor.setspec || {};
    const shuffles = setSpec?.shuffleclusters ? setSpec.shuffleclusters.trim().split(" ") : [''];
    const swaps = setSpec?.swapclusters ? setSpec.swapclusters.trim().split(" ") : [''];
    let mappingRecord = loadMappingRecord(experimentState);
    if (mappingRecord) {
      applyMappingRecordToSession(mappingRecord);
    }

    const mappingMissing = !mappingRecord || !Array.isArray(mappingRecord.mappingTable) || mappingRecord.mappingTable.length === 0;
    const mappingIncompatible = !mappingMissing && !validateMappingRecord(mappingRecord, stimCount, setSpec);
    const mappingNeedsIntervention = mappingMissing || mappingIncompatible;

    if (mappingNeedsIntervention) {
      if (hasMeaningfulMappingProgress(experimentState)) {
        clientConsole(1, '[Svelte Init] Cluster mapping missing/incompatible with current setSpec; blocking initialization (Stage 2 policy)', {
          eventType: 'mapping-hard-stop',
          reason: mappingMissing ? 'missing-mapping-with-progress' : 'invalid-mapping-with-progress',
          hardStop: true,
          mappingMissing,
          mappingIncompatible,
          stimCount,
          mappingLength: mappingRecord?.mappingTable?.length ?? null,
          currentRootTdfId: Session.get('currentRootTdfId'),
          currentTdfId: Session.get('currentTdfId'),
        });
        Session.set('uiMessage', {
          text: 'This lesson version changed and saved progress cannot continue without reset/version routing.',
          variant: 'warning',
        });
        await leavePage('/home');
        return {
          redirected: true,
          redirectTo: '/home',
          error: 'cluster-mapping-mismatch',
        };
      }

      clientConsole(1, '[Svelte Init] No meaningful progress detected; creating initial cluster mapping (Stage 2 create path)');
      mappingRecord = createMappingRecord({
        stimCount,
        shuffles,
        swaps,
      });
      applyMappingRecordToSession(mappingRecord);
      await createExperimentState(
        { clusterMapping: mappingRecord.mappingTable }
      );
    }

    const { signature: currentMappingSignature } = createMappingSignature({
      tdfFile,
      rootTdfId: Session.get('currentRootTdfId'),
      conditionTdfId: experimentState?.conditionTdfId || null,
      stimuliSetId: Session.get('currentStimuliSetId') || tdfFile.stimuliSetId || null,
      stimuliSet: Session.get('currentStimuliSet'),
      stimCount,
    });
    const persistedMappingSignature = typeof experimentState?.mappingSignature === 'string'
      ? experimentState.mappingSignature
      : null;
    const signatureMismatch = !!persistedMappingSignature && persistedMappingSignature !== currentMappingSignature;
    const formatMigrationMismatch = !!persistedMappingSignature
      && persistedMappingSignature.startsWith('msig_v1_')
      && currentMappingSignature.startsWith('msig_v2_');
    const enforceableSignatureMismatch = signatureMismatch && !formatMigrationMismatch;
    const strictMismatchEnforcement = isStrictMappingMismatchEnforcementEnabled();

    if (enforceableSignatureMismatch) {
      const progressed = hasMeaningfulMappingProgress(experimentState);
      const hardStop = strictMismatchEnforcement && progressed;
      const mismatchPayload = {
        eventType: 'mapping-hard-stop',
        reason: 'signature-mismatch',
        hardStop,
        strictMismatchEnforcement,
        progressed,
        userMessage: 'This lesson version changed and saved progress cannot continue without reset/version routing.',
        persistedMappingSignature,
        currentMappingSignature,
        rootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId'),
        conditionTdfId: experimentState?.conditionTdfId || null,
        stimuliSetId: Session.get('currentStimuliSetId') || tdfFile.stimuliSetId || null,
      };
      clientConsole(1, '[Svelte Init] Mapping signature mismatch detected', mismatchPayload);
      if (hardStop) {
        Session.set('uiMessage', {
          text: mismatchPayload.userMessage,
          variant: 'warning',
        });
        await leavePage('/home');
        return {
          redirected: true,
          redirectTo: '/home',
          error: 'cluster-mapping-signature-mismatch',
        };
      }
    }
    mappingRecord = {
      ...(mappingRecord || { mappingTable: (Session.get('clusterMapping') || []) as number[], createdAt: Date.now(), mappingSignature: null }),
      mappingTable: (mappingRecord?.mappingTable || (Session.get('clusterMapping') || [])) as number[],
      mappingSignature:
        !persistedMappingSignature || formatMigrationMismatch || persistedMappingSignature === currentMappingSignature
          ? currentMappingSignature
          : persistedMappingSignature,
    };
    applyMappingRecordToSession(mappingRecord);

    if (!persistedMappingSignature || formatMigrationMismatch) {
      const stateUpdate: Record<string, unknown> = { mappingSignature: currentMappingSignature };
      if (Array.isArray(mappingRecord.mappingTable) && mappingRecord.mappingTable.length === stimCount) {
        stateUpdate.clusterMapping = mappingRecord.mappingTable;
      }
      await createExperimentState(stateUpdate);
    }
  } else {
    clientConsole(1, '[Svelte Init] Cannot create cluster mapping - stimCount is 0');
  }

  window.AudioContext = window.webkitAudioContext || window.AudioContext;
  window.URL = window.URL || window.webkitURL;
  const recorderCtx = audioManager.getRecorderContext();
  if (recorderCtx) {
    clientConsole(2, '[Svelte Init] Using pre-initialized audio context from warmup');
  } else {
    audioManager.createRecorderContext({ sampleRate: 16000 });
  }

  const feedbackDisplay = document.getElementById('feedbackDisplay');
  if (feedbackDisplay) feedbackDisplay.innerHTML = '';
  const feedbackDisplayButtons = document.getElementById('feedbackDisplayButtons');
  if (feedbackDisplayButtons) feedbackDisplayButtons.innerHTML = '';
  const userLowerInteraction = document.getElementById('userLowerInteraction');
  if (userLowerInteraction) userLowerInteraction.innerHTML = '';

  let unitNumber = Session.get('currentUnitNumber');
  if (unitNumber === null || unitNumber === undefined) {
    if (effectiveIntent === CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
      unitNumber = 0;
      Session.set('currentUnitNumber', unitNumber);
    } else {
      throw new Error(`[Svelte Init] Missing currentUnitNumber for ${String(requestedIntent || effectiveIntent || 'unknown')} standard init`);
    }
  }

  if (!Session.get('currentTdfUnit')) {
    const unitNumber = Number(Session.get('currentUnitNumber') || 0);
    const unitList = tutor.unit;

    if (!Array.isArray(unitList) || unitList.length === 0) {
      throw new Error('[Svelte Init] No units found in currentTdfFile for standard initialization');
    }

    if (unitNumber < 0 || unitNumber >= unitList.length) {
      clientConsole(1, '[Svelte Init] Unit number out of bounds!', {
        unitNumber,
        totalUnits: unitList.length,
        stackTrace: new Error().stack,
      });
      throw new Error(`Unit number ${unitNumber} is out of bounds (0-${unitList.length - 1})`);
    }

    const unit = unitList[unitNumber];
    if (!unit) {
      throw new Error(`Cannot retrieve unit at index ${unitNumber}; currentTdfFile unit list is incomplete`);
    }

    Session.set('currentTdfUnit', unit);
  }

  const existingEngine = getEngine() as RuntimeEngine | null;
  const currentUnitNumber = Session.get('currentUnitNumber') || 0;
  const currentTdfId = Session.get('currentTdfId');
  const unit = tutor.unit?.[currentUnitNumber];

  if (!unit) {
    throw new Error(`Cannot initialize engine: unit at index ${currentUnitNumber} is null/undefined`);
  }

  const derivedUnitType = deriveUnitType(unit);
  if (!derivedUnitType) {
    throw new Error(`Cannot determine unit type for unit "${unit.unitname}" at index ${currentUnitNumber}. Unit has no assessmentsession, learningsession, videosession, or valid instructions-only configuration.`);
  }

  const unitType = derivedUnitType;
  Session.set('unitType', unitType);
  clientConsole(2, '[Svelte Init] Resolved unitType:', unitType);

  const existingEngineUnitNumber = existingEngine && Number.isFinite(existingEngine.__unitNumber)
    ? existingEngine.__unitNumber
    : null;
  const existingEngineTdfId = existingEngine?.__tdfId || null;
  const existingEngineUnitName = existingEngine?.__unitName || null;
  const engineUnitContextChanged = !!existingEngine && (
    existingEngineUnitNumber !== currentUnitNumber ||
    existingEngineTdfId !== currentTdfId ||
    existingEngineUnitName !== (unit?.unitname || null)
  );

  const shouldInitEngine = !existingEngine ||
    (unitType && existingEngine.unitType !== unitType) ||
    engineUnitContextChanged ||
    existingEngine?.unitType === 'unknown';

  if (shouldInitEngine) {
    assertIdInvariants('svelteInit.before-engine-init', {
      requireCurrentTdfId: true,
      requireStimuliSetId: true,
    });
    Session.set('currentUnitNumber', currentUnitNumber);

    markLaunchLoadingTiming('engineInitialization:start', { currentUnitNumber, unitType });
    const engine = await initializeEngine(tdfFile, currentUnitNumber, unitType);
    markLaunchLoadingTiming('engineInitialization:complete', { currentUnitNumber, unitType });
    engine.__unitNumber = currentUnitNumber;
    engine.__tdfId = currentTdfId;
    engine.__unitName = unit?.unitname || null;
    setEngine(engine);
    Session.set('unitType', unitType);
  }

  const engine = getEngine() as RuntimeEngine | null;
  if (engine?.loadResumeState) {
    markLaunchLoadingTiming('engineLoadResumeState:start');
    await engine.loadResumeState();
    markLaunchLoadingTiming('engineLoadResumeState:complete');
  }

  DeliveryParamsStore.set(getCurrentDeliveryParams());

  const currentUser = getMeteorUser();
  const userDisplayIdentifier = getUserDisplayIdentifier(currentUser);

  if (currentUser?._id && userDisplayIdentifier && currentTdfId) {
    clientConsole(2, '[Svelte Init] Subscribing to dashboardCache for performance totals');
    markLaunchLoadingTiming('dashboardCacheSubscription:start', { currentTdfId });
    await new Promise<void>((resolve) => {
      Meteor.subscribe('dashboardCache', {
        onReady: () => {
          clientConsole(2, '[Svelte Init] dashboardCache subscription ready');
          markLaunchLoadingTiming('dashboardCacheSubscription:ready', { currentTdfId });
          resolve();
        },
        onStop: (error: unknown) => {
          if (error) {
            clientConsole(1, '[Svelte Init] dashboardCache subscription error:', error);
          }
          markLaunchLoadingTiming('dashboardCacheSubscription:stopped', {
            currentTdfId,
            hasError: !!error,
          });
          resolve();
        }
      });
    });
    markLaunchLoadingTiming('setStudentPerformance:start', { currentTdfId });
    await setStudentPerformance(currentUser._id, userDisplayIdentifier, currentTdfId);
    markLaunchLoadingTiming('setStudentPerformance:complete', { currentTdfId });
  } else {
    clientConsole(1, '[Svelte Init] Missing user or tdfId - cannot set student performance', {
      hasUserId: !!currentUser?._id,
      hasUserDisplayIdentifier: !!userDisplayIdentifier,
      currentTdfId,
      currentRootTdfId: Session.get('currentRootTdfId'),
    });
  }

  const currentUnit = Session.get('currentTdfUnit');
  const hasUnitText = typeof currentUnit?.unitinstructions === 'string' && currentUnit.unitinstructions.trim().length > 0;
  const hasUnitImage = typeof currentUnit?.picture === 'string' && currentUnit.picture.trim().length > 0;
  const hasUnitQuestion = typeof currentUnit?.unitinstructionsquestion === 'string' &&
    currentUnit.unitinstructionsquestion.trim().length > 0;
  const lockoutMinutes = Number(unitHasLockout() || 0);
  const instructionsSeen = Session.get('curUnitInstructionsSeen');
  const shouldShowInstructions = ((!instructionsSeen) && (hasUnitText || hasUnitImage || hasUnitQuestion)) ||
    lockoutMinutes > 0;
  const canInlineVideoInstructions = unitType === 'video' &&
    lockoutMinutes <= 0 &&
    hasUnitText &&
    !hasUnitImage &&
    !hasUnitQuestion;

  if (shouldShowInstructions && !canInlineVideoInstructions) {
    setLaunchLoadingMessage('Loading instructions...');
    FlowRouter.go('/instructions');
    return { redirected: true };
  }

  await initVideoSessionData(Session.get('currentTdfUnit'));

  return { redirected: false };
}

async function initializeCardEntryByIntent(
  tdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  switch (dispatchContext.requestedIntent) {
  case CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY:
    return initializeInitialEntryCard(tdfFile, dispatchContext);
  case CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME:
    clientConsole(2, '[Svelte Init] initializePersistedProgressResumeCard');
    return initializePersistedProgressResumeCard(tdfFile, dispatchContext.effectiveIntent);
  case CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE:
    return initializeInstructionContinueCard(tdfFile, dispatchContext);
  case CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD:
    return initializeCardRefreshRebuild(tdfFile, dispatchContext);
  default:
    clientConsole(2, '[Svelte Init] initializeCardEntryByIntent default path', {
      requestedIntent: dispatchContext.requestedIntent,
      effectiveIntent: dispatchContext.effectiveIntent,
      bootstrapMode: describeCardEntryBootstrapMode(
        dispatchContext.shouldUseProgressBootstrap,
        dispatchContext.requiresConditionResolution
      ),
    });
    if (dispatchContext.shouldUseProgressBootstrap) {
      return initializePersistedProgressResumeCard(tdfFile, dispatchContext.effectiveIntent);
    }
    return initializeStandardCardEntry(tdfFile, dispatchContext);
  }
}

/**
 * @returns {Promise<SvelteCardInitResult>}
 */
export async function initializeSvelteCard(): Promise<SvelteCardInitResult> {
  CardStore.setScoringEnabled(undefined);
  CardStore.setDisplayReady(false);
  CardStore.setInputReady(false);
  Session.set('displayReady', false);
  Session.set('inputReady', false);
  Session.set('isVideoSession', false);
  Session.set('videoCheckpoints', null);
  Session.set('videoResumeAnchor', null);
  if (!Array.isArray(Session.get('overallOutcomeHistory'))) {
    Session.set('overallOutcomeHistory', []);
  }
  if (!Array.isArray(Session.get('overallStudyHistory'))) {
    Session.set('overallStudyHistory', []);
  }

  const cardEntryContext = getCardEntryContext();
  const requestedCardEntryIntent = cardEntryContext.intent;
  let effectiveCardEntryIntent = requestedCardEntryIntent;
  let prefetchedExperimentState: ExperimentState | null = null;
  let refreshRebuildClassification: ReturnType<typeof classifyCardRefreshRebuild> | null = null;
  if (requestedCardEntryIntent === CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD) {
    markLaunchLoadingTiming('getExperimentState:start', { source: 'cardRefreshRebuild' });
    prefetchedExperimentState = await getExperimentState();
    markLaunchLoadingTiming('getExperimentState:complete', { source: 'cardRefreshRebuild' });
    refreshRebuildClassification = classifyCardRefreshRebuild(prefetchedExperimentState);
    effectiveCardEntryIntent = refreshRebuildClassification.intent;
  }
  const requiresConditionResolution =
    effectiveCardEntryIntent === CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY &&
    isConditionRootWithoutUnitArray(Session.get('currentTdfFile'));
  const shouldUseProgressBootstrap =
    shouldUseProgressBootstrapForEntryIntent(effectiveCardEntryIntent) || requiresConditionResolution;
  clientConsole(2, '[Svelte Init] card entry context', {
    ...cardEntryContext,
    requestedIntent: requestedCardEntryIntent,
    resolvedIntent: effectiveCardEntryIntent,
    refreshRebuildClassification,
    bootstrapMode: describeCardEntryBootstrapMode(
      shouldUseProgressBootstrap,
      requiresConditionResolution
    ),
    requiresConditionResolution,
  });
  clearCardEntryContext();
  Session.set('inResume', false);

  CardStore.resetHiddenItems();

  let tdfFile = Session.get('currentTdfFile') as TdfFileLike | null | undefined;
  if (!tdfFile || !tdfFile.tdfs || !tdfFile.tdfs.tutor) {
    clientConsole(1, '[Svelte Init] No currentTdfFile - skipping init');
    return { redirected: false };
  }
  tdfFile = tdfFile as TdfFileLike;
  let tutor = tdfFile.tdfs!.tutor!;
  setLaunchLoadingMessage('Loading content...');
  await restoreHiddenItemsFromHistory();
  assertIdInvariants('svelteInit.before-media-resolution', {
    requireCurrentTdfId: true,
    requireStimuliSetId: false,
  });
  ensureCurrentStimuliSetId(Session.get('currentStimuliSetId') || tdfFile.stimuliSetId || null);

  const srAvailability = evaluateSrAvailability({
    user: getMeteorUser() ?? null,
    tdfFile: (tdfFile as Parameters<typeof evaluateSrAvailability>[0]['tdfFile']) ?? null,
    sessionSpeechApiKey: Session.get('speechAPIKey'),
  });
  let audioInputEnabled = srAvailability.status === 'available';
  CardStore.setAudioInputModeEnabled(audioInputEnabled);
  clientConsole(2, '[Svelte Init] canonical SR availability', srAvailability);

  if (audioInputEnabled) {
    if (typeof getAudioInputSensitivity() === 'undefined') {
      clientConsole(1, '[Svelte Init] Missing authoritative audio input sensitivity; refusing fallback');
    }
  }

  const audioOutputEnabled = Session.get('enableAudioPromptAndFeedback');
  if (audioOutputEnabled && !getAudioPromptSpeakingRate()) {
    const speakingRate = parseFloat(String(tutor.setspec?.audioPromptSpeakingRate ?? '')) || 1;
    setAudioPromptSpeakingRate(speakingRate);
  }

  if (!cardPopstateHandler) {
    cardPopstateHandler = function(_event: PopStateEvent) {
      if (document.location.pathname === '/card') {
        setCardEntryIntent(CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD, {
          source: 'svelteInit.popstate',
        });
        leavePage('/card');
      }
    };
  }
  window.addEventListener('popstate', cardPopstateHandler);

  const initResult = await initializeCardEntryByIntent(tdfFile, {
    requestedIntent: requestedCardEntryIntent,
    effectiveIntent: effectiveCardEntryIntent,
    prefetchedExperimentState,
    refreshRebuildClassification,
    requiresConditionResolution,
    shouldUseProgressBootstrap,
  });

  if (!initResult?.redirected && audioInputEnabled) {
    clientConsole(2, '[Svelte Init] Initializing audio recorder for SR after card entry confirmation...');
    await withStartupTimeout(initializeAudioRecorder(), 'startup audio recorder initialization');
    clientConsole(2, '[Svelte Init] Audio recorder initialized successfully');
  }

  return initResult;
}
