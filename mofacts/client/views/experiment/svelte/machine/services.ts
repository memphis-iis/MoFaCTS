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
import { isTtsRequested } from '../services/audioRuntimeState';
import {
  evaluateSparcNodeIntent,
  evaluateSparcProductionRuleOutcome,
  type SparcAnswerEvaluationContext,
} from '../services/sparcProductionRuleEvaluation';
import { fromCallback, fromPromise, type AnyEventObject } from 'xstate';
import { resolveH5PModelOutcomes } from '../../../../../common/lib/h5pTrialResult';
import type { H5PTrialResult } from '../../../../../common/types';

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
  sparcResult?: SparcAnswerEvaluationContext['sparcResult'];
  engine?: ServiceRecord | null;
  currentDisplay?: {
    type?: string;
    pageKey?: string;
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
    accentSensitive?: boolean;
  };
  tdfId?: unknown;
  userId?: unknown;
  attemptId?: unknown;
  unitId?: unknown;
  setspec?: unknown;
  buttonTrial?: boolean;
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
 * @typedef {import('./types').ContentRuntimeMachineContext} ContentRuntimeMachineContext
 * @typedef {import('./types').ContentRuntimeMachineEvent} ContentRuntimeMachineEvent
 * @typedef {import('./types').CardSelectionResult} CardSelectionResult
 * @typedef {import('./types').SpeechRecognitionResult} SpeechRecognitionResult
 * @typedef {import('./types').ContentRuntimeMachineActorArgs} ContentRuntimeMachineActorArgs
 */

// =============================================================================
// CARD SELECTION SERVICE
// =============================================================================

/**
 * Select next card from unit engine
 * This is invoked by the machine; returns Promise
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {Promise<CardSelectionResult>}
 */
async function selectNextCard(context: { deliverySettings?: unknown }, _event: unknown) {
  

  try {
    // Legacy placeholder path; current card selection is handled by selectCardService.
    //
    // const result = await window.unitEngine.selectNextCard({
    //   userId: context.userId,
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {Promise<void>}
 */
function mainCardTimeout(context: TimeoutContextLike, _event: unknown) {
  const remaining = getMainTimeoutRemainingMs(context);

  return new Promise<void>((resolve) => {
    let ttsWaitIntervalId: ReturnType<typeof setInterval> | null = null;
    const resolveAfterTtsCompletes = () => {
      if (!isTtsRequested()) {
        resolve();
        return;
      }

      ttsWaitIntervalId = setInterval(() => {
        if (isTtsRequested()) {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
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

  clientConsole(2, '[ContentRuntimeMachine][FeedbackTiming] feedbackTimeout:start', {
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
      clientConsole(2, '[ContentRuntimeMachine][FeedbackTiming] feedbackTimeout:done', {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
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
   * @param {(context: ContentRuntimeMachineContext, event: ContentRuntimeMachineEvent) => Promise<unknown>} serviceFn
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
   * @param {(context: ContentRuntimeMachineContext, event: ContentRuntimeMachineEvent) => ((send: (event: Record<string, unknown>) => void, receive: (listener: (event: Record<string, unknown>) => void) => void) => (() => void) | void)} serviceFn
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
  const accentSensitive = context.deliverySettings?.accentSensitive === true;
  const setspec = context.setspec || (context.buttonTrial
    ? undefined
    : Session.get('currentTdfFile')?.tdfs?.tutor?.setspec);

  const result = await Answers.answerIsCorrect(
    userAnswer,
    currentAnswer,
    originalAnswer,
    '',
    setspec,
    { caseSensitive, accentSensitive }
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







