/**
 * Resume Service for Svelte Card System.
 *
 * Maintains resume continuity across reload/re-entry while using canonical
 * action semantics and centralized resume classification.
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import '../../../../../common/Collections';
import { createExperimentState, getExperimentState } from './experimentState';
import { reconstructLearningStateFromHistory } from './historyReconstruction';
import type { LearningHistoryRecord } from './historyReconstruction';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import { createMappingSignature } from '../../../../lib/mappingSignature';
import { loadLaunchReadyTdf } from '../../../../lib/launchReadyTdf';
import { hasMeaningfulMappingProgress, isStrictMappingMismatchEnforcementEnabled } from './mappingProgressPolicy';
import {
  assertAssessmentScheduleArtifactForUnit,
  assertAssessmentScheduleBounds,
  deriveAssessmentScheduleCursor,
  hasAssessmentResumeProgress,
} from './assessmentResume';
import {
  applyMappingRecordToSession,
  createMappingRecord,
  loadMappingRecord,
  validateMappingRecord,
} from './mappingRecordService';
import { CardStore } from '../../modules/cardStore';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { createUnitEngineForUnit } from '../../engineConstructors';
import {
  refreshCurrentDeliverySettingsStore,
  getStimCount,
  getUserDisplayIdentifier,
  setStudentPerformance
} from '../../../../lib/currentTestingHelpers';
import { clearPreparedNextRuntimeState } from './unitEngineService';
import { COMPLETED_LESSON_REDIRECT, resolveCardLaunchProgress } from '../../../../lib/cardEntryIntent';
import type {
  ExperimentState,
  SvelteCardInitResult,
  UnitEngineLike,
} from '../../../../../common/types';
import { repairFormattedStimuliResponsesFromRaw } from '../../../../../common/lib/stimuliResponseRepair';
import {
  applyLearnerTdfConfig,
  type LearnerTdfConfig,
} from '../../../../../common/lib/learnerTdfConfig';
import { ensureCurrentStimuliSetId, resolveDynamicAssetPath } from './mediaResolver';
import {
  assertIdInvariants,
  clearConditionResolutionContext,
  logIdInvariantBreachOnce,
  setActiveTdfContext,
  setConditionResolutionContext,
} from '../../../../lib/idContext';


type DeliverySettingsLike = Record<string, unknown>;
type StimLike = Record<string, unknown>;

declare const UserDashboardCache: {
  findOne(selector: Record<string, unknown>): { learnerTdfConfigs?: Record<string, LearnerTdfConfig> } | undefined;
};

interface TdfUnitLike extends Record<string, unknown> {
  deliverySettings?: DeliverySettingsLike | DeliverySettingsLike[];
  videosession?: {
    videosource?: string;
  } & Record<string, unknown>;
  assessmentsession?: unknown;
  learningsession?: unknown;
  unitinstructions?: unknown;
}

interface TdfSetSpecLike extends Record<string, unknown> {
  condition?: string[];
  loadbalancing?: string;
  countcompletion?: string;
  randomizedDelivery?: unknown[];
  shuffleclusters?: string;
  swapclusters?: string;
  audioInputEnabled?: string;
  speechAPIKey?: string;
  unitTemplate?: unknown;
}

interface TdfFileLike extends Record<string, unknown> {
  fileName?: string;
  stimuli?: StimLike[];
  tdfs: {
    tutor: {
      setspec: TdfSetSpecLike;
      deliverySettings?: unknown;
      unit?: TdfUnitLike[];
      title?: string;
    };
  };
}

interface TdfDocumentLike extends Record<string, unknown> {
  _id?: string;
  content: TdfFileLike;
  stimuli?: StimLike[];
  stimuliSetId?: string;
  conditionCounts?: number[];
}

async function ensureDashboardCacheForLearnerConfig(): Promise<void> {
  await new Promise<void>((resolve) => {
    const handle = Meteor.subscribe('dashboardCache', {
      onReady: () => resolve(),
      onStop: () => resolve(),
    });
    if (handle.ready()) {
      resolve();
    }
  });
}

async function applyResumeLearnerTdfConfig(tdfFile: TdfFileLike, tdfId: unknown): Promise<TdfFileLike> {
  const normalizedTdfId = typeof tdfId === 'string' ? tdfId.trim() : '';
  const userId = Meteor.userId();
  if (!normalizedTdfId || !userId) {
    return tdfFile;
  }

  await ensureDashboardCacheForLearnerConfig();
  const learnerConfig = UserDashboardCache.findOne({ userId })?.learnerTdfConfigs?.[normalizedTdfId];
  if (!learnerConfig) {
    return tdfFile;
  }

  const result = applyLearnerTdfConfig(tdfFile, learnerConfig);
  if (result.warnings.length) {
    clientConsole(1, '[Resume Service] Learner TDF config warning:', result.warnings.join('; '));
    Session.set('uiMessage', {
      text: result.warnings.join(' '),
      variant: 'warning',
    });
  }
  return result.tdf as TdfFileLike;
}

interface ResumeExperimentState extends ExperimentState {
  conditionTdfId?: string | null;
  clusterMapping?: number[];
  mappingSignature?: string | null;
  schedule?: unknown;
  experimentXCond?: number;
  subTdfIndex?: number;
  conditionNote?: string;
  currentUnitNumber?: number;
}

const RESUME_STATE_PERSIST_FIELDS = [
  'conditionTdfId',
  'experimentXCond',
  'clusterMapping',
  'mappingSignature',
  'currentUnitNumber',
  'subTdfIndex',
] as const satisfies readonly (keyof ResumeExperimentState)[];

function isSameResumeStateValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildResumeStatePatch(
  currentState: ResumeExperimentState,
  stagedState: ResumeExperimentState
): Partial<ResumeExperimentState> {
  const patch: Partial<ResumeExperimentState> = {};
  for (const field of RESUME_STATE_PERSIST_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(stagedState, field)) {
      continue;
    }
    if (!isSameResumeStateValue(currentState[field], stagedState[field])) {
      (patch as Record<keyof ResumeExperimentState, unknown>)[field] = stagedState[field];
    }
  }
  return patch;
}

function getResolvedConditionTdfId(
  currentState: ResumeExperimentState,
  stagedState: ResumeExperimentState
): string | null {
  if (Object.prototype.hasOwnProperty.call(stagedState, 'conditionTdfId')) {
    return stagedState.conditionTdfId ?? null;
  }
  return currentState.conditionTdfId ?? null;
}

interface ResumeEngineLike extends UnitEngineLike {
  unitFinished: () => Promise<boolean>;
  loadResumeState: () => Promise<void>;
  getSchedule?: () => { q?: unknown[] } | null;
  calculateIndices: () => Promise<Record<string, unknown>>;
}

interface TdfsCollectionLike {
  findOne: (query: Record<string, unknown>) => TdfDocumentLike | null;
}

type MeteorUserLike = {
  _id?: string;
  username?: string;
  email_canonical?: string;
  emails?: { address?: string }[];
  loginParams?: { loginMode?: string };
  audioSettings?: { audioInputMode?: boolean };
  lockouts?: Record<string, { currentLockoutUnit?: number; lockoutTimeStamp?: number; lockoutMinutes?: number }>;
};

function getMeteorUser(): MeteorUserLike | null | undefined {
  return Meteor.user() as MeteorUserLike | null | undefined;
}

function getPositiveLockoutMinutes(value: unknown): number {
  if (Array.isArray(value)) {
    return getPositiveLockoutMinutes(value[0]);
  }
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function getLockoutMinutesFromParams(params: unknown): number {
  if (!params || typeof params !== 'object') {
    return 0;
  }
  const rec = params as Record<string, unknown>;
  return getPositiveLockoutMinutes(rec.lockoutminutes) || getPositiveLockoutMinutes(rec.lockoutMinutes);
}

function getResolvedLockoutMinutesForResume(curTdfUnit: TdfUnitLike | null | undefined): number {
  if (!curTdfUnit || typeof curTdfUnit !== 'object') {
    return 0;
  }

  const unitDelParams = curTdfUnit?.deliverySettings;
  let resolvedSettings: DeliverySettingsLike | null = null;
  if (Array.isArray(unitDelParams)) {
    if (unitDelParams.length < 1) {
      return 0;
    }
    let xcondIndex = Number.parseInt(String(Session.get('experimentXCond') ?? 0), 10);
    if (!Number.isFinite(xcondIndex) || xcondIndex < 0 || xcondIndex >= unitDelParams.length) {
      xcondIndex = 0;
    }
    resolvedSettings = unitDelParams[xcondIndex] ?? unitDelParams[0] ?? null;
  } else if (unitDelParams && typeof unitDelParams === 'object') {
    resolvedSettings = unitDelParams;
  } else {
    return 0;
  }

  if (!resolvedSettings) {
    return 0;
  }

  return getLockoutMinutesFromParams(resolvedSettings);
}

function findTdf(query: Record<string, unknown>): TdfDocumentLike | null {
  return (globalThis as typeof globalThis & { Tdfs?: TdfsCollectionLike }).Tdfs?.findOne(query) ?? null;
}

function sampleItem<T>(items: readonly T[]): T | undefined {
  if (!items.length) {
    return undefined;
  }
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * @param {string} text
 * @param {string} [variant='danger']
 * @returns {void}
 */
