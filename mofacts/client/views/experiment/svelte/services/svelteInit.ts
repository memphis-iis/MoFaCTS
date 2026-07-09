/**
 * Svelte Card Initialization
 *
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../index';
import { checkUserSession, clientConsole, startSessionCheckInterval } from '../../../../lib/userSessionHelpers';
import { translatePlatformString } from '../../../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
import { ensureStimDisplayTypeMapReady, startStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
import {
  refreshCurrentDeliverySettingsStore,
  getUserDisplayIdentifier,
  setStudentPerformance,
  getStimCount
} from '../../../../lib/currentTestingHelpers';
import {
  getAudioInputSensitivity,
  getAudioPromptMode,
  getAudioPromptSpeakingRate,
  setAudioPromptSpeakingRate
} from '../../../../lib/state/audioState';
import { isAudioPromptModeEnabled } from '../../../../../common/lib/audioPromptMode';
import { audioManager } from '../../../../lib/audioContextManager';
import { setEngine } from '../../../../lib/engineManager';
import { resolveUnitEngineTypeForUnit } from '../../engineConstructors';
import { initializeEngine } from '../services/unitEngineService';
import { initVideoSessionData } from '../services/videoSessionInit';
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
import { setAudioInputModeEnabled } from './audioRuntimeState';
import {
  resetHiddenItems,
  setHiddenItems,
} from './hiddenVisibilityRuntimeState';
import { checkForFileImage, unitHasLockout } from '../../instructions';
import { initializeAudioRecorder } from './speechRecognitionService';
import { leavePage } from './navigationCleanup';
import { ensureCurrentStimuliSetId } from './mediaResolver';
import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
  shouldInlineSessionVideoInstructions,
} from './sessionSurfaceMode';
import { withStartupTimeout } from '../../../../lib/audioStartup';
import { evaluateSrAvailability } from '../../../../lib/audioAvailability';
import { markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../../../lib/launchLoading';
import {
  CARD_ENTRY_INTENT,
  clearCardEntryContext,
  getCardEntryContext,
  setCardEntryIntent,
  shouldUseProgressBootstrapForEntryIntent,
} from '../../../../lib/cardEntryIntent';
import { restoreCourseAssignmentLaunchContextFromState } from '../../../../lib/courseAssignmentLaunchContext';
import {
  describeCardEntryBootstrapMode,
  resolveCardEntryBootstrap,
  type CardEntryIntentValue,
  type CardRefreshRebuildClassification,
} from './cardEntryBootstrap';
import { resolveSvelteEngineInitPolicy } from './svelteEngineInitPolicy';
import {
  markRuntimeResumeInactive,
  resetCardRuntimeForInitialization,
  resolveRuntimeEngine,
  setResumeToQuestion,
} from './cardRuntimeState';
import {
  assertIdInvariants,
  setActiveTdfContext,
} from '../../../../lib/idContext';
import type {
  ExperimentState,
  SvelteCardInitResult,
  UnitEngineLike,
} from '../../../../../common/types';
import { repairFormattedStimuliResponsesFromRaw } from '../../../../../common/lib/stimuliResponseRepair';
import '../../../../../common/Collections';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');
type MeteorUserLike = {
  _id?: string;
  username?: string;
  audioSettings?: { audioInputMode?: boolean };
};

type UnknownRecord = Record<string, unknown>;

interface VideoSessionLike extends UnknownRecord {
  videosource?: string;
  questions?: unknown;
  questiontimes?: unknown;
  checkpointQuestions?: unknown;
  checkpointBehavior?: unknown;
  checkpoints?: unknown[];
  rewindOnIncorrect?: unknown;
}

interface TdfUnitLike extends UnknownRecord {
  assessmentsession?: unknown;
  videosession?: VideoSessionLike;
  learningsession?: unknown;
  autotutorsession?: unknown;
  unitinstructions?: unknown;
  picture?: unknown;
  unitinstructionsquestion?: unknown;
  unitname?: string;
  deliverySettings?: UnknownRecord;
}

interface TdfFileLike extends UnknownRecord {
  tdfs?: {
    tutor?: {
      title?: string;
      deliverySettings?: UnknownRecord;
      unit?: TdfUnitLike[];
      setspec?: {
        audioInputSensitivity?: string;
        audioPromptSpeakingRate?: string;
        audioInputEnabled?: string | boolean;
        speechAPIKey?: string;
        tips?: unknown[];
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
    resetHiddenItems();
    return;
  }

  try {
    markLaunchLoadingTiming('restoreHiddenItemsFromHistory:start');
    const hiddenItems = await meteorCallAsync<Array<string | number>>(
      'getHiddenStimulusKCsFromHistory',
      userId,
      currentTdfId
    );
    setHiddenItems(Array.isArray(hiddenItems) ? hiddenItems : []);
    markLaunchLoadingTiming('restoreHiddenItemsFromHistory:complete', {
      count: Array.isArray(hiddenItems) ? hiddenItems.length : 0,
    });
  } catch (error) {
    clientConsole(1, '[Svelte Init] Failed to restore hidden items from history:', error);
    resetHiddenItems();
  }
}

function restoreCanonicalTdfFileForStandardInit(
  initialTdfFile: TdfFileLike
): ResolvedStandardInitTdfContext {
  const tdfFile = initialTdfFile;
  const tutor = tdfFile.tdfs!.tutor!;

  const resolvedUnits = tdfFile.tdfs?.tutor?.unit;
  if (!Array.isArray(resolvedUnits) || resolvedUnits.length === 0) {
    throw new Error('[Svelte Init] Standard init requires currentTdfFile with a populated tutor.unit array');
  }

  return { tdfFile, tutor };
}

function resolveCardUnitNumberForStandardInit(dispatchContext: CardEntryDispatchContext): number {
  let unitNumber = Session.get('currentUnitNumber');
  if (unitNumber === null || unitNumber === undefined) {
    if (dispatchContext.effectiveIntent === CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
      unitNumber = 0;
      Session.set('currentUnitNumber', unitNumber);
    } else {
      throw new Error(`[Svelte Init] Missing currentUnitNumber for ${String(dispatchContext.requestedIntent || dispatchContext.effectiveIntent || 'unknown')} standard init`);
    }
  }
  const normalizedUnitNumber = Number(unitNumber);
  if (!Number.isFinite(normalizedUnitNumber) || !Number.isInteger(normalizedUnitNumber) || normalizedUnitNumber < 0) {
    throw new Error(`[Svelte Init] Invalid currentUnitNumber for standard init: ${String(unitNumber)}`);
  }
  return normalizedUnitNumber;
}

function assertStandardCardPreconditions(
  tdfFile: TdfFileLike,
  tutor: TutorLike,
  unitNumber: number
): TdfUnitLike {
  if (!tdfFile?.tdfs?.tutor) {
    throw new Error('[Svelte Init] Standard card init requires currentTdfFile.tdfs.tutor');
  }
  if (!tutor.setspec) {
    throw new Error('[Svelte Init] Standard card init requires currentTdfFile.tdfs.tutor.setspec');
  }
  if (!Array.isArray(tutor.unit) || tutor.unit.length === 0) {
    throw new Error('[Svelte Init] Standard card init requires a full tutor.unit array; dashboard listing projections are not runnable card content');
  }
  if (unitNumber >= tutor.unit.length) {
    throw new Error(`[Svelte Init] Unit number ${unitNumber} is out of bounds (0-${tutor.unit.length - 1})`);
  }
  const unit = tutor.unit[unitNumber];
  if (!unit) {
    throw new Error(`[Svelte Init] Cannot retrieve unit at index ${unitNumber}; currentTdfFile unit list is incomplete`);
  }
  const sessionUnit = Session.get('currentTdfUnit');
  if (sessionUnit && sessionUnit !== unit) {
    clientConsole(1, '[Svelte Init] currentTdfUnit disagrees with currentTdfFile/currentUnitNumber; replacing with canonical unit', {
      unitNumber,
      sessionUnitName: sessionUnit?.unitname || null,
      canonicalUnitName: unit.unitname || null,
    });
  }
  Session.set('currentTdfUnit', unit);
  return unit;
}

function normalizeStimuliScopeId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function collectObservedStimuliSetIds(stimuliSet: unknown[]): string[] {
  const observed = new Set<string>();
  for (const stim of stimuliSet as Array<Record<string, unknown>>) {
    const raw = stim?.stimuliSetId;
    const normalized = normalizeStimuliScopeId(raw);
    if (!normalized) {
      continue;
    }
    observed.add(normalized);
    if (observed.size >= 5) {
      break;
    }
  }
  return Array.from(observed.values());
}

function isStimuliSetScopedToExpectedId(stimuliSet: unknown[], expectedStimuliSetId: unknown): boolean {
  const expected = normalizeStimuliScopeId(expectedStimuliSetId);
  if (!expected) {
    return true;
  }
  const observedIds = collectObservedStimuliSetIds(stimuliSet);
  if (!observedIds.length) {
    // Legacy/inline datasets may not stamp stimuliSetId per stim; treat as unknown scope.
    return true;
  }
  return observedIds.every((stimuliSetId) => stimuliSetId === expected);
}

function isBlankIdentityValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}

export function stampAndValidateStandardStimuliIdentity(
  stimuliSet: unknown[],
  expectedStimuliSetId: unknown,
): Array<Record<string, unknown>> {
  const normalizedExpectedStimuliSetId = normalizeStimuliScopeId(expectedStimuliSetId);
  if (!normalizedExpectedStimuliSetId) {
    throw new Error('[Svelte Init] Standard init requires a canonical stimuliSetId before preparing stimuli');
  }

  return stimuliSet.map((stim, index) => {
    if (!stim || typeof stim !== 'object' || Array.isArray(stim)) {
      throw new Error(`[Svelte Init] Standard stimulus ${index} must be an object`);
    }
    const stimulus = stim as Record<string, unknown>;
    const observedStimuliSetId = normalizeStimuliScopeId(stimulus.stimuliSetId);
    if (observedStimuliSetId && observedStimuliSetId !== normalizedExpectedStimuliSetId) {
      throw new Error(
        `[Svelte Init] Standard stimulus ${index} has stimuliSetId ${observedStimuliSetId}; expected ${normalizedExpectedStimuliSetId}`,
      );
    }
    if (isBlankIdentityValue(stimulus.stimulusKC)) {
      throw new Error(`[Svelte Init] Standard stimulus ${index} is missing stimulusKC`);
    }
    if (isBlankIdentityValue(stimulus.clusterKC)) {
      throw new Error(`[Svelte Init] Standard stimulus ${index} is missing clusterKC`);
    }
    if (observedStimuliSetId) {
      return stimulus;
    }
    return {
      ...stimulus,
      stimuliSetId: expectedStimuliSetId,
    };
  });
}

async function ensureCanonicalStimuliSetLoadedForStandardInit(tdfFile: TdfFileLike): Promise<void> {
  const currentScopeId = normalizeStimuliScopeId(Session.get('currentStimuliSetId'));
  const tdfScopeId = normalizeStimuliScopeId(tdfFile.stimuliSetId);
  const expectedScopeId = tdfScopeId || currentScopeId;
  if (tdfScopeId && currentScopeId !== tdfScopeId) {
    setActiveTdfContext({
      currentRootTdfId: Session.get('currentRootTdfId'),
      currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
      currentStimuliSetId: tdfFile.stimuliSetId,
    }, 'svelteInit.stimuli-scope-align');
  }

  const sessionStimuliSet = Session.get('currentStimuliSet');
  if (Array.isArray(sessionStimuliSet) && sessionStimuliSet.length > 0) {
    const repairedSessionStimuliSet = repairFormattedStimuliResponsesFromRaw(
      sessionStimuliSet,
      tdfFile.rawStimuliFile
    );
    const scopedToExpectedId = isStimuliSetScopedToExpectedId(
      repairedSessionStimuliSet as unknown[],
      expectedScopeId
    );
    if (!scopedToExpectedId) {
      clientConsole(1, '[Svelte Init] Discarding stale session stimuli set before mapping validation', {
        expectedStimuliSetId: expectedScopeId,
        observedStimuliSetIds: collectObservedStimuliSetIds(repairedSessionStimuliSet as unknown[]),
        currentTdfId: Session.get('currentTdfId') || null,
        currentRootTdfId: Session.get('currentRootTdfId') || null,
      });
      Session.set('currentStimuliSet', undefined);
    } else {
      const identityCheckedSessionStimuliSet = stampAndValidateStandardStimuliIdentity(
        repairedSessionStimuliSet as unknown[],
        expectedScopeId,
      );
      if (identityCheckedSessionStimuliSet !== sessionStimuliSet) {
        Session.set('currentStimuliSet', identityCheckedSessionStimuliSet);
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
  }

  const inlineStimuliSet = tdfFile.stimuli || tdfFile.content?.stimuli || null;
  if (Array.isArray(inlineStimuliSet) && inlineStimuliSet.length > 0) {
    const repairedInlineStimuliSet = repairFormattedStimuliResponsesFromRaw(
      inlineStimuliSet as Record<string, unknown>[],
      tdfFile.rawStimuliFile
    );
    Session.set(
      'currentStimuliSet',
      stampAndValidateStandardStimuliIdentity(repairedInlineStimuliSet as unknown[], expectedScopeId)
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
    Session.set(
      'currentStimuliSet',
      stampAndValidateStandardStimuliIdentity(fetchedSet, expectedScopeId)
    );
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

type CardEntryDispatchContext = {
  requestedIntent: CardEntryIntentValue;
  effectiveIntent: CardEntryIntentValue;
  prefetchedExperimentState: ExperimentState | null;
  refreshRebuildClassification: CardRefreshRebuildClassification | null;
  requiresConditionResolution: boolean;
  shouldUseProgressBootstrap: boolean;
};

async function initializePersistedProgressResumeCard(
  tdfFile: TdfFileLike,
  effectiveIntent: CardEntryIntentValue
): Promise<SvelteCardInitResult> {
  const resumeResult = await resumeFromExperimentState(tdfFile) as SvelteCardInitResult;

  setResumeToQuestion(!!resumeResult?.resumeToQuestion);

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
  _tdfFile: TdfFileLike,
  _dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  throw new Error(`[Svelte Init] ${CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD} must be resolved before card initialization dispatch`);
}

async function initializeStandardCardEntry(
  initialTdfFile: TdfFileLike,
  dispatchContext: CardEntryDispatchContext
): Promise<SvelteCardInitResult> {
  const { prefetchedExperimentState } = dispatchContext;

  setResumeToQuestion(false);

  if (!prefetchedExperimentState) {
    markLaunchLoadingTiming('getExperimentState:start', { source: 'initializeStandardCardEntry' });
  }
  const experimentState: ExperimentState = prefetchedExperimentState || await getExperimentState();
  if (!prefetchedExperimentState) {
    markLaunchLoadingTiming('getExperimentState:complete', { source: 'initializeStandardCardEntry' });
  }
  restoreCourseAssignmentLaunchContextFromState(experimentState);
  const { tdfFile, tutor } = restoreCanonicalTdfFileForStandardInit(initialTdfFile);

  const tips = tutor.setspec?.tips || [];
  if (Array.isArray(tips) && tips.length) {
    const formattedTips = tips.map((tip) => checkForFileImage(tip));
    Session.set('curTdfTips', formattedTips);
  }

  const currentUnitNumber = resolveCardUnitNumberForStandardInit(dispatchContext);
  const unit = assertStandardCardPreconditions(tdfFile, tutor, currentUnitNumber);
  const unitType = resolveUnitEngineTypeForUnit(unit, '[Svelte Init]');
  Session.set('unitType', unitType);
  clientConsole(2, '[Svelte Init] Resolved unitType:', unitType);

  await checkUserSession();

  startSessionCheckInterval('svelte init');

  await ensureStimDisplayTypeMapReady('svelte init');
  startStimDisplayTypeMapVersionSync('svelte init');

  await ensureCanonicalStimuliSetLoadedForStandardInit(tdfFile);

  let pendingMappingStateUpdate: Record<string, unknown> | null = null;
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
        clientConsole(1, '[Svelte Init] Cluster mapping missing/incompatible with current setSpec; blocking initialization (resume compatibility policy)', {
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
          text: 'Saved progress cannot be resumed because this lesson content changed. Restart the lesson to continue.',
          variant: 'warning',
        });
        await leavePage('/home');
        return {
          redirected: true,
          redirectTo: '/home',
          error: 'cluster-mapping-mismatch',
        };
      }

      clientConsole(1, '[Svelte Init] No meaningful progress detected; creating initial cluster mapping');
      mappingRecord = createMappingRecord({
        stimCount,
        shuffles,
        swaps,
      });
      applyMappingRecordToSession(mappingRecord);
      pendingMappingStateUpdate = {
        ...(pendingMappingStateUpdate || {}),
        clusterMapping: mappingRecord.mappingTable,
      };
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
    const enforceableSignatureMismatch = signatureMismatch;
    const strictMismatchEnforcement = isStrictMappingMismatchEnforcementEnabled();
    let signatureMismatchHasMeaningfulProgress = false;

    if (enforceableSignatureMismatch) {
      const progressed = hasMeaningfulMappingProgress(experimentState);
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
    const shouldUseCurrentMappingSignature =
      !persistedMappingSignature ||
      persistedMappingSignature === currentMappingSignature ||
      (enforceableSignatureMismatch && !signatureMismatchHasMeaningfulProgress);
    const shouldPersistCurrentMappingSignature =
      !persistedMappingSignature ||
      (enforceableSignatureMismatch && !signatureMismatchHasMeaningfulProgress);

    mappingRecord = {
      ...(mappingRecord || { mappingTable: (Session.get('clusterMapping') || []) as number[], createdAt: Date.now(), mappingSignature: null }),
      mappingTable: (mappingRecord?.mappingTable || (Session.get('clusterMapping') || [])) as number[],
      mappingSignature:
        shouldUseCurrentMappingSignature
          ? currentMappingSignature
          : persistedMappingSignature,
    };
    applyMappingRecordToSession(mappingRecord);

    if (shouldPersistCurrentMappingSignature) {
      const stateUpdate: Record<string, unknown> = {
        ...(pendingMappingStateUpdate || {}),
        mappingSignature: currentMappingSignature,
      };
      if (Array.isArray(mappingRecord.mappingTable) && mappingRecord.mappingTable.length === stimCount) {
        stateUpdate.clusterMapping = mappingRecord.mappingTable;
      }
      pendingMappingStateUpdate = stateUpdate;
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

  const existingEngine = resolveRuntimeEngine() as RuntimeEngine | null;
  const currentTdfId = Session.get('currentTdfId');
  const { shouldInitEngine } = resolveSvelteEngineInitPolicy({
    existingEngine,
    expectedUnitType: unitType,
    currentUnitNumber,
    currentTdfId,
    currentUnitName: unit?.unitname,
  });

  if (shouldInitEngine) {
    assertIdInvariants('svelteInit.before-engine-init', {
      requireCurrentTdfId: true,
      requireStimuliSetId: true,
    });
    Session.set('currentUnitNumber', currentUnitNumber);

    markLaunchLoadingTiming('engineInitialization:start', { currentUnitNumber, unitType });
    const engine = await initializeEngine(tdfFile, currentUnitNumber, unitType) as RuntimeEngine;
    markLaunchLoadingTiming('engineInitialization:complete', { currentUnitNumber, unitType });
    engine.__unitNumber = currentUnitNumber;
    engine.__tdfId = currentTdfId;
    engine.__unitName = unit?.unitname || null;
    setEngine(engine);
    Session.set('unitType', unitType);
  }

  const engine = resolveRuntimeEngine() as RuntimeEngine | null;
  if (engine?.loadResumeState) {
    markLaunchLoadingTiming('engineLoadResumeState:start');
    await engine.loadResumeState();
    markLaunchLoadingTiming('engineLoadResumeState:complete');
  }

  if (pendingMappingStateUpdate && Object.keys(pendingMappingStateUpdate).length > 0) {
    clientConsole(2, '[Svelte Init] Persisting validated mapping state:', Object.keys(pendingMappingStateUpdate));
    await createExperimentState(pendingMappingStateUpdate);
  }

  refreshCurrentDeliverySettingsStore();

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
  const sessionContentSurface = resolveSessionContentSurface(resolveSessionSurfaceState({
    sessionUnitType: unitType,
    currentTdfUnit: currentUnit,
  }));
  const canInlineVideoInstructions = shouldInlineSessionVideoInstructions({
    contentSurface: sessionContentSurface,
    lockoutMinutes,
    hasUnitText,
    hasUnitImage,
    hasUnitQuestion,
  });

  if (shouldShowInstructions && !canInlineVideoInstructions) {
    setLaunchLoadingMessage(translatePlatformString(getActiveUiLocale(), 'common.loadingInstructions'));
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
  const runtimeInitSnapshot = resetCardRuntimeForInitialization();

  const cardEntryContext = getCardEntryContext();
  const requestedCardEntryIntent = cardEntryContext.intent;

  let tdfFile = runtimeInitSnapshot.currentTdfFile as TdfFileLike | null | undefined;
  if (!tdfFile || !tdfFile.tdfs || !tdfFile.tdfs.tutor) {
    clientConsole(1, '[Svelte Init] No currentTdfFile - skipping init');
    return { redirected: false };
  }
  tdfFile = tdfFile as TdfFileLike;
  let tutor = tdfFile.tdfs!.tutor!;
  const bootstrapResult = await resolveCardEntryBootstrap({
    requestedCardEntryIntent,
    tdfFile,
    shouldUseProgressBootstrapForEntryIntent,
  });
  if (bootstrapResult.kind === 'redirected') {
    clientConsole(2, '[Svelte Init] card_refresh_rebuild resolved to completed lesson');
    clearCardEntryContext();
    return bootstrapResult.result;
  }
  const {
    effectiveCardEntryIntent,
    prefetchedExperimentState,
    refreshRebuildClassification,
    requiresConditionResolution,
    shouldUseProgressBootstrap,
  } = bootstrapResult.resolution;
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
  if (prefetchedExperimentState) {
    restoreCourseAssignmentLaunchContextFromState(prefetchedExperimentState);
  }
  clearCardEntryContext();
  markRuntimeResumeInactive();

  resetHiddenItems();
  setLaunchLoadingMessage(translatePlatformString(getActiveUiLocale(), 'common.loadingContent'));
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
    serverSpeechConfigured: Session.get('speechAPIKeyConfigured'),
  });
  let audioInputEnabled = srAvailability.status === 'available';
  setAudioInputModeEnabled(audioInputEnabled);
  clientConsole(2, '[Svelte Init] canonical SR availability', srAvailability);

  if (audioInputEnabled) {
    if (typeof getAudioInputSensitivity() === 'undefined') {
      clientConsole(1, '[Svelte Init] Missing authoritative audio input sensitivity; refusing fallback');
    }
  }

  if (isAudioPromptModeEnabled(getAudioPromptMode()) && !getAudioPromptSpeakingRate()) {
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
    requestedIntent: effectiveCardEntryIntent,
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
