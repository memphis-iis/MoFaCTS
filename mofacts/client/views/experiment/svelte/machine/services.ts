/**
 * @fileoverview Service functions for card state machine
 * Services are async operations invoked by the machine (card selection, SR, TTS, etc.)
 */

import { DEFAULT_TIMINGS, LOG_PREFIXES } from './constants';
import { Answers } from '../../answerAssess';
import { Session } from 'meteor/session';
import { clientConsole } from '../../../../lib/clientLogger';
import { getMainTimeoutMs, getFeedbackTimeoutMs } from '../utils/timeoutUtils';

// Import Phase 6 services
import { historyLoggingService } from '../services/historyLogging';
import { experimentStateService } from '../services/experimentState';
import { selectCardService, updateEngineService, prepareIncomingTrialService } from '../services/unitEngineService';
import { ttsPlaybackService } from '../services/ttsService';
import { speechRecognitionService as srService } from '../services/speechRecognitionService';
import {
  createEmptySparcProductionRuleReplaySession,
  readSparcProductionRuleReplaySession,
} from '../services/sparcProductionRuleHistoryCache';
import {
  getSparcTrialDisplayRuntimeContext,
} from '../services/sparcTrialDisplayRuntimeContextCache';
import {
  SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
  collectSparcProgressiveNodeOperations,
} from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
import { CardStore } from '../../modules/cardStore';
import { fromCallback, fromPromise, type AnyEventObject } from 'xstate';
import { resolveH5PModelOutcomes } from '../../../../../common/lib/h5pTrialResult';
import type { H5PTrialResult } from '../../../../../common/types';
import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import type {
  SparcTrialDisplayProductionRuleEvaluationResult,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcTrialDisplayProductionRuleEvaluationRuntimeParams,
} from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';

type TimeoutContextLike = Parameters<typeof getMainTimeoutMs>[0] & {
  feedbackTimeoutMs?: number;
  timestamps?: {
    trialStart?: number;
    timeoutStart?: number;
    feedbackStart?: number;
  };
};
type ServiceRecord = Record<string, unknown>;
type PromiseServiceInput = ServiceRecord & {
  context?: ServiceRecord;
};
type CallbackOutputEvent = AnyEventObject & Record<string, unknown>;
type CallbackServiceHandler = (
  send: (event: CallbackOutputEvent) => void,
  receive: (listener: (event: CallbackOutputEvent) => void) => void
) => (() => void) | void;

interface AnswerEvaluationContext extends ServiceRecord {
  userAnswer?: unknown;
  currentAnswer?: string;
  originalAnswer?: string;
  h5pResult?: H5PTrialResult | null;
  sparcResult?: SparcTrialResult | null;
  engine?: ServiceRecord | null;
  currentDisplay?: {
    type?: string;
    documentId?: string;
    nodes?: unknown[];
    productionRules?: unknown[];
    behaviorRefs?: Record<string, string>;
    behavior?: {
      feedback?: Array<Record<string, unknown>>;
    };
    response?: {
      gradingMode?: string;
      scoredNodes?: string[];
      intentByNode?: Array<{ node?: string; expected?: unknown; acceptedValues?: unknown[]; type?: string }>;
      intentByPath?: Array<{
        path?: string;
        intentByNode?: Array<{ node?: string; expected?: unknown; acceptedValues?: unknown[]; type?: string }>;
      }>;
      evaluation?: {
        trimWhitespace?: boolean;
        caseNormalize?: boolean;
        mathNormalize?: boolean;
        allowScientificNotation?: boolean;
      };
    };
  };
  deliverySettings?: {
    caseSensitive?: boolean;
  };
  tdfId?: unknown;
  sessionId?: unknown;
  setspec?: unknown;
  buttonTrial?: boolean;
}

type SparcEvaluationOptions = {
  trimWhitespace?: boolean;
  caseNormalize?: boolean;
  mathNormalize?: boolean;
  allowScientificNotation?: boolean;
};

type SparcNodeIntent = {
  node?: string;
  expected?: unknown;
  acceptedValues?: unknown[];
  type?: string;
};

type SparcNodeIntentEvaluation = {
  readonly nodeId: string;
  readonly correct: boolean;
};

