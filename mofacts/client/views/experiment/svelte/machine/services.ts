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
import { videoPlayerService as videoService } from '../services/videoPlayerService';
import { fromCallback, fromPromise, type AnyEventObject } from 'xstate';

type TimeoutContextLike = Parameters<typeof getMainTimeoutMs>[0] & {
  feedbackTimeoutMs?: number;
  timestamps?: {
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
  uiSettings?: {
    caseSensitive?: boolean;
  };
  setspec?: unknown;
  buttonTrial?: boolean;
}

interface TimedDisplayContext extends ServiceRecord {
  deliveryParams?: Record<string, unknown>;
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
async function selectNextCard(context: { uiSettings?: unknown }, _event: unknown) {
  

  try {
    // TODO: Call unitEngine.js to get next card
    // This is a placeholder - actual implementation will integrate with unitEngine
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
      deliveryParams: {},
      uiSettings: context.uiSettings, // Pass through from context
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
  const timeout = getMainTimeoutMs(context);

  

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      
      resolve();
    }, timeout);

    // Store timeout ID for potential cancellation
    // (XState will auto-cancel when service exits)
    return () => clearTimeout(timeoutId);
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
  const timeout = Number.isFinite(context.feedbackTimeoutMs)
    ? Math.max(0, Number(context.feedbackTimeoutMs))
    : getFeedbackTimeoutMs(context);
  const feedbackStart = Number(context.timestamps?.feedbackStart);
  const elapsed = Number.isFinite(feedbackStart) && feedbackStart > 0
    ? Math.max(0, Date.now() - feedbackStart)
    : 0;
  const fadeOutDurationMs = getFeedbackFadeOutDurationMs();
  const remaining = Math.max(0, timeout - elapsed - fadeOutDurationMs);

  clientConsole(2, '[CardMachine][FeedbackTiming] feedbackTimeout:start', {
    testType: context.testType,
    isCorrect: context.isCorrect,
    feedbackTimeoutMs: context.feedbackTimeoutMs,
    resolvedTimeoutMs: timeout,
    fadeOutDurationMs,
    feedbackStart,
    elapsed,
    remaining,
    correctprompt: context.deliveryParams?.correctprompt,
    reviewstudy: context.deliveryParams?.reviewstudy,
    purestudy: context.deliveryParams?.purestudy,
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
    // TODO: Integrate with plyrHelper.js or browser TTS API
    //
    // if (context.currentDisplay.audioSrc) {
    //   // Pre-recorded audio
    //   await window.plyrHelper.play(context.currentDisplay.audioSrc);
    // } else if (context.currentDisplay.text) {
    //   // Browser TTS
    //   await window.speechSynthesis.speak(context.currentDisplay.text);
    // }

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
    .getPropertyValue('--transition-smooth')
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
    videoPlayerService: wrapPromiseService(videoService),
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
async function evaluateAnswerService(context: AnswerEvaluationContext) {
  const rawAnswer = typeof context.userAnswer === 'string' ? context.userAnswer : '';
  const userAnswer = rawAnswer.trim();
  const currentAnswer = context.currentAnswer || '';
  const originalAnswer = context.originalAnswer || '';
  const caseSensitive = context.uiSettings?.caseSensitive === true;
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
  const delivery = context.deliveryParams || {};
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
  const delivery = context.deliveryParams || {};
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
  const delivery = context.deliveryParams || {};
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