function setUiMessage(text: string, variant = 'danger'): void {
  Session.set('uiMessage', {
    text,
    variant
  });
}

/**
 * @param {string} message
 * @param {{redirectTo?: string, variant?: string}} [options={}]
 * @returns {SvelteCardInitResult}
 */
function handleResumeFailure(message: string, options: { redirectTo?: string; variant?: string } = {}): SvelteCardInitResult {
  const { redirectTo = '/home', variant = 'danger' } = options;
  setUiMessage(message, variant);
  Session.set('appLoading', false);
  Session.set('resumeInProgress', false);
  Session.set('inResume', false);
  return { redirected: true, redirectTo, error: message };
}

/**
 * @param {Record<string, unknown> | null | undefined} tdfFile
 * @returns {Record<string, unknown>[] | null}
 */
function getUnitListFromTdf(tdfFile: TdfFileLike | null | undefined): TdfUnitLike[] | null {
  if (!tdfFile || !tdfFile.tdfs || !tdfFile.tdfs.tutor) {
    return null;
  }
  const unitList = tdfFile.tdfs.tutor.unit;
  if (!Array.isArray(unitList) || unitList.length === 0) {
    return null;
  }
  return unitList;
}

// Helper: validate root TDF has required structure (condition container, may not have units)
// This prevents race conditions where subscription returns partial document
/**
 * @param {Record<string, unknown> | null | undefined} tdf
 * @returns {boolean}
 */
function isValidRootTdf(tdf: TdfDocumentLike | null | undefined): boolean {
  return !!(tdf &&
         tdf.content &&
         tdf.content.tdfs &&
         tdf.content.tdfs.tutor &&
         tdf.content.tdfs.tutor.setspec);
}

// Helper: validate condition TDF has required structure including unit array
/**
 * @param {Record<string, unknown> | null | undefined} tdf
 * @returns {boolean}
 */
function isValidConditionTdf(tdf: TdfDocumentLike | null | undefined): boolean {
  return !!(tdf &&
         tdf.content &&
         tdf.content.tdfs &&
         tdf.content.tdfs.tutor &&
         Array.isArray(tdf.content.tdfs.tutor.unit));
}