type SparcFeedbackMatch = {
  readonly sparcFeedbackId: string;
  readonly sparcFeedbackMessage?: string;
};

type SparcProductionRuleEvaluationEngineLike = ServiceRecord & {
  evaluateSparcTrialDisplayProductionRuleEvents?: (
    params: SparcTrialDisplayProductionRuleEvaluationRuntimeParams
  ) => SparcTrialDisplayProductionRuleEvaluationResult;
};

function normalizeSparcComparableValue(
  value: unknown,
  options: SparcEvaluationOptions,
  typeHint?: string,
): unknown {
  if (typeHint === 'boolean' || typeof value === 'boolean') {
    return value === true || value === 'true';
  }

  let normalized = typeof value === 'string' ? value : String(value ?? '');
  if (options.trimWhitespace) {
    normalized = normalized.trim();
  }
  if (options.caseNormalize) {
    normalized = normalized.toLowerCase();
  }
  if (options.mathNormalize || options.allowScientificNotation || typeHint === 'scientific') {
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return normalized;
}

function sparcComparableValuesEqual(
  actual: unknown,
  expected: unknown,
  options: SparcEvaluationOptions,
  typeHint?: string,
): boolean {
  return normalizeSparcComparableValue(actual, options, typeHint)
    === normalizeSparcComparableValue(expected, options, typeHint);
}

function evaluateSparcIntent(
  intent: SparcNodeIntent,
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): SparcNodeIntentEvaluation {
  const nodeId = String(intent.node || '');
  const actual = submittedNodes[nodeId];
  const acceptedValues = Array.isArray(intent.acceptedValues) && intent.acceptedValues.length > 0
    ? intent.acceptedValues
    : [intent.expected];
  return {
    nodeId,
    correct: acceptedValues.some((expected) => sparcComparableValuesEqual(
      actual,
      expected,
      evaluationOptions,
      intent.type,
    )),
  };
}

function buildSparcEvaluationOptions(response: NonNullable<AnswerEvaluationContext['currentDisplay']>['response']): SparcEvaluationOptions {
  return {
    trimWhitespace: response?.evaluation?.trimWhitespace !== false,
    caseNormalize: response?.evaluation?.caseNormalize === true,
    mathNormalize: response?.evaluation?.mathNormalize === true,
    allowScientificNotation: response?.evaluation?.allowScientificNotation === true,
  };
}

function selectSparcPathEvaluation(
  response: NonNullable<AnswerEvaluationContext['currentDisplay']>['response'],
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): {
  readonly path: string;
  readonly evaluations: readonly SparcNodeIntentEvaluation[];
} | null {
  const paths = Array.isArray(response?.intentByPath) ? response.intentByPath : [];
  let bestPath: {
    readonly path: string;
    readonly evaluations: readonly SparcNodeIntentEvaluation[];
    readonly correctCount: number;
  } | null = null;

  for (const pathEntry of paths) {
    const intents = Array.isArray(pathEntry.intentByNode) ? pathEntry.intentByNode : [];
    if (intents.length === 0) {
      continue;
    }
    const evaluations = intents.map((intent) => evaluateSparcIntent(
      intent,
      submittedNodes,
      evaluationOptions,
    ));
    const correctCount = evaluations.filter((evaluation) => evaluation.correct).length;
    if (!bestPath || correctCount > bestPath.correctCount) {
      bestPath = {
        path: String(pathEntry.path || ''),
        evaluations,
        correctCount,
      };
    }
  }

  return bestPath;
}

function flattenSparcIntentEvaluations(
  response: NonNullable<AnswerEvaluationContext['currentDisplay']>['response'],
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): readonly SparcNodeIntentEvaluation[] {
  const intentByNode = Array.isArray(response?.intentByNode) ? response.intentByNode : [];
  const scoredNodeOrder = Array.isArray(response?.scoredNodes) && response.scoredNodes.length > 0
    ? response.scoredNodes
    : intentByNode.map((entry) => String(entry.node || '')).filter(Boolean);
  const intentMap = new Map(intentByNode.map((entry) => [String(entry.node || ''), entry]));
  return scoredNodeOrder.map((nodeId) => {
    const intent = intentMap.get(nodeId);
    if (!intent) {
      return {
        nodeId,
        correct: false,
      };
    }
    return evaluateSparcIntent(intent, submittedNodes, evaluationOptions);
  });
}

function selectionToNodeId(
  selection: unknown,
  behaviorRefs: Record<string, string> | undefined,
): string {
  const normalizedSelection = typeof selection === 'string' ? selection : '';
  return behaviorRefs?.[normalizedSelection] || normalizedSelection;
}

function feedbackConditionMatches(
  condition: Record<string, unknown>,
  submittedNodes: Record<string, unknown>,
  behaviorRefs: Record<string, string> | undefined,
  evaluationOptions: SparcEvaluationOptions,
): boolean {
  const nodeId = selectionToNodeId(condition.selection, behaviorRefs);
  if (!nodeId) {
    return false;
  }
  if (!('input' in condition)) {
    return nodeId in submittedNodes;
  }
  return sparcComparableValuesEqual(
    submittedNodes[nodeId],
    condition.input,
    evaluationOptions,
  );
}

function resolveSparcFeedbackMatch(
  context: AnswerEvaluationContext,
  evaluationOptions: SparcEvaluationOptions,
): SparcFeedbackMatch | null {
  const feedback = context.currentDisplay?.behavior?.feedback;
  const submittedNodes = context.sparcResult?.submittedNodes;
  if (!Array.isArray(feedback) || !submittedNodes) {
    return null;
  }
  const behaviorRefs = context.currentDisplay?.behaviorRefs;
  for (const entry of feedback) {
    const conditions = Array.isArray(entry.matches)
      ? entry.matches
      : (entry.when && typeof entry.when === 'object' && !Array.isArray(entry.when)
          ? [entry.when]
          : []);
    if (!conditions.some((condition) => (
      condition
      && typeof condition === 'object'
      && !Array.isArray(condition)
      && feedbackConditionMatches(condition as Record<string, unknown>, submittedNodes, behaviorRefs, evaluationOptions)
    ))) {
      continue;
    }
    return {
      sparcFeedbackId: String(entry.id || ''),
      ...(typeof entry.message === 'string' ? { sparcFeedbackMessage: entry.message } : {}),
    };
  }
  return null;
}

function hasSparcProductionRuleSource(display: AnswerEvaluationContext['currentDisplay']): display is SparcTrialDisplay & {
  documentId: string;
} {
  const hasDirectRules = Array.isArray(display?.productionRules);
  if (!display || display.type !== 'sparc' || !hasDirectRules) {
    return false;
  }
  const documentId = typeof display.documentId === 'string' ? display.documentId.trim() : '';
  if (!documentId) {
    throw new Error('[SPARC] Production-rule display requires documentId');
  }
  if (!Array.isArray(display.nodes)) {
    throw new Error('[SPARC] Production-rule display requires nodes array');
  }
  return true;
}

function collectSparcMessageNodeIds(
  nodes: readonly unknown[] | undefined,
  ids = new Set<string>(),
): Set<string> {
  for (const node of nodes ?? []) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      continue;
    }
    const record = node as Record<string, unknown>;
    const nodeId = typeof record.id === 'string' ? record.id.trim() : '';
    if (nodeId && record.atomType === 'message-box') {
      ids.add(nodeId);
    }
    if (Array.isArray(record.children)) {
      collectSparcMessageNodeIds(record.children, ids);
    }
  }
  return ids;
}

