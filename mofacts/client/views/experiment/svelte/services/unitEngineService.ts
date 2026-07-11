/**
 * Unit Engine Service
 *
 * Wraps current unit-engine construction for XState machine.
 * Handles card selection, scheduling, and adaptive learning algorithms.
 */

import { Session } from 'meteor/session';
import { createUnitEngine } from '../../engineConstructors';
import { getCurrentDeliverySettings } from '../../../../lib/currentTestingHelpers';
import { clientConsole } from '../../../../lib/clientLogger';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { getCourseAssignmentLaunchContext } from '../../../../lib/courseAssignmentLaunchContext';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { computePracticeTimeMs } from '../../../../../lib/practiceTime';
import { calculateTrialTimings } from './historyLogging';
import { getExperimentState } from './experimentState';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../../../lib/idContext';
import { resolveH5PModelOutcomes } from '../../../../../common/lib/h5pTrialResult';
import { getPreparedCardDataFromSelection as buildPreparedCardDataFromSelection } from './cardPayloadBuilder';
import { resolveSessionSurfaceState } from './sessionSurfaceMode';
import { resolveSparcControllerDisplay } from './sparcController';
import { ensureSparcRuntimeHistoryHydrated, readSparcResumeSnapshot } from './sparcRuntimeState';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import {
  clearResumeToQuestion,
  getIsVideoSessionFlag,
  getEngineIndices,
  getRuntimeExperimentState,
  getSessionClusterIndex,
  hasCurrentTdfId,
  isResumeInProgress,
  isResumeRequested,
  publishEngineIndices,
  resolveRuntimeEngine,
  setCurrentAnswer,
  setCurrentDeliverySettings,
  setEngineIndices,
  setVideoEngineIndices,
} from './cardRuntimeState';
import {
  setButtonList,
  setButtonTrial,
} from './activeTrialDisplayRuntimeState';
import {
  setQuestionIndex,
} from './trialProgressionState';
import type {
  EngineServiceResult,
  ExperimentState,
  H5PTrialResult,
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
  h5pResult?: H5PTrialResult | null;
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
  userId?: string;
  attemptId?: string;
  unitId?: number;
  tdfId?: string;
}

interface UpdateEngineServiceContext extends UnitEngineServiceContext {
  h5pResult?: H5PTrialResult | null;
  timestamps: {
    trialEnd: number;
    trialStart: number;
    firstKeypress: number;
    feedbackStart: number;
    feedbackEnd?: number;
  };
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
  deliverySettings?: Record<string, unknown>;
}

interface TdfFileLike extends Record<string, unknown> {
  tdfs?: {
    tutor?: {
      unit?: TdfUnitLike[];
      title?: string;
      deliverySettings?: Record<string, unknown>;
      setspec?: Record<string, unknown>;
    };
  };
  name?: string;
}

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
  deliverySettings?: Record<string, unknown>;
  setspec?: Record<string, unknown>;
  engineIndices?: Record<string, unknown> | null;
  engine?: UnitEngineLike | null;
  unitFinished?: boolean;
  questionIndex?: number;
  preparedAdvanceMode?: PreparedAdvanceMode;
  speechHintExclusionList?: string;
  preparedSelection?: Record<string, unknown> | null;
}

type PreparedAdvanceMode = 'none' | 'seamless' | 'direct';

function isUnitEngineVideoSurfaceActive(): boolean {
  return resolveSessionSurfaceState({
    sessionIsVideoSession: getIsVideoSessionFlag(),
  }).isVideoSession;
}

type RuntimeLifecycleEngine = UnitEngineLike & Required<Pick<
  UnitEngineLike,
  | 'selectNextCard'
  | 'findCurrentCardInfo'
  | 'prepareNextTrial'
  | 'commitPreparedTrial'
  | 'advanceAfterAnswer'
  | 'isFinished'
  | 'getDisplayQuestionIndex'
  | 'clearPreparedTrial'
>>;