function validateConditionCounts(
  conditionCounts: unknown,
  conditionOptions: string[],
  source: string
): number[] {
  if (!Array.isArray(conditionCounts)) {
    throw new Error(`${source}: root TDF conditionCounts must be an array when loadbalancing is enabled.`);
  }
  if (conditionCounts.length !== conditionOptions.length) {
    throw new Error(
      `${source}: root TDF conditionCounts length ${conditionCounts.length} does not match condition length ${conditionOptions.length}.`
    );
  }
  return conditionCounts.map((count, index) => {
    if (!Number.isFinite(Number(count)) || Number(count) < 0) {
      throw new Error(`${source}: invalid condition count at index ${index}.`);
    }
    return Number(count);
  });
}

function getConditionIndexOrThrow(conditions: string[], conditionFileName: unknown, source: string) {
  const normalizedConditionFileName = typeof conditionFileName === 'string' ? conditionFileName.trim() : '';
  if (!normalizedConditionFileName) {
    throw new Error(`${source}: current condition TDF fileName is missing.`);
  }
  const conditionIndex = conditions.indexOf(normalizedConditionFileName);
  if (conditionIndex < 0) {
    throw new Error(`${source}: condition "${normalizedConditionFileName}" is not listed in the root TDF condition array.`);
  }
  return conditionIndex;
}

/**
 * @returns {void}
 */
function preloadVideos(): void {
  if (Session.get('currentTdfUnit') &&
    Session.get('currentTdfUnit').videosession &&
    Session.get('currentTdfUnit').videosession.videosource) {
    const resolvedVideo = resolveDynamicAssetPath(
      Session.get('currentTdfUnit').videosession.videosource,
      { logPrefix: '[Resume Service]' }
    );
    if (resolvedVideo) {
      CardStore.setVideoSource(resolvedVideo);
    }
  }
}

/**
 * Resume from canonical experiment/global state - FULL VERSION
 *
 * This function restores ALL session state from the server when a user returns.
 *
 * @param {Object} initialTdfFile - The current TDF file (may be root or condition TDF)
 * @returns {Promise<SvelteCardInitResult>} Result object for svelteInit to handle
 */