function extractCurrentSparcMessageNodeValues(
  display: AnswerEvaluationContext['currentDisplay'],
  result: SparcTrialDisplayProductionRuleEvaluationResult,
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = {};
  for (const nodeId of collectSparcMessageNodeIds(display?.nodes)) {
    nodeValues[nodeId] = '';
  }
  for (const evaluation of result.evaluations) {
    for (const firing of evaluation.execution?.firings ?? []) {
      for (const message of firing.messages ?? []) {
        const nodeId = typeof message.target?.nodeId === 'string' ? message.target.nodeId.trim() : '';
        if (nodeId) {
          nodeValues[nodeId] = message.text;
        }
      }
    }
  }
  return nodeValues;
}

function extractSparcNodeValuesFromEvaluation(
  display: AnswerEvaluationContext['currentDisplay'],
  result: SparcTrialDisplayProductionRuleEvaluationResult,
  priorHistoryRecords: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = extractCurrentSparcMessageNodeValues(display, result);
  const progressiveOperations = collectSparcProgressiveNodeOperations([
    ...priorHistoryRecords.map((record) => (
      record.sparc
      && typeof record.sparc === 'object'
      && !Array.isArray(record.sparc)
      && 'stateTransition' in record.sparc
      && record.sparc.stateTransition
      && typeof record.sparc.stateTransition === 'object'
      && !Array.isArray(record.sparc.stateTransition)
        ? record.sparc.stateTransition as { writes?: readonly { key?: string; value?: unknown }[] }
        : {}
    )),
    ...result.evaluations.map((evaluation) => evaluation.transition ?? {}),
  ]);
  if (progressiveOperations.length > 0) {
    nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] = progressiveOperations;
  }
  for (const evaluation of result.evaluations) {
    for (const write of evaluation.transition?.writes ?? []) {
      if (!write?.target?.nodeId || !write.key) {
        continue;
      }
      if (write.key === 'value' || write.key === 'message' || write.key === 'text') {
        nodeValues[write.target.nodeId] = write.value;
      } else if (write.key === 'correctness') {
        nodeValues[`${write.target.nodeId}::correctness`] = write.value;
      } else if (write.key === 'visible') {
        nodeValues[`${write.target.nodeId}::visible`] = write.value;
      }
    }
  }
  return nodeValues;
}

