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
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { getEngine } from '../../../../lib/engineManager';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { computePracticeTimeMs } from '../../../../../lib/practiceTime';
import { calculateTrialTimings } from './historyLogging';
import { getExperimentState } from './experimentState';
import { CardStore } from '../../modules/cardStore';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../../../lib/idContext';
import { resolveH5PModelOutcomes } from '../../../../../common/lib/h5pTrialResult';
import { getPreparedCardDataFromSelection as buildPreparedCardDataFromSelection } from './cardPayloadBuilder';
import { resolveSessionSurfaceState } from './sessionSurfaceMode';
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
    sessionIsVideoSession: Session.get('isVideoSession'),
  }).isVideoSession;
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
  const resolvedQuestionIndex = engine.unitType === 'schedule'
    ? requireScheduleDisplayQuestionIndex(selection)
    : questionIndex;
  return {
    ...buildPreparedCardDataFromSelection(engine, selection, resolvedQuestionIndex),
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
    preparedAdvanceMode: 'direct',
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
  if (isUnitEngineVideoSurfaceActive()) {
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
  const engine = (event?.engine || context.engine || getEngine()) as UnitEngineLike | null | undefined;
  if (!engine) {
    throw new Error('No engine available for prepared incoming trial');
  }

  const nextQuestionIndex = Number.isFinite(context.questionIndex) ? Number(context.questionIndex) + 1 : 1;
  if (engine.unitType === 'video') {
    return {
      unitFinished: false,
      preparedAdvanceMode: 'none',
      engine,
      questionIndex: nextQuestionIndex,
    };
  }

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
    preparedAdvanceMode: engine.unitType === 'model' ? 'seamless' : 'direct',
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
  if (preparedTrial.deliverySettings) {
    Session.set('currentDeliverySettings', preparedTrial.deliverySettings);
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
    if (isUnitEngineVideoSurfaceActive() && Number.isFinite(resolvedVideoClusterIndex)) {
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
      throw new Error('No engine available for engine update');
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

        for (const outcome of h5pOutcomes) {
          await engine.cardAnswered(outcome.correct, practiceTime, testType);
        }
      } else {
        await engine.cardAnswered(isCorrect, practiceTime, testType);
      }

      if (!isUnitEngineVideoSurfaceActive()) {
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