export async function resumeFromExperimentState(_initialTdfFile: unknown): Promise<SvelteCardInitResult> {
  let resolvedUnitList: TdfUnitLike[] | null = null;
  let resolvedTdfFile: TdfFileLike | null = null;
  if (Session.get('resumeInProgress')) {
    clientConsole(2, 'RESUME DENIED - already running in resumeInProgress');
    return { redirected: true, redirectTo: '/card' };
  }
  Session.set('resumeInProgress', true);
  Session.set('uiMessage', null);

  if (Session.get('inResume')) {
    clientConsole(2, 'RESUME DENIED - already running in resume');
    Session.set('resumeInProgress', false);
    return { redirected: true, redirectTo: '/card' };
  }
  Session.set('inResume', true);
  assertIdInvariants('resume.start', { requireCurrentTdfId: false, requireStimuliSetId: false });

  clientConsole(2, 'Resuming from canonical experiment state');

  try {
    CardStore.setTrialStartTimestamp(0);
    CardStore.setTrialEndTimestamp(0);
    CardStore.setCurTimeoutId(undefined);
    CardStore.setCurIntervalId(undefined);
    CardStore.setVarLenTimeoutName(undefined);
    CardStore.setScrollListCount(0);
    CardStore.setDisplayReady(false);
    CardStore.setInputReady(false);
    CardStore.setInFeedback(false);

    const feedbackDisplay = document.getElementById('feedbackDisplay');
    if (feedbackDisplay) feedbackDisplay.innerHTML = '';
    const feedbackDisplayButtons = document.getElementById('feedbackDisplayButtons');
    if (feedbackDisplayButtons) feedbackDisplayButtons.innerHTML = '';
    const userLowerInteraction = document.getElementById('userLowerInteraction');
    if (userLowerInteraction) userLowerInteraction.innerHTML = '';

    // ====================
    // EXPERIMENTAL CONDITIONS
    // ====================

    const rootTdfId = Session.get('currentRootTdfId') || Session.get('currentTdfId');
    let rootTDFBoxed: TdfDocumentLike | null = null;
    try {
      const launchReadyRoot = await loadLaunchReadyTdf(rootTdfId, {
        allowConditionRoot: true,
        source: 'resume.root',
      });
      rootTDFBoxed = launchReadyRoot.tdfDoc as TdfDocumentLike;
    } catch (error) {
      clientConsole(1, 'PANIC: Unable to load the launch-ready root TDF for learning', rootTdfId, error);
      return handleResumeFailure('Unfortunately, the root TDF could not be loaded. Please contact your administrator.');
    }
    if (!rootTDFBoxed || !isValidRootTdf(rootTDFBoxed)) {
      clientConsole(1, 'PANIC: Root TDF failed root invariant after launch-ready load', rootTdfId);
      return handleResumeFailure('Unfortunately, the root TDF could not be loaded. Please contact your administrator.');
    }

    let curTdf: TdfDocumentLike | null = rootTDFBoxed;
    let rootTDF: TdfFileLike = rootTDFBoxed.content;
    if (!rootTDF) {
      clientConsole(2, 'PANIC: Root TDF has no content', Session.get('currentRootTdfId'));
      return handleResumeFailure('Unfortunately, something is broken and this lesson cannot continue.');
    }

    const setspec = rootTDF.tdfs.tutor.setspec;
    const conditionOptions = setspec.condition ?? [];
    const needExpCondition = conditionOptions.length > 0;

    let curExperimentState = (await getExperimentState()) as ResumeExperimentState;
    const newExperimentState = JSON.parse(JSON.stringify(curExperimentState)) as ResumeExperimentState;

    if (needExpCondition) {
      clientConsole(2, 'Experimental condition is required: searching');
      const prevCondition = curExperimentState.conditionTdfId;

      let conditionTdfId: string | null = null;

      if (prevCondition) {
        clientConsole(2, 'Found previous experimental condition: using that');
        conditionTdfId = prevCondition;
        setConditionResolutionContext({ conditionTdfId }, 'resume.condition.previous');
      } else {
        // No previous condition - need to select one
        if(!setspec.loadbalancing){
          // Random selection
          clientConsole(2, 'No previous experimental condition: Selecting from ' + conditionOptions.length);
          const randomConditionFileName = sampleItem(conditionOptions);
          if (!randomConditionFileName) {
            return handleResumeFailure('Unfortunately, no experiment condition was available to select.');
          }
          let conditionTdf = findTdf({ 'content.fileName': randomConditionFileName });
          if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
            clientConsole(1, 'Condition TDF not found or incomplete in client collection, fetching from server:', randomConditionFileName);
            conditionTdf = await meteorCallAsync<TdfDocumentLike | null>('getTdfByFileName', randomConditionFileName);
            if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
              clientConsole(1, 'Could not find condition TDF:', randomConditionFileName);
              return handleResumeFailure('Unfortunately, the experiment condition TDF could not be found. Please contact your administrator.');
            }
          }
          conditionTdfId = conditionTdf._id ?? null;
          newExperimentState.conditionTdfId = conditionTdfId;
          newExperimentState.conditionNote = `Selected from ${conditionOptions.length} conditions`;
          clientConsole(2, 'Exp Condition', conditionTdfId, newExperimentState.conditionNote);
        } else {
          // Load balancing
          const conditionCounts = validateConditionCounts(
            rootTDFBoxed.conditionCounts,
            conditionOptions,
            'resume.condition.loadbalancing'
          );
          if(setspec.loadbalancing == "max"){
            // Select randomly from conditions with count less than max
            let max = 0;
            let maxConditions: string[] = [];
            for (const [index] of conditionOptions.entries()) {
              const count = conditionCounts[index]!;
              if (count > max) {
                max = count;
              }
            }
            for (const [index, conditionFileName] of conditionOptions.entries()) {
              if (conditionCounts[index]! < max) {
                maxConditions.push(conditionFileName);
              }
            }
            if(maxConditions.length == 0){
              maxConditions = conditionOptions;
            }
            const randomConditionFileName = sampleItem(maxConditions);
            if (!randomConditionFileName) {
              return handleResumeFailure('Unfortunately, no experiment condition was available to select.');
            }
            let conditionTdf = findTdf({ 'content.fileName': randomConditionFileName });
            if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
              clientConsole(1, 'Condition TDF not found or incomplete in client collection, fetching from server:', randomConditionFileName);
              conditionTdf = await meteorCallAsync<TdfDocumentLike | null>('getTdfByFileName', randomConditionFileName);
            if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
              clientConsole(1, 'Could not find condition TDF:', randomConditionFileName);
              return handleResumeFailure('Unfortunately, the experiment condition TDF could not be found. Please contact your administrator.');
            }
          }
            conditionTdfId = conditionTdf._id ?? null;
          } else if(setspec.loadbalancing == "min"){
            // Select randomly from conditions with count equal to min
            let min = 1000000000;
            let minConditions: string[] = [];
            for (const [index] of conditionOptions.entries()) {
              const count = conditionCounts[index]!;
              if (count < min) {
                min = count;
              }
            }
            for (const [index, conditionFileName] of conditionOptions.entries()) {
              if (conditionCounts[index]! === min) {
                minConditions.push(conditionFileName);
              }
            }
            if(minConditions.length == 0){
              minConditions = conditionOptions;
            }
            const randomConditionFileName = sampleItem(minConditions);
            if (!randomConditionFileName) {
              return handleResumeFailure('Unfortunately, no experiment condition was available to select.');
            }
            let conditionTdf = findTdf({ 'content.fileName': randomConditionFileName });
            if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
              clientConsole(1, 'Condition TDF not found or incomplete in client collection, fetching from server:', randomConditionFileName);
              conditionTdf = await meteorCallAsync<TdfDocumentLike | null>('getTdfByFileName', randomConditionFileName);
            if (!conditionTdf || !isValidConditionTdf(conditionTdf)) {
              clientConsole(1, 'Could not find condition TDF:', randomConditionFileName);
              return handleResumeFailure('Unfortunately, the experiment condition TDF could not be found. Please contact your administrator.');
            }
          }
            conditionTdfId = conditionTdf._id ?? null;
            clientConsole(2, 'conditionTdf, conditionTdfId', conditionTdf, conditionTdf._id);
          } else {
            clientConsole(2, 'Invalid loadbalancing parameter');
            return handleResumeFailure('Unfortunately, something is broken and this lesson cannot continue.');
          }
        }

        if (setspec.countcompletion == "beginning") {
          rootTDFBoxed = findTdf({ _id: Session.get('currentRootTdfId') });
          if (!rootTDFBoxed || !isValidRootTdf(rootTDFBoxed)) {
            rootTDFBoxed = await meteorCallAsync<TdfDocumentLike | null>('getTdfById', Session.get('currentRootTdfId'));
          }
          if (rootTDFBoxed && rootTDFBoxed.conditionCounts) {
            const conditions = rootTDF.tdfs.tutor.setspec.condition ?? [];
            validateConditionCounts(
              rootTDFBoxed.conditionCounts,
              conditions,
              'resume.condition.count-beginning'
            );
            let conditionTdfForFileName = findTdf({ _id: conditionTdfId });
            if (!conditionTdfForFileName || !conditionTdfForFileName.content) {
              conditionTdfForFileName = await meteorCallAsync<TdfDocumentLike | null>('getTdfById', conditionTdfId);
            }
            const conditionFileName = conditionTdfForFileName?.content?.fileName;
            const conditionIndex = getConditionIndexOrThrow(conditions, conditionFileName, 'resume.condition.count-beginning');
            if (!Session.get('ownerDashboardLaunch')) {
              await meteorCallAsync('incrementTdfConditionCount', Session.get('currentRootTdfId'), conditionIndex);
            }
          }
        }

        newExperimentState.conditionTdfId = conditionTdfId;
        setConditionResolutionContext({ conditionTdfId }, 'resume.condition.resolve');
        await createExperimentState({
          currentRootTdfId: Session.get('currentRootTdfId'),
          currentTdfId: conditionTdfId,
          conditionTdfId,
        });
      }

      if (!conditionTdfId) {
        clientConsole(2, 'No experimental condition could be selected!');
        return handleResumeFailure('Unfortunately, something is broken and this lesson cannot continue.');
      }

      setActiveTdfContext({
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: conditionTdfId,
      }, 'resume.condition.activate');
      setConditionResolutionContext({ conditionTdfId }, 'resume.condition.activate');

      try {
        const launchReadyCondition = await loadLaunchReadyTdf(conditionTdfId, {
          allowConditionRoot: false,
          source: 'resume.condition.activate',
        });
        curTdf = launchReadyCondition.tdfDoc as TdfDocumentLike;
      } catch (error) {
        clientConsole(1, 'Could not load launch-ready condition TDF by ID:', conditionTdfId, error);
        return handleResumeFailure('Unfortunately, the experiment condition TDF could not be loaded. Please contact your administrator.');
      }
      if (!curTdf || !isValidConditionTdf(curTdf)) {
        clientConsole(1, 'Condition TDF failed invariant after launch-ready load:', conditionTdfId);
        return handleResumeFailure('Unfortunately, the experiment condition TDF could not be loaded. Please contact your administrator.');
      }
      Session.set('currentTdfFile', curTdf.content);
      Session.set('currentTdfName', curTdf.content.fileName);
      setActiveTdfContext({
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: conditionTdfId,
        currentStimuliSetId: curTdf.stimuliSetId,
      }, 'resume.condition.activate.stimuli');
      ensureCurrentStimuliSetId(curTdf.stimuliSetId);
      clientConsole(2, 'condition stimuliSetId', curTdf);
    } else {
      newExperimentState.conditionTdfId = null;
      Session.set('currentTdfFile', rootTDF);
      Session.set('currentTdfName', rootTDF.fileName);
      setActiveTdfContext({
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentRootTdfId'),
        currentStimuliSetId: rootTDFBoxed.stimuliSetId,
      }, 'resume.no-condition.revert-root');
      clearConditionResolutionContext('resume.no-condition.revert-root');
      ensureCurrentStimuliSetId(rootTDFBoxed.stimuliSetId);
      clientConsole(2, 'No Experimental condition is required: continuing', rootTDFBoxed);
    }

    if (!curTdf) {
      return handleResumeFailure('Unable to resolve the current lesson configuration.');
    }

    ensureCurrentStimuliSetId(curTdf?.stimuliSetId || rootTDFBoxed?.stimuliSetId);

    const stimuliSet = curTdf.stimuli;
    Session.set(
      'currentStimuliSet',
      repairFormattedStimuliResponsesFromRaw(stimuliSet, curTdf.rawStimuliFile)
    );
    CardStore.setFeedbackUnset(Session.get('fromInstructions') || CardStore.isFeedbackUnset());
    Session.set('fromInstructions', false);

    if (setspec.randomizedDelivery && setspec.randomizedDelivery.length) {
      clientConsole(2, 'xcond for delivery settings is sys assigned: searching');
      const prevExperimentXCond = curExperimentState.experimentXCond;

      let experimentXCond;

      if (prevExperimentXCond !== undefined && prevExperimentXCond !== null) {
        clientConsole(2, 'Found previous xcond for delivery');
        experimentXCond = prevExperimentXCond;
      } else {
        clientConsole(2, 'NO previous xcond for delivery - selecting one');
        const rawXcondCount = Array.isArray(setspec.randomizedDelivery)
          ? setspec.randomizedDelivery[0]
          : undefined;
        const xcondCount = Number.parseInt(String(rawXcondCount ?? ''), 10);
        if (!Number.isFinite(xcondCount) || xcondCount <= 0) {
          return handleResumeFailure('Unable to resolve randomized delivery settings for this lesson.');
        }
        experimentXCond = Math.floor(Math.random() * xcondCount);
        newExperimentState.experimentXCond = experimentXCond;
      }

      clientConsole(2, 'Setting XCond from sys-selection', experimentXCond);
      Session.set('experimentXCond', experimentXCond);
    }

    const stimCount = getStimCount();
    const currentTdfFile = Session.get('currentTdfFile') as TdfFileLike | null;
    const setSpec = currentTdfFile?.tdfs?.tutor?.setspec;
    if (!setSpec) {
      return handleResumeFailure('Unable to load lesson delivery settings. Please contact your administrator.');
    }
    const shuffles = setSpec.shuffleclusters ? setSpec.shuffleclusters.trim().split(" ") : [''];
    const swaps = setSpec.swapclusters ? setSpec.swapclusters.trim().split(" ") : [''];
    let mappingRecord = loadMappingRecord(curExperimentState);
    const mappingMissing = !mappingRecord || !Array.isArray(mappingRecord.mappingTable) || mappingRecord.mappingTable.length === 0;
    const mappingIncompatible = !mappingMissing && !validateMappingRecord(mappingRecord, stimCount, setSpec);
    const mappingNeedsIntervention = mappingMissing || mappingIncompatible;

    if (mappingNeedsIntervention) {
      if (hasMeaningfulMappingProgress(curExperimentState)) {
        clientConsole(1, '[Resume Service] Cluster mapping missing/incompatible with current setSpec; blocking resume (resume compatibility policy)', {
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
        return handleResumeFailure(
          'Saved progress cannot be resumed because this lesson content changed. Restart the lesson to continue.',
          { redirectTo: '/home', variant: 'warning' }
        );
      }

      clientConsole(1, '[Resume Service] No meaningful progress detected; creating initial cluster mapping');
      clientConsole(2, 'shuffles.length', shuffles.length);
      clientConsole(2, 'swaps.length', swaps.length);
      mappingRecord = createMappingRecord({
        stimCount,
        shuffles: shuffles || [],
        swaps: swaps || [],
      });
      newExperimentState.clusterMapping = mappingRecord.mappingTable;
      clientConsole(2, 'Cluster mapping created', mappingRecord.mappingTable);
    } else {
      clientConsole(2, 'Cluster mapping validated', mappingRecord?.mappingTable);
    }

    const clusterMapping = mappingRecord?.mappingTable || [];
    if (!clusterMapping || !clusterMapping.length || clusterMapping.length !== stimCount) {
      clientConsole(2, 'Invalid cluster mapping', stimCount, clusterMapping);
      throw new Error('The cluster mapping is invalid - can not continue');
    }

    const { signature: currentMappingSignature } = createMappingSignature({
      tdfFile: curTdf.content,
      rootTdfId: Session.get('currentRootTdfId'),
      conditionTdfId: getResolvedConditionTdfId(curExperimentState, newExperimentState),
      stimuliSetId: Session.get('currentStimuliSetId'),
      stimuliSet: Session.get('currentStimuliSet'),
      stimCount,
    });
    const persistedMappingSignature = typeof curExperimentState.mappingSignature === 'string'
      ? curExperimentState.mappingSignature
      : null;
    const signatureMismatch = !!persistedMappingSignature && persistedMappingSignature !== currentMappingSignature;
    const enforceableSignatureMismatch = signatureMismatch;
    const strictMismatchEnforcement = isStrictMappingMismatchEnforcementEnabled();
    let signatureMismatchHasMeaningfulProgress = false;
    if (enforceableSignatureMismatch) {
      const progressed = hasMeaningfulMappingProgress(curExperimentState);
      signatureMismatchHasMeaningfulProgress = progressed;
      const hardStop = strictMismatchEnforcement && progressed;
      const mismatchPayload = {
        eventType: 'mapping-hard-stop',
        reason: 'signature-mismatch',
        hardStop,
        strictMismatchEnforcement,
        progressed,
        userMessage: 'Saved progress cannot be resumed because this lesson content changed. Restart the lesson to continue.',
        persistedMappingSignature,
        currentMappingSignature,
        rootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId'),
        conditionTdfId: getResolvedConditionTdfId(curExperimentState, newExperimentState),
        stimuliSetId: Session.get('currentStimuliSetId'),
      };
      clientConsole(1, '[Resume Service] Mapping signature mismatch detected', mismatchPayload);
      if (hardStop) {
        return handleResumeFailure(mismatchPayload.userMessage, {
          redirectTo: '/home',
          variant: 'warning',
        });
      }
    }

    if (
      !persistedMappingSignature ||
      persistedMappingSignature === currentMappingSignature ||
      (enforceableSignatureMismatch && !signatureMismatchHasMeaningfulProgress)
    ) {
      newExperimentState.mappingSignature = currentMappingSignature;
    }

    mappingRecord = {
      ...(mappingRecord || { mappingTable: clusterMapping, createdAt: Date.now(), mappingSignature: null }),
      mappingTable: clusterMapping,
      mappingSignature:
        !persistedMappingSignature ||
        persistedMappingSignature === currentMappingSignature ||
        (enforceableSignatureMismatch && !signatureMismatchHasMeaningfulProgress)
          ? currentMappingSignature
          : persistedMappingSignature,
    };
    applyMappingRecordToSession(mappingRecord);

    if (curExperimentState.currentUnitNumber !== undefined && curExperimentState.currentUnitNumber !== null) {
      Session.set('currentUnitNumber', curExperimentState.currentUnitNumber);
    } else {
      Session.set('currentUnitNumber', 0);
      newExperimentState.currentUnitNumber = 0;
    }
    clientConsole(2, '[Resume Service] Restored currentUnitNumber:', Session.get('currentUnitNumber'));

    resolvedTdfFile = curTdf?.content ?? null;
    if (resolvedTdfFile) {
      resolvedTdfFile = await applyResumeLearnerTdfConfig(
        resolvedTdfFile,
        curTdf?._id || Session.get('currentTdfId') || Session.get('currentRootTdfId')
      );
      if (curTdf) {
        curTdf.content = resolvedTdfFile;
      }
      rootTDF = resolvedTdfFile;
    }
    resolvedUnitList = getUnitListFromTdf(resolvedTdfFile);
    if (!resolvedUnitList) {
      clientConsole(1, '[Resume Service] Launch-ready TDF did not contain a runnable unit list', {
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId'),
      });
    }
    if (!resolvedTdfFile || !resolvedUnitList) {
      logIdInvariantBreachOnce('resume:missing-unit-list', {
        currentUnitNumber: Session.get('currentUnitNumber') ?? null,
      });
      clientConsole(1, '[Resume Service] No unit list found for current TDF after fetch', {
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId'),
      });
      return handleResumeFailure('Unable to load lesson units. Please contact your administrator.');
    }
    curTdf.content = resolvedTdfFile;
    Session.set('currentTdfFile', resolvedTdfFile);
    if (resolvedTdfFile.fileName) {
      Session.set('currentTdfName', resolvedTdfFile.fileName);
    }
    ensureCurrentStimuliSetId(curTdf?.stimuliSetId);
    const unitList = resolvedUnitList as TdfUnitLike[];
    const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);

    if (currentUnitNumber > unitList.length - 1) {
      return handleResumeFailure('You have completed all the units in this lesson.', {
        redirectTo: COMPLETED_LESSON_REDIRECT,
        variant: 'info'
      });
    }

    const curTdfUnit = unitList[currentUnitNumber];
    if (!curTdfUnit) {
      clientConsole(1, '[Resume Service] Current unit missing from unit list', {
        currentUnitNumber,
        totalUnits: unitList.length,
        currentTdfId: Session.get('currentTdfId'),
      });
      return handleResumeFailure('Unable to load the current unit for this lesson. Please contact your administrator.');
    }
    if (curTdfUnit.videosession) {
      Session.set('isVideoSession', true)
      clientConsole(2, 'video type questions detected, pre-loading video');
      preloadVideos();
    } else {
      Session.set('isVideoSession', false)
    }
    Session.set('currentTdfUnit', curTdfUnit);
    clientConsole(2, 'resume, currentTdfUnit:', curTdfUnit);

    const resumeStatePatch = buildResumeStatePatch(curExperimentState, newExperimentState);
    if (Object.keys(resumeStatePatch).length > 0) {
      clientConsole(2, '[Resume Service] Persisting resolved resume state:', Object.keys(resumeStatePatch));
      await createExperimentState(resumeStatePatch);
      const persistedState = ExperimentStateStore.get() as ResumeExperimentState | undefined;
      curExperimentState = {
        ...curExperimentState,
        ...resumeStatePatch,
        ...(persistedState || {}),
      };
    }

    // =========================================================================
    // HISTORY RECONSTRUCTION (CORE RESUME LOGIC)
    // =========================================================================
    const isLearningUnit = !!curTdfUnit?.learningsession;
    const isAssessmentUnit = !!curTdfUnit?.assessmentsession;

    let completedAssessmentTrials = 0;
    let assessmentHasDurableResumeProgress = false;

    if (isLearningUnit) {
      clientConsole(2, '[Resume Service] Learning unit detected; reconstructing state from history');
      const historyRows = await meteorCallAsync<LearningHistoryRecord[]>(
        'getLearningHistoryForUnit',
        Meteor.userId(),
        Session.get('currentTdfId'),
        currentUnitNumber
      );
      
      const reconstruction = reconstructLearningStateFromHistory(historyRows);
      
      // Populate Session aggregates (Legacy compatibility for UI/Dashboard)
      Session.set('overallOutcomeHistory', reconstruction.overallOutcomeHistory);
      Session.set('overallStudyHistory', reconstruction.overallStudyHistory);
      
      // Update CardStore with reconstructed learning aggregates
      CardStore.setReconstructedLearningState(reconstruction);
      
      clientConsole(2, '[Resume Service] History reconstruction complete', {
        trialsReplayed: historyRows.length,
        outcomes: reconstruction.overallOutcomeHistory.length
      });
    } else if (isAssessmentUnit) {
      clientConsole(2, '[Resume Service] Assessment unit detected; inferring position from history');
      completedAssessmentTrials = await meteorCallAsync<number>(
        'getAssessmentCompletedTrialCountFromHistory',
        Meteor.userId(),
        Session.get('currentTdfId'),
        currentUnitNumber
      );
      assessmentHasDurableResumeProgress = hasAssessmentResumeProgress(
        curExperimentState,
        currentUnitNumber,
        completedAssessmentTrials
      );
      
      // Assessment units use questionIndex as the authoritative pointer.
      // We set it to the count of completed trials.
      CardStore.setQuestionIndex(completedAssessmentTrials);
      
      clientConsole(2, '[Resume Service] Assessment position inferred', {
        completedTrialCount: completedAssessmentTrials,
        newIndex: completedAssessmentTrials,
        assessmentHasDurableResumeProgress,
      });
    } else {
      Session.set('overallOutcomeHistory', []);
      Session.set('overallStudyHistory', []);
    }

    CardStore.setQuestionIndex(CardStore.getQuestionIndex() || 0);

    // ====================
    // ====================

    if (CardStore.isFeedbackUnset()){
      CardStore.setFeedbackUnset(false);
    }

    // ====================
    // ====================

    const tdfFile = resolvedTdfFile || (Session.get('currentTdfFile') as TdfFileLike | null);

    Session.set('currentUnitStartTime', Date.now());

    // Progress state is now derived from history reconstruction above
    Session.set('clozeQuestionParts', undefined);
    Session.set('testType', undefined);
    CardStore.setOriginalQuestion(undefined);
    CardStore.setCurrentAnswer(undefined);
    CardStore.setAlternateDisplayIndex(undefined);
    if (typeof curExperimentState.subTdfIndex === 'number' && Number.isInteger(curExperimentState.subTdfIndex)) {
      Session.set('subTdfIndex', curExperimentState.subTdfIndex);
    } else {
      Session.set('subTdfIndex', undefined);
    }
    CardStore.setCurrentDisplay(undefined);

    let moduleCompleted = false;

    async function resetEngine(curUnitNum: number): Promise<ResumeEngineLike> {
      const curExperimentData = { curExperimentState };
      const unitListForEngine = resolvedUnitList || tdfFile?.tdfs?.tutor?.unit;
      const unit = unitListForEngine?.[curUnitNum];
      if (!unit) {
        throw new Error('Resume failed to resolve a valid unit for engine reset.');
      }

      return await createUnitEngineForUnit(unit, curExperimentData, {
        source: 'resumeService.resetEngine',
        unit,
        unitNumber: curUnitNum,
      }) as ResumeEngineLike;
    }

    const unitCount = resolvedUnitList ? resolvedUnitList.length : 0;
    const launchProgress = resolveCardLaunchProgress(curExperimentState, unitCount);
    moduleCompleted = launchProgress.moduleCompleted;

    if (moduleCompleted) {
      clientConsole(2, 'TDF already completed - leaving for learning dashboard.');
      Session.set('inResume', false);
      Session.set('resumeInProgress', false);
      return { redirected: true, redirectTo: COMPLETED_LESSON_REDIRECT };
    }

    if (curTdfUnit.assessmentsession) {
      try {
        assertAssessmentScheduleArtifactForUnit(curExperimentState, currentUnitNumber);
      } catch (error) {
        clientConsole(1, '[Resume Service] Assessment resume missing persisted schedule artifact', {
          currentTdfId: Session.get('currentTdfId'),
          currentUnitNumber,
          scheduleUnitNumber: curExperimentState?.scheduleUnitNumber ?? null,
          hasSchedule: !!curExperimentState?.schedule,
          error,
        });
        return handleResumeFailure(
          'This assessment cannot be resumed because its saved schedule is missing.',
          { redirectTo: '/home', variant: 'warning' }
        );
      }
    }

    // Seed the canonical store before engine reset so schedule units reuse the
    // persisted artifact instead of silently generating a new schedule.
    ExperimentStateStore.set(curExperimentState);
    const engine = await resetEngine(Session.get('currentUnitNumber'));
    clearPreparedNextRuntimeState(engine, 'resume-entry');

    if (!Session.get('currentTdfUnit') && curTdfUnit) {
      clientConsole(1, '[Resume Service] currentTdfUnit missing before delivery param load; restoring from resolved unit');
      Session.set('currentTdfUnit', curTdfUnit);
    }
    refreshCurrentDeliverySettingsStore();
    CardStore.setScoringEnabled(Boolean((deliverySettingsStore.get() as Record<string, unknown>).scoringEnabled));

    await engine.loadResumeState();

    // Meteor.userId() is the reliable auth signal (backed by the login
    // token in localStorage).  Meteor.user() fields arrive later via DDP
    // and may not be populated yet after heavy async work like
    // loadResumeState.  Use userId for the auth gate and treat the display
    // identifier as best-effort.
    const userId = Meteor.userId() as string | null;
    const currentTdfId = Session.get('currentTdfId');
    if (!userId) {
      clientConsole(1, '[Resume Service] No authenticated user after loadResumeState', { currentTdfId });
      return handleResumeFailure('Unable to restore user session state. Please sign in again.');
    }
    const curUser = getMeteorUser();
    const userDisplayIdentifier = getUserDisplayIdentifier(curUser) || userId;

    if (curTdfUnit.assessmentsession) {
      const scheduleArtifact = typeof engine.getSchedule === 'function'
        ? engine.getSchedule()
        : Session.get('schedule');
      const scheduleLength = Array.isArray(scheduleArtifact?.q) ? scheduleArtifact.q.length : 0;
      assertAssessmentScheduleBounds(scheduleLength, completedAssessmentTrials);
      const derivedScheduleCursor = deriveAssessmentScheduleCursor(completedAssessmentTrials);
      if (typeof engine.setScheduleCursor !== 'function') {
        throw new Error('Assessment resume requires schedule engines to expose setScheduleCursor');
      }
      engine.setScheduleCursor(derivedScheduleCursor);
    }

    Session.set('inResume', false);
    Session.set('resumeInProgress', false);
    await setStudentPerformance(userId, userDisplayIdentifier, currentTdfId);

    // Video sessions use time-based playback with Plyr, not probability-based card selection
    if(Session.get('isVideoSession')){
      let indices = Session.get('engineIndices');
      if(!indices){
        indices = {
          'clusterIndex': 0,
          'stimIndex': 0
        }
      }
      Session.set('engineIndices', indices);

      const isLastUnit = Session.get("currentUnitNumber") + 1 == Session.get("currentTdfFile").tdfs.tutor.unit.length;
      if(isLastUnit){
        clientConsole(2, '[Resume Service] Last video unit - would show modal');
      }

      // Video sessions use time-based playback, not probability-based card selection
      // Return early to let VideoSessionMode.svelte handle playback
      clientConsole(2, '[Resume Service] Video session detected - returning for video player initialization');
      return {
        redirected: false,
        // Video cards are selected from checkpoint events, not via resume question hydration.
        resumeToQuestion: false,
        moduleCompleted: false,
        engine
      };
    }

    // Simplified: check curUnitInstructionsSeen directly - all units treated equally
    const shouldShowInstructions = !Session.get('curUnitInstructionsSeen')
      && typeof curTdfUnit.unitinstructions !== 'undefined'
      && !(isAssessmentUnit && assessmentHasDurableResumeProgress);

    if (shouldShowInstructions) {
      clientConsole(2, 'RESUME FINISHED: displaying unit instructions');
      return {
        redirected: true,
        redirectTo: '/instructions',
        resumeToQuestion: false,
        moduleCompleted: false,
        engine
      };
    } else {
      if (isAssessmentUnit && assessmentHasDurableResumeProgress) {
        Session.set('curUnitInstructionsSeen', true);
        clientConsole(2, '[Resume Service] Skipping instruction redirect for in-progress assessment resume', {
          currentUnitNumber,
          completedAssessmentTrials,
        });
      }
      if (await engine.unitFinished()) {
        let lockoutMins = getResolvedLockoutMinutesForResume(curTdfUnit);
        if (lockoutMins > 0) {
          let unitStartTimestamp = Number(Session.get('currentUnitStartTime') || 0);
          const meteorUser = getMeteorUser();
          const currentTdfIdForLockout = String(Session.get('currentTdfId') || '');
          const lockoutEntry = meteorUser?.lockouts?.[currentTdfIdForLockout];
          if(lockoutEntry && lockoutEntry.currentLockoutUnit == Session.get('currentUnitNumber')){
            unitStartTimestamp = Number(lockoutEntry.lockoutTimeStamp || unitStartTimestamp);
            lockoutMins = Number(lockoutEntry.lockoutMinutes || lockoutMins);
          }
          const lockoutFreeTime = unitStartTimestamp + (lockoutMins * (60 * 1000));
          if (Date.now() < lockoutFreeTime && (typeof curTdfUnit.unitinstructions !== 'undefined')){
            clientConsole(2, 'RESUME FINISHED: showing lockout instructions');
            return {
              redirected: true,
              redirectTo: '/instructions',
              resumeToQuestion: false,
              moduleCompleted: false,
              engine
            };
          }
        }
      }

      clientConsole(2, 'RESUME FINISHED: next-question logic to commence');

      if(Session.get('unitType') == "model") {
        Session.set('engineIndices', await engine.calculateIndices());
      }

      // Normal continuation
      return {
        redirected: false,
        resumeToQuestion: false,
        moduleCompleted: false,
        engine
      };
    }

  } catch (error) {
    clientConsole(1, '[Resume Service] ERROR during resume:', error);
    return handleResumeFailure('Unfortunately, there was an error resuming your session. Please try again or contact support.');
  }
}