function evaluateSparcProductionRuleOutcome(context: AnswerEvaluationContext) {
  const display = context.currentDisplay;
  if (!hasSparcProductionRuleSource(display)) {
    return null;
  }
  if (!context.sparcResult) {
    throw new Error('[SPARC] Production-rule evaluation requires sparcResult');
  }
  const engine = context.engine as SparcProductionRuleEvaluationEngineLike | null | undefined;
  if (typeof engine?.evaluateSparcTrialDisplayProductionRuleEvents !== 'function') {
    throw new Error('[SPARC] Production-rule display requires SPARC session engine evaluation support');
  }
  const sparcReplaySession = readSparcProductionRuleReplaySession({
    tdfId: context.tdfId,
    sessionId: context.sessionId,
    documentId: display.documentId,
  }) ?? createEmptySparcProductionRuleReplaySession({
    tdfId: context.tdfId,
    sessionId: context.sessionId,
    documentId: display.documentId,
  });
  const sparcRuntimeContext = getSparcTrialDisplayRuntimeContext({
    TDFId: String(context.tdfId),
    sessionID: String(context.sessionId),
    documentId: display.documentId,
    display,
    replaySession: sparcReplaySession,
  });
  const priorHistoryRecords = sparcReplaySession.retainedHistoryRecords;
  const result = engine.evaluateSparcTrialDisplayProductionRuleEvents({
    documentId: display.documentId,
    display,
    result: context.sparcResult,
    document: sparcRuntimeContext.document,
    replayState: sparcRuntimeContext.replayState,
    priorHistoryRecords,
  });
  const lastClassification = result.classifications[result.classifications.length - 1];
  const lastMessage = result.messages[result.messages.length - 1];
  const isCorrect = lastClassification === 'correct';
  const matchText = lastClassification
    ? (isCorrect ? '1' : '0')
    : '';
  const sparcNodeValues = extractSparcNodeValuesFromEvaluation(display, result, priorHistoryRecords);
  return {
    isCorrect,
    matchText: lastMessage?.text || matchText,
    ...(Object.keys(sparcNodeValues).length > 0 ? { sparcNodeValues } : {}),
    ...(lastMessage ? {
      sparcFeedbackMessage: lastMessage.text,
      sparcFeedbackType: lastMessage.messageType,
    } : {}),
    ...(lastClassification ? { sparcClassification: lastClassification } : {}),
  };
}