function requireRuntimeLifecycleEngine(
  engine: UnitEngineLike | null | undefined,
): asserts engine is RuntimeLifecycleEngine {
  if (!engine) {
    throw new Error('Unit engine is required');
  }
  const requiredMethods: ReadonlyArray<keyof RuntimeLifecycleEngine> = [
    'selectNextCard',
    'findCurrentCardInfo',
    'prepareNextTrial',
    'commitPreparedTrial',
    'advanceAfterAnswer',
    'isFinished',
    'getDisplayQuestionIndex',
    'clearPreparedTrial',
  ];
  for (const method of requiredMethods) {
    if (typeof engine[method] !== 'function') {
      throw new Error(`Unit engine is missing required lifecycle method "${method}"`);
    }
  }
}

export function resolveSelectedCardExportQuestionIndex(
  engine: UnitEngineLike,
  machineQuestionIndex: number,
): number {
  requireRuntimeLifecycleEngine(engine);
  return engine.getDisplayQuestionIndex(machineQuestionIndex);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function canEngineUseSeamlessPreparedAdvance(engine: UnitEngineLike | null | undefined): boolean {
  return engine?.supportsEarlyTrialPreparation === true;
}

export function resolvePreparedAdvanceCardRef(
  engine: UnitEngineLike | null | undefined,
): Record<string, unknown> | null {
  return canEngineUseSeamlessPreparedAdvance(engine) && engine?.currentCardRef
    ? engine.currentCardRef as Record<string, unknown>
    : null;
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

  const units = tdf?.tdfs?.tutor?.unit;
  const unit = Array.isArray(units) ? units[unitNumber] : undefined;
  if (unit) {
    Session.set('currentTdfUnit', unit);
    Session.set('currentUnitNumber', unitNumber);
  }

  const experimentState = await getExperimentState();
  const normalizedExperimentState = experimentState || {};
  const curExperimentData = {
    experimentState: normalizedExperimentState,
    curExperimentState: normalizedExperimentState,
  };

  return await createUnitEngine(unitType, curExperimentData, {
    source: 'initializeEngine',
    unit,
    unitNumber,
  });
}

function buildPreparedTrialPayload(params: {
  engine: UnitEngineLike;
  selection: Record<string, unknown>;
  questionIndex: number;
  preparedAdvanceMode: Exclude<PreparedAdvanceMode, 'none'>;
}): PreparedTrialContent {
  const { engine, selection, questionIndex, preparedAdvanceMode } = params;
  return {
    ...buildPreparedCardDataFromSelection(engine, selection, questionIndex),
    engine,
    unitFinished: false,
    preparedAdvanceMode,
    questionIndex,
    preparedSelection: selection,
  };
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
  requireRuntimeLifecycleEngine(engine);
  // Get current card info from engine
  const { whichStim, probabilityEstimate, clusterIndex: engineClusterIndex, forceButtonTrial } =
    engine.findCurrentCardInfo?.() as EngineCardInfo;
  const resolvedClusterIndex = engineClusterIndex ?? clusterIndex ?? 0;
  return buildPreparedCardDataFromSelection(
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
  requireRuntimeLifecycleEngine(engine);
  return await engine.isFinished();
}

function isPreparedAdvanceEligible(
  engine: UnitEngineLike | null | undefined,
  context?: UnitEngineServiceContext | UpdateEngineServiceContext,
): boolean {
  if (!canEngineUseSeamlessPreparedAdvance(engine)) {
    return false;
  }
  if (isUnitEngineVideoSurfaceActive()) {
    return false;
  }
  if (isResumeRequested() || isResumeInProgress()) {
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
  requireRuntimeLifecycleEngine(engine);
  engine.clearPreparedTrial(reason);
}

export function startEarlyLockForCurrentTrial(
  context: UnitEngineServiceContext,
  engineArg?: UnitEngineLike | null | undefined,
): void {
  const engine = resolveRuntimeEngine({
    explicitEngine: engineArg,
    contextEngine: context.engine,
  }) as UnitEngineLike | null | undefined;
  if (!isPreparedAdvanceEligible(engine, context) || typeof engine?.lockNextCardEarly !== 'function') {
    return;
  }

  const currentCardRef = engine.currentCardRef || {
    clusterIndex: context.engineIndices?.clusterIndex,
    stimIndex: context.engineIndices?.stimIndex,
  };
  const ownerToken = engine.currentCardOwnerToken || null;
  const nextQuestionIndex = Number.isFinite(context.questionIndex) ? Number(context.questionIndex) + 1 : 1;
  void engine.lockNextCardEarly(undefined, getRuntimeExperimentState(), {
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
      const nextTrialContent = buildPreparedCardDataFromSelection(engine, selection, nextQuestionIndex);
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
  const engine = resolveRuntimeEngine({
    eventEngine: event?.engine as UnitEngineLike | null | undefined,
    contextEngine: context.engine,
  }) as UnitEngineLike | null | undefined;
  if (!engine) {
    throw new Error('No engine available for prepared incoming trial');
  }
  requireRuntimeLifecycleEngine(engine);

  const nextQuestionIndex = Number.isFinite(context.questionIndex) ? Number(context.questionIndex) + 1 : 1;
  const curExperimentState = getRuntimeExperimentState() as ExperimentState;
  const plan = await engine.prepareNextTrial({
    experimentState: curExperimentState,
    currentCardRef: engine.currentCardRef || {
      clusterIndex: context.engineIndices?.clusterIndex,
      stimIndex: context.engineIndices?.stimIndex,
    },
    ownerToken: engine.currentCardOwnerToken || null,
  });
  const questionIndex = plan.questionIndex ?? nextQuestionIndex;
  if (plan.preparedContent) {
    return {
      ...plan.preparedContent,
      engine,
      unitFinished: false,
      preparedAdvanceMode: plan.preparedAdvanceMode,
      questionIndex,
      preparedSelection: plan.selection,
    };
  }
  if (plan.selection) {
    const preparedTrial = buildPreparedTrialPayload({
      engine,
      selection: plan.selection,
      questionIndex,
      preparedAdvanceMode: plan.preparedAdvanceMode === 'none' ? 'direct' : plan.preparedAdvanceMode,
    });
    engine.setPreparedNextTrialContent?.(preparedTrial);
    return preparedTrial;
  }

  const unitFinished = await isUnitFinished(engine);
  return {
    unitFinished,
    preparedAdvanceMode: plan.preparedAdvanceMode,
    engine,
    questionIndex,
  };
}

export function commitPreparedTrialRuntime(
  context: { preparedTrial?: Record<string, unknown> | null; engine?: UnitEngineLike | null | undefined },
): void {
  const preparedTrial = (context.preparedTrial || null) as PreparedTrialContent | null;
  if (!preparedTrial) {
    return;
  }

  const engine = resolveRuntimeEngine({
    explicitEngine: preparedTrial.engine as UnitEngineLike | null | undefined,
    contextEngine: context.engine,
  }) as UnitEngineLike | null | undefined;
  const curExperimentState = getRuntimeExperimentState() as ExperimentState;
  const preparedSelection = preparedTrial.preparedSelection || null;
  if (!engine) {
    throw new Error('Prepared trial commit requires a unit engine');
  }
  requireRuntimeLifecycleEngine(engine);
  const committed = engine.commitPreparedTrial(preparedSelection, curExperimentState);

  if (!committed) {
    throw new Error(`Prepared trial commit failed for unit type "${engine?.unitType || 'unknown'}"`);
  }

  setButtonTrial(Boolean(preparedTrial.buttonTrial));
  setButtonList(Array.isArray(preparedTrial.buttonList) ? preparedTrial.buttonList : []);
  if (preparedTrial.deliverySettings) {
    setCurrentDeliverySettings(preparedTrial.deliverySettings);
  }
  if (preparedTrial.engineIndices) {
    publishEngineIndices(preparedTrial.engineIndices);
  }
  const questionIndex = preparedTrial.questionIndex;
  if (typeof questionIndex === 'number') {
    setQuestionIndex(questionIndex);
  }
  setCurrentAnswer(preparedTrial.currentAnswer);

  engine.clearPreparedTrial('prepared-trial-committed');
}

/**
 * XState service for selecting next card (Promise-based for invoke.onDone).
 * Used by contentRuntimeMachine.js in presenting.loading state.
 *
 * Flow:
 * 1. Call engine.selectNextCard() to prepare next trial (sets internal state)
 * 2. Call getCardDataFromEngine() to extract display, answer, buttons, etc.
 * 3. Return complete card data to machine
 *
 * @param {UnitEngineServiceContext} context - Machine context
 * @param {SelectCardServiceEvent} event - Event that triggered the service (contains engine and learner/runtime identity)
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

    const engine = resolveRuntimeEngine({
      eventEngine: event.engine as UnitEngineLike | null | undefined,
      contextEngine: context.engine,
    }) as UnitEngineLike | null | undefined;
    const pendingVideoQuestionIndex = context?.videoSession?.pendingQuestionIndex;
    const resolvedVideoClusterIndex = getFiniteNumber(pendingVideoQuestionIndex);
    const eventClusterIndex = getFiniteNumber(machineEvent.clusterIndex);
    const contextClusterIndex = getFiniteNumber(context.engineIndices?.clusterIndex);
    const sessionClusterIndex = getSessionClusterIndex();
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
    let engineIndices = getEngineIndices();
    if (isUnitEngineVideoSurfaceActive() && resolvedVideoClusterIndex !== undefined) {
      engineIndices = setVideoEngineIndices(resolvedVideoClusterIndex);
    }
    const resumeRequested = isResumeRequested();
    const isVideoCheckpointSelection = machineEvent?.type === 'VIDEO_CHECKPOINT' ||
      Number.isFinite(resolvedVideoClusterIndex);
    const isResume = resumeRequested && !isVideoCheckpointSelection;
    if (resumeRequested && isVideoCheckpointSelection) {
      clearResumeToQuestion();
    }
    if (machineEvent?.type === 'START' || isResume) {
      clearPreparedNextRuntimeState(engine, isResume ? 'resume-entry' : 'start-entry');
    }
    /** @type {ExperimentState} */
    const curExperimentState = getRuntimeExperimentState() as ExperimentState;
    if (!hasCurrentTdfId()) {
      logIdInvariantBreachOnce('unitEngine.selectCardService:missing-currentTdfId');
    }

    if (!engine) {
      throw new Error('No engine available for card selection (check engineManager)');
    }
    requireRuntimeLifecycleEngine(engine);
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
        deliverySettings: {
          ...getCurrentDeliverySettings(),
          ...(deliverySettingsStore.get() || {}),
        },
        engineIndices: { clusterIndex },
        questionIndex,
        engine
      };
    }

    // CRITICAL: Call engine.selectNextCard() first to prepare internal state
    // This must be called before getCardDataFromEngine() which calls findCurrentCardInfo()
    if (isResume) {
      await engine.selectNextCard(engineIndices, curExperimentState);
      clearResumeToQuestion();
    } else {
      if (typeof engine.clearPrefetchedNextCard === 'function') {
        engine.clearPrefetchedNextCard();
      }

      await engine.selectNextCard(engineIndices, curExperimentState);
    }

    // Schedule units maintain the live pointer during selectNextCard().
    // Use that runtime pointer as the exported question index so resume/start logic
    // cannot overwrite the fixed schedule position with a stale machine counter.
    const exportedQuestionIndex = resolveSelectedCardExportQuestionIndex(engine, questionIndex);

    // Now get card data (engine has prepared internal state)
    const cardData = getCardDataFromEngine(engine, clusterIndex, exportedQuestionIndex);
    const sparcDisplay = resolveSparcControllerDisplay(
      cardData.currentDisplay,
      '[Unit Engine] Selected SPARC display',
    );
    if (sparcDisplay?.pageKey) {
      const hydratedScopes = await ensureSparcRuntimeHistoryHydrated({
        userId: context.userId,
        TDFId: context.tdfId,
        levelUnit: context.unitId,
      }, async () => await meteorCallAsync<CanonicalHistoryRecord[]>(
        'getSparcHistoryForUnit',
        context.userId,
        context.tdfId,
        Number(context.unitId),
        { courseAssignment: getCourseAssignmentLaunchContext() },
      ));
      if (hydratedScopes.length > 0) {
        clientConsole(2, '[Unit Engine] Durable SPARC history hydrated', {
          userId: context.userId,
          TDFId: context.tdfId,
          levelUnit: context.unitId,
          hydratedScopes: JSON.stringify(hydratedScopes),
        });
      }
    }
    const sparcResumeSnapshot = sparcDisplay?.pageKey
      ? readSparcResumeSnapshot({
          userId: context.userId,
          TDFId: context.tdfId,
          levelUnit: context.unitId,
          pageKey: sparcDisplay.pageKey,
          display: sparcDisplay,
        })
      : undefined;
    const sparcNodeValues = sparcResumeSnapshot?.nodeValues;
    if (sparcResumeSnapshot) {
      clientConsole(2, '[Unit Engine] SPARC resume snapshot selected', {
        userId: sparcResumeSnapshot.userId,
        TDFId: sparcResumeSnapshot.TDFId,
        levelUnit: sparcResumeSnapshot.levelUnit,
        pageKey: sparcResumeSnapshot.pageKey,
        retainedHistoryCount: sparcResumeSnapshot.retainedHistoryRecords.length,
        replayCellCount: Object.keys(sparcResumeSnapshot.replayState.cells).length,
        progressiveNodeOperationCount: sparcResumeSnapshot.progressiveNodeOperations.length,
        projectedNodeValueCount: Object.keys(sparcResumeSnapshot.nodeValues).length,
      });
    }

    

    // Return complete card data (available as event.output in onDone)
    return {
      ...cardData,
      ...(sparcNodeValues ? { sparcNodeValues } : {}),
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
 * Usage in contentRuntimeMachine.js:
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
    const testType = context.testType || 'd';

    

    if (!engine) {
      throw new Error('No engine available for engine update');
    }
    requireRuntimeLifecycleEngine(engine);

    const timings = calculateTrialTimings(
        context.timestamps.trialEnd,
        context.timestamps.trialStart,
        context.timestamps.firstKeypress,
        context.timestamps.feedbackStart,
        context.timestamps.feedbackEnd,
        testType
      );
    const practiceTime = computePracticeTimeMs(timings.endLatency, timings.feedbackLatency);
    const h5pOutcomes = context.h5pResult
        ? resolveH5PModelOutcomes(context.h5pResult)
        : null;

    if (h5pOutcomes) {
        clientConsole(2, '[Unit Engine] H5P model outcome batch', {
          contentId: context.h5pResult?.contentId,
          batchId: context.h5pResult?.batchId,
          outcomes: h5pOutcomes.map((outcome) => outcome.correct ? 1 : 0),
          practiceTime,
        });

    }
    await engine.advanceAfterAnswer(
      h5pOutcomes || [{ correct: isCorrect }],
      practiceTime,
      testType,
    );

    if (!isUnitEngineVideoSurfaceActive()) {
        const modelCardRef = resolvePreparedAdvanceCardRef(engine);
        const modelClusterIndex = getFiniteNumber(modelCardRef?.clusterIndex);
        const modelStimIndex = getFiniteNumber(modelCardRef?.stimIndex);
        if (modelClusterIndex !== undefined && modelStimIndex !== undefined) {
          setEngineIndices({
            clusterIndex: modelClusterIndex,
            stimIndex: modelStimIndex,
          });
        } else {
          setEngineIndices(undefined);
        }
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