function evaluateSparcNodeIntent(context: AnswerEvaluationContext) {
  const response = context.currentDisplay?.response;
  const sparcResult = context.sparcResult;
  if (!response || !sparcResult) {
    return null;
  }
  if (!['node-intent', 'sai-path-intent', 'sai-dependency-intent'].includes(String(response.gradingMode || ''))) {
    throw new Error(`[SPARC] Unsupported grading mode: ${String(response.gradingMode || '')}`);
  }

  const evaluationOptions = buildSparcEvaluationOptions(response);
  const pathEvaluation = response.gradingMode === 'sai-path-intent'
    ? selectSparcPathEvaluation(response, sparcResult.submittedNodes, evaluationOptions)
    : null;
  const evaluations = pathEvaluation?.evaluations
    ?? flattenSparcIntentEvaluations(response, sparcResult.submittedNodes, evaluationOptions);
  const outcomeBits = evaluations.map((evaluation) => evaluation.correct ? '1' : '0');
  const feedbackMatch = resolveSparcFeedbackMatch(context, evaluationOptions);

  return {
    isCorrect: outcomeBits.every((bit) => bit === '1'),
    matchText: outcomeBits.join(''),
    ...(pathEvaluation?.path ? { sparcPath: pathEvaluation.path } : {}),
    ...(feedbackMatch ? feedbackMatch : {}),
  };
}

interface TimedDisplayContext extends ServiceRecord {
  deliverySettings?: Record<string, unknown>;
}

interface AudioGateContext extends TimedDisplayContext {
  currentDisplay?: Record<string, unknown> & {
    audioSrc?: string;
  };
}

/**
 * @typedef {import('./types').CardMachineContext} CardMachineContext
 * @typedef {import('./types').CardMachineEvent} CardMachineEvent
 * @typedef {import('./types').CardSelectionResult} CardSelectionResult
 * @typedef {import('./types').SpeechRecognitionResult} SpeechRecognitionResult
 * @typedef {import('./types').CardMachineActorArgs} CardMachineActorArgs
 */

// =============================================================================
// CARD SELECTION SERVICE
// =============================================================================

/**
 * Select next card from unit engine
 * This is invoked by the machine; returns Promise
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<CardSelectionResult>}
 */
async function selectNextCard(context: { deliverySettings?: unknown }, _event: unknown) {
  

  try {
    // Legacy placeholder path; current card selection is handled by selectCardService.
    //
    // const result = await window.unitEngine.selectNextCard({
    //   sessionId: context.sessionId,
    //   unitId: context.unitId,
    //   tdfId: context.tdfId,
    //   previousIndices: context.engineIndices,
    // });
    //
    // return result;

    // Placeholder: simulate card selection
    await delay(100);

    return {
      display: {
        text: 'Sample question text',
      },
      answer: 'Sample answer',
      testType: 'd',
      buttonTrial: false,
      buttonList: [],
      deliverySettings: context.deliverySettings, // Pass through from context
      engineIndices: { /* engine-specific indices */ },
      unitFinished: false,
    };
  } catch (error) {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Card selection failed:', error);
    throw error;
  }
}

// =============================================================================
// IMAGE PREFETCH SERVICE
// =============================================================================

/**
 * Prefetch image to browser cache
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<void>}
 */
async function prefetchImage(context: { currentDisplay?: { imgSrc?: string } }, _event: unknown) {
  const imgSrc = context.currentDisplay?.imgSrc;

  if (!imgSrc) {
    return; // No image to prefetch
  }

  

  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      
      resolve();
    };
    img.onerror = (error) => {
      clientConsole(1, LOG_PREFIXES.ERROR, 'Image prefetch failed:', imgSrc, error);
      // Don't reject - image load failures are soft errors
      resolve();
    };
    img.src = imgSrc;
  });
}

// =============================================================================
// TIMEOUT SERVICES
// =============================================================================

/**
 * Main trial timeout service
 * Returns a promise that resolves after timeout duration
 * Machine should cancel this service if trial completes early
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<void>}
 */
function mainCardTimeout(context: TimeoutContextLike, _event: unknown) {
  const remaining = getMainTimeoutRemainingMs(context);

  return new Promise<void>((resolve) => {
    let ttsWaitIntervalId: ReturnType<typeof setInterval> | null = null;
    const resolveAfterTtsCompletes = () => {
      if (!CardStore.isTtsRequested()) {
        resolve();
        return;
      }

      ttsWaitIntervalId = setInterval(() => {
        if (CardStore.isTtsRequested()) {
          return;
        }
        if (ttsWaitIntervalId) {
          clearInterval(ttsWaitIntervalId);
          ttsWaitIntervalId = null;
        }
        resolve();
      }, 50);
    };

    const timeoutId = setTimeout(() => {
      resolveAfterTtsCompletes();
    }, remaining);

    // Store timeout ID for potential cancellation
    // (XState will auto-cancel when service exits)
    return () => {
      clearTimeout(timeoutId);
      if (ttsWaitIntervalId) {
        clearInterval(ttsWaitIntervalId);
      }
    };
  });
}

/**
 * Feedback timeout service
 * Auto-advance after feedback display
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<void>}
 */
function feedbackTimeout(context: TimeoutContextLike, _event: unknown) {
  const feedbackStart = Number(context.timestamps?.feedbackStart);
  const elapsed = Number.isFinite(feedbackStart) && feedbackStart > 0
    ? Math.max(0, Date.now() - feedbackStart)
    : 0;
  const fadeOutDurationMs = getFeedbackFadeOutDurationMs();
  const remaining = getFeedbackTimeoutRemainingMs(context, elapsed, fadeOutDurationMs);
  const timeout = getFeedbackTimeoutDurationMs(context);

  clientConsole(2, '[CardMachine][FeedbackTiming] feedbackTimeout:start', {
    testType: context.testType,
    isCorrect: context.isCorrect,
    feedbackTimeoutMs: context.feedbackTimeoutMs,
    resolvedTimeoutMs: timeout,
    fadeOutDurationMs,
    feedbackStart,
    elapsed,
    remaining,
    correctprompt: context.deliverySettings?.correctprompt,
    reviewstudy: context.deliverySettings?.reviewstudy,
    purestudy: context.deliverySettings?.purestudy,
  });

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      clientConsole(2, '[CardMachine][FeedbackTiming] feedbackTimeout:done', {
        resolvedTimeoutMs: timeout,
        fadeOutDurationMs,
        remainingAtStart: remaining,
      });
      resolve();
    }, remaining);

    return () => clearTimeout(timeoutId);
  });
}

function getFeedbackTimeoutDurationMs(context: TimeoutContextLike): number {
  return Number.isFinite(context.feedbackTimeoutMs)
    ? Math.max(0, Number(context.feedbackTimeoutMs))
    : getFeedbackTimeoutMs(context);
}

function getMainTimeoutStartMs(context: TimeoutContextLike): number {
  const timeoutStart = Number(context.timestamps?.timeoutStart);
  if (Number.isFinite(timeoutStart) && timeoutStart > 0) {
    return timeoutStart;
  }
  const trialStart = Number(context.timestamps?.trialStart);
  return Number.isFinite(trialStart) && trialStart > 0 ? trialStart : 0;
}

export function getMainTimeoutRemainingMs(context: TimeoutContextLike, nowMs = Date.now()): number {
  const timeout = getMainTimeoutMs(context);
  const timeoutStart = getMainTimeoutStartMs(context);
  const elapsed = timeoutStart > 0 ? Math.max(0, nowMs - timeoutStart) : 0;
  return Math.max(0, timeout - elapsed);
}

export function getFeedbackTimeoutRemainingMs(
  context: TimeoutContextLike,
  elapsedMs: number,
  fadeOutDurationMs: number
): number {
  const timeout = getFeedbackTimeoutDurationMs(context);
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const fadeOutLeadMs = Number.isFinite(fadeOutDurationMs) ? Math.max(0, fadeOutDurationMs) : 0;
  return Math.max(0, timeout - elapsed - fadeOutLeadMs);
}

// =============================================================================
// TTS (TEXT-TO-SPEECH) SERVICE
// =============================================================================

/**
 * TTS playback service
 * Plays audio or TTS for the current trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<void>}
 */
async function ttsPlayback(_context: unknown, _event: unknown) {
  

  try {
    // TODO: Integrate with the shared TTS/audio runtime.

    // Placeholder: simulate TTS playback
    await delay(1000);

    
  } catch (error) {
    clientConsole(1, LOG_PREFIXES.ERROR, 'TTS playback failed:', error);
    throw error;
  }
}

// =============================================================================
// VIDEO PLAYER SERVICE
// =============================================================================

/**
 * Video player service (for video sessions)
 * Manages video playback and checkpoint rewind
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {Promise<void>}
 */
async function videoPlayer(_context: unknown, _event: unknown) {
  

  // TODO: Integrate with video player for video sessions
  // - Play video
  // - Pause at checkpoints for questions
  // - Rewind on incorrect answers
  //
  // This is a placeholder for now

  return Promise.resolve();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Delay helper for promises
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getFeedbackFadeOutDurationMs(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_TIMINGS.FADE_OUT_DURATION;
  }
  const cssValue = getComputedStyle(document.documentElement)
    .getPropertyValue('--app-transition-smooth')
    .trim();
  if (!cssValue) {
    return DEFAULT_TIMINGS.FADE_OUT_DURATION;
  }
  if (cssValue.endsWith('ms')) {
    const parsed = Number(cssValue.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : DEFAULT_TIMINGS.FADE_OUT_DURATION;
  }
  if (cssValue.endsWith('s')) {
    const parsed = Number(cssValue.slice(0, -1));
    return Number.isFinite(parsed) ? parsed * 1000 : DEFAULT_TIMINGS.FADE_OUT_DURATION;
  }
  const parsed = Number(cssValue);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TIMINGS.FADE_OUT_DURATION;
}

// =============================================================================
// SERVICE FACTORY
// =============================================================================

/**
 * Create service map for XState machine
 * @returns {Record<string, unknown>} Service map
 */
export function createServices() {
  /**
   * @param {(context: CardMachineContext, event: CardMachineEvent) => Promise<unknown>} serviceFn
   * @returns {ReturnType<typeof fromPromise>}
   */
  const wrapPromiseService = <TContext extends ServiceRecord, TEvent extends ServiceRecord>(
    serviceFn: (context: TContext, event: TEvent) => Promise<unknown> | unknown
  ) => fromPromise(async ({ input }) => {
    const typedInput = (input ?? {}) as PromiseServiceInput;
    const context = (typedInput.context || {}) as TContext;
    const event = typedInput as TEvent;
    try {
      return await serviceFn(context, event);
    } catch (error) {
      clientConsole(1, LOG_PREFIXES.ERROR, `Service ${serviceFn.name || 'anonymous'} failed`, {
        error,
        context,
        event,
        input,
      });
      throw error;
    }
  });

  /**
   * @param {(context: CardMachineContext, event: CardMachineEvent) => ((send: (event: Record<string, unknown>) => void, receive: (listener: (event: Record<string, unknown>) => void) => void) => (() => void) | void)} serviceFn
   * @returns {ReturnType<typeof fromCallback>}
   */
  const wrapCallbackService = <TContext extends ServiceRecord, TEvent extends ServiceRecord>(
    serviceFn: (context: TContext, event: TEvent) => CallbackServiceHandler | void
  ) => fromCallback(({ input, sendBack, receive }) => {
    const typedInput = (input ?? {}) as PromiseServiceInput;
    const context = (typedInput.context || {}) as TContext;
    const event = typedInput as TEvent;
    const handler = serviceFn(context, event);
    if (typeof handler === 'function') {
      return handler(
        (evt: CallbackOutputEvent) => sendBack(evt),
        (listener: (event: CallbackOutputEvent) => void) => receive?.(listener)
      );
    }
    return undefined;
  });

  return {
    // Phase 6 services (fully implemented)
    historyLoggingService: wrapPromiseService(historyLoggingService),
    experimentStateService: wrapPromiseService(experimentStateService),
    selectCardService: wrapPromiseService(selectCardService),
    updateEngineService: wrapPromiseService(updateEngineService),
    prepareIncomingTrialService: wrapPromiseService(prepareIncomingTrialService),
    ttsService: wrapPromiseService(ttsPlaybackService),
    speechRecognitionService: wrapCallbackService(srService),
    evaluateAnswerService: wrapPromiseService(evaluateAnswerService),
    readyPromptDelayService: wrapPromiseService(readyPromptDelayService),
    prestimulusDelayService: wrapPromiseService(prestimulusDelayService),
    uiPaintService: wrapPromiseService(uiPaintService),
    questionAudioGateService: wrapPromiseService(questionAudioGateService),

    selectNextCard: wrapPromiseService(selectNextCard),
    prefetchImage: wrapPromiseService(prefetchImage),
    mainCardTimeout: wrapPromiseService(mainCardTimeout),
    feedbackTimeout: wrapPromiseService(feedbackTimeout),
    ttsPlayback: wrapPromiseService(ttsPlayback),
    videoPlayer: wrapPromiseService(videoPlayer),
  };
}

/**
 * Returns {isCorrect, matchText}.
 * 
 * Note: For SR trials, context.srGrammarMatch indicates a valid grammar match
 * (the user said a recognized word), NOT whether the answer is correct.
 * We still need to evaluate the transcript against the actual answer.
 */
export async function evaluateAnswerService(context: AnswerEvaluationContext) {
  if (context.h5pResult) {
    const outcomes = resolveH5PModelOutcomes(context.h5pResult);
    return {
      isCorrect: outcomes.every((outcome) => outcome.correct),
      matchText: outcomes.map((outcome) => outcome.correct ? '1' : '0').join(''),
    };
  }

  const sparcProductionRuleEvaluation = evaluateSparcProductionRuleOutcome(context);
  if (sparcProductionRuleEvaluation) {
    return sparcProductionRuleEvaluation;
  }

  const sparcEvaluation = evaluateSparcNodeIntent(context);
  if (sparcEvaluation) {
    return sparcEvaluation;
  }

  const rawAnswer = typeof context.userAnswer === 'string' ? context.userAnswer : '';
  const userAnswer = rawAnswer.trim();
  const currentAnswer = context.currentAnswer || '';
  const originalAnswer = context.originalAnswer || '';
  const caseSensitive = context.deliverySettings?.caseSensitive === true;
  const setspec = context.setspec || (context.buttonTrial
    ? undefined
    : Session.get('currentTdfFile')?.tdfs?.tutor?.setspec);

  const result = await Answers.answerIsCorrect(
    userAnswer,
    currentAnswer,
    originalAnswer,
    '',
    setspec,
    { caseSensitive }
  );

  return {
    isCorrect: !!result?.isCorrect,
    matchText: result?.matchText || '',
  };
}

/**
 * Ready prompt delay before enabling input or study display.
 * Mirrors Blaze readyPromptStringDisplayTime behavior.
 */
export async function readyPromptDelayService(context: TimedDisplayContext) {
  const delivery = context.deliverySettings || {};
  const delayMs = parseInt(String(delivery.readyPromptStringDisplayTime ?? ''), 10) || 0;
  if (delayMs > 0) {
    
    await delay(delayMs);
  }
  return { delayMs };
}

/**
 * Prestimulus display delay.
 */
export async function prestimulusDelayService(context: TimedDisplayContext) {
  const delivery = context.deliverySettings || {};
  const delayMs = parseInt(String(delivery.prestimulusdisplaytime ?? ''), 10) || 0;
  if (delayMs > 0) {
    
    await delay(delayMs);
  }
  return { delayMs };
}

/**
 * Ensure one UI paint tick before continuing (study answer should be visible first).
 */
async function uiPaintService() {
  await new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(() => resolve(), 0);
  });
  return { painted: true };
}

/**
 * Delay + play question audio before enabling input.
 */
export async function questionAudioGateService(context: AudioGateContext) {
  const delivery = context.deliverySettings || {};
  const audioSrc = context.currentDisplay?.audioSrc || '';
  if (!audioSrc) {
    return { skipped: true };
  }

  const delayMs = parseInt(String(delivery.timeuntilaudio ?? ''), 10) || 0;
  if (delayMs > 0) {
    
    await delay(delayMs);
  }

  await ttsPlaybackService(context, {
    audioSrc,
    isQuestion: true,
  });

  return { played: true };
}







