/**
 * @fileoverview Action functions for card state machine
 * Actions are side effects that occur during state transitions
 */

import { assign as xAssign } from 'xstate';
import { Session } from 'meteor/session';
import { LOG_PREFIXES } from './constants';
import { resetSrAttempts as resetSrAttemptsService } from '../services/speechRecognitionService';
import { ttsPlaybackService, shouldPlayAudioPrompt, stopTtsPlayback } from '../services/ttsService';
import { getFeedbackTimeoutMs } from '../utils/timeoutUtils';
import { Answers } from '../../answerAssess';
import { UiSettingsStore } from '../../../../lib/state/uiSettingsStore';
import { DeliveryParamsStore } from '../../../../lib/state/deliveryParamsStore';
import { clientConsole } from '../../../../lib/clientLogger';
import { getStimAnswerDisplayCase } from '../../../../lib/currentTestingHelpers';
import { CardStore } from '../../modules/cardStore';
import {
  startEarlyLockForCurrentTrial as startEarlyLockForCurrentTrialService,
  commitPreparedTrialRuntime as commitPreparedTrialRuntimeService,
} from '../services/unitEngineService';

type ActionContext = {
  [key: string]: unknown;
  currentDisplay: { text?: string; clozeText?: string; audioSrc?: string };
  questionDisplay?: unknown;
  currentAnswer: string;
  originalAnswer: string;
  buttonTrial: boolean;
  buttonList: unknown[];
  testType: string;
  deliveryParams?: unknown;
  uiSettings: { caseSensitive?: boolean; correctMessage?: string; incorrectMessage?: string };
  setspec?: unknown;
  engine?: unknown;
  engineIndices?: { clusterIndex?: number; whichStim?: number; stimIndex?: number } | null;
  speechHintExclusionList?: string;
  userAnswer: string;
  reviewEntry?: string;
  isCorrect: boolean;
  isTimeout: boolean;
  feedbackTimeoutMs?: number;
  srGrammarMatch?: boolean | null;
  timeoutResetCounter: number;
  consecutiveTimeouts: number;
  preparedAdvanceMode?: string;
  preparedTrial?: Record<string, unknown> | null;
  source?: string;
  questionIndex: number;
  videoSession?: { isActive?: boolean; currentCheckpointIndex?: number };
  timestamps: {
    trialStart: number;
    trialEnd: number | undefined;
    firstKeypress: number | undefined;
    inputEnabled: number | undefined;
    feedbackStart: number | undefined;
    feedbackEnd: number | undefined;
  };
  audio: {
    srAttempts: number;
    waitingForTranscription: boolean;
    recordingLocked: boolean;
  };
};

type ActionEventOutput = {
  buttonTrial?: boolean;
  buttonList?: unknown[];
  isCorrect?: boolean;
  matchText?: string;
};

type ActionEvent = {
  [key: string]: unknown;
  type?: string;
  source?: string;
  error?: unknown;
  cause?: unknown;
  output?: ActionEventOutput;
  timestamp?: number;
  userAnswer?: string;
  transcript?: string;
  isCorrect?: boolean;
  sessionId?: string;
  unitId?: string;
  tdfId?: string;
  display?: unknown;
  answer?: string;
  buttonTrial?: boolean;
  buttonList?: unknown[];
  testType?: string;
  deliveryParams?: unknown;
  uiSettings?: unknown;
  setspec?: unknown;
  engineIndices?: { clusterIndex?: number; whichStim?: number; stimIndex?: number };
  speechHintExclusionList?: string;
};

type ActionArgs = {
  context: ActionContext;
  event?: ActionEvent;
  self?: {
    getSnapshot?: () => {
      value?: unknown;
      matches?: (stateValue: string) => boolean;
    };
  };
};

type AssignmentShape = Record<string, (args: ActionArgs) => unknown>;

const assign = xAssign as unknown as (shape: AssignmentShape) => unknown;

/**
 * @typedef {import('./types').CardMachineContext} CardMachineContext
 * @typedef {import('./types').CardMachineEvent} CardMachineEvent
 * @typedef {import('./types').CardMachineActorArgs} CardMachineActorArgs
 */

// =============================================================================
// CONTEXT ASSIGNMENT ACTIONS
// =============================================================================

/**
 * Load card data from CARD_SELECTED event into context
 */
export const loadCardData = assign({
  currentDisplay: ({ event }: ActionArgs) => event?.display,
  questionDisplay: ({ event }: ActionArgs) => event?.display,
  currentAnswer: ({ event }: ActionArgs) => event?.answer,
  originalAnswer: ({ event }: ActionArgs) => event?.answer,
  buttonTrial: ({ event }: ActionArgs) => event?.buttonTrial,
  buttonList: ({ event }: ActionArgs) => event?.buttonList || [],
  testType: ({ event }: ActionArgs) => event?.testType,
  deliveryParams: ({ context, event }: ActionArgs) => ({
    ...(context.deliveryParams || {}),
    ...(event?.deliveryParams || {}),
  }),
  uiSettings: ({ context, event }: ActionArgs) => ({
    ...(context.uiSettings || {}),
    ...(event?.uiSettings || {}),
  }),
  setspec: ({ event }: ActionArgs) => event?.setspec,
  engineIndices: ({ event }: ActionArgs) => event?.engineIndices,
  speechHintExclusionList: ({ event }: ActionArgs) => event?.speechHintExclusionList || '',
  // Reset trial-specific state
  userAnswer: () => '',
  isCorrect: () => false,
  isTimeout: () => false,
  srGrammarMatch: () => null,
  timeoutResetCounter: () => 0,
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialStart: 0,
    trialEnd: undefined,
    firstKeypress: undefined,
    inputEnabled: undefined,
    feedbackStart: undefined,
    feedbackEnd: undefined,
  }),
});

/**
 * Initialize session from START event
 */
export const initializeSession = assign({
  sessionId: ({ event }: ActionArgs) => event?.sessionId,
  unitId: ({ event }: ActionArgs) => event?.unitId,
  tdfId: ({ event }: ActionArgs) => event?.tdfId,
  consecutiveTimeouts: () => 0,
  errorMessage: () => undefined,
  uiSettings: () => UiSettingsStore.get(),
  deliveryParams: () => DeliveryParamsStore.get(),
});

export const clearUserAnswer = assign({
  userAnswer: () => '',
});

/**
 */
export const syncDeliveryParams = ({ context }: ActionArgs) => {
  if (context.deliveryParams) {
    Session.set('currentDeliveryParams', context.deliveryParams);
  }
};

export const syncUiSettings = ({ context }: ActionArgs) => {
  if (context.uiSettings) {
    UiSettingsStore.set(context.uiSettings as Parameters<typeof UiSettingsStore.set>[0]);
  }
};

/**
 */
export const syncCardStore = ({ context, event }: ActionArgs) => {
  const buttonTrial = event?.output?.buttonTrial ?? context.buttonTrial;
  const buttonList = event?.output?.buttonList || context.buttonList || [];
  CardStore.setButtonTrial(!!buttonTrial);
  CardStore.setButtonList(buttonList);
};

export function syncSessionIndices({ context }: ActionArgs) {
  const indices = context.engineIndices || {};
  if (Number.isFinite(indices.clusterIndex)) {
    Session.set('clusterIndex', indices.clusterIndex);
  }
  if (Number.isFinite(indices.stimIndex) || Number.isFinite(indices.whichStim)) {
    Session.set('engineIndices', {
      ...indices,
      stimIndex: Number.isFinite(indices.stimIndex) ? indices.stimIndex : indices.whichStim,
    });
  }
  CardStore.setQuestionIndex(context.questionIndex || 1);
}

export const incrementQuestionIndex = assign({
  questionIndex: ({ context }: ActionArgs) => {
    const current = Number(context.questionIndex);
    return Number.isFinite(current) ? current + 1 : 1;
  },
});

/**
 * Keep live answer context in fast local runtime state.
 * This should not persist through ExperimentStateStore for learning-card checkpointing.
 */
export const syncCurrentAnswer = ({ context }: ActionArgs) => {
  const currentAnswer = context.currentAnswer || '';
  
  Session.set('currentAnswer', currentAnswer);
};

/**
 * Capture user's answer from SUBMIT event
 */
export const captureAnswer = assign({
  userAnswer: ({ event }: ActionArgs) => event?.userAnswer,
  source: ({ event, context }: ActionArgs) => event?.source || context.source || 'keyboard',
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    // Submit timestamp anchors end latency.
    trialEnd: event?.timestamp || Date.now(),
    // For click-only flows with no prior keypress/activity event, first input
    // onset is effectively the submit action itself.
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
});

/**
 * Capture force-correction entry without overwriting original trial answer.
 */
export const setReviewEntry = assign({
  reviewEntry: ({ context, event, self }: ActionArgs) => {
    const snapshot = self?.getSnapshot?.();
    if (snapshot?.matches?.('feedback.forceCorrecting')) {
      return event?.userAnswer ?? context.reviewEntry;
    }
    return context.reviewEntry;
  },
});

/**
 * Capture SR transcription
 */
export const captureTranscription = assign({
  userAnswer: ({ event }: ActionArgs) => event?.transcript,
  srGrammarMatch: ({ event }: ActionArgs) => event?.isCorrect,
  source: () => 'voice',
  // Stamp trial end at transcription submit time; otherwise markTrialEnd can
  // fall back later in transition (after feedback), inflating end/start latencies.
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: context.timestamps.trialEnd || event?.timestamp || Date.now(),
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

/**
 * Force an empty answer after SR exhaustion.
 */
export const forceSrFailureAnswer = assign({
  userAnswer: () => '',
  isCorrect: () => false,
  isTimeout: () => false,
  source: () => 'voice',
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: context.timestamps.trialEnd || Date.now(),
    firstKeypress: context.timestamps.firstKeypress || context.timestamps.trialEnd || Date.now(),
  }),
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

/**
 * Mark trial as timed out
 */
export const markTimeout = assign({
  isTimeout: () => true,
  userAnswer: () => '', // Empty answer for timeout
  source: () => 'timeout',
  consecutiveTimeouts: ({ context }: ActionArgs) => context.consecutiveTimeouts + 1,
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: Date.now(),
  }),
});

/**
 * Reset timeout counter (on successful answer)
 */
export const resetTimeoutCounter = assign({
  consecutiveTimeouts: () => 0,
});

export const markTimeoutReset = assign({
  timeoutResetCounter: ({ context }: ActionArgs) => {
    const current = Number.isFinite(context.timeoutResetCounter) ? context.timeoutResetCounter : 0;
    return current + 1;
  },
});

/**
 * Increment SR attempt counter
 */
export const incrementSrAttempt = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    srAttempts: context.audio.srAttempts + 1,
  }),
});

/**
 * Reset SR state for new trial
 */
export const resetSrState = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    srAttempts: 0,
    waitingForTranscription: false,
    recordingLocked: false,
  }),
});

/**
 * Reset SR attempt counter in SR service.
 */
export function resetSrAttempts() {
  resetSrAttemptsService();
}

/**
 * Set recording locked flag (e.g., during TTS)
 */
export const lockRecording = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    recordingLocked: true,
  }),
});

/**
 * Clear recording locked flag
 */
export const unlockRecording = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    recordingLocked: false,
  }),
});

/**
 * Set waiting for transcription flag
 */
export const setWaitingForTranscription = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: true,
  }),
});

/**
 * Clear waiting for transcription flag
 */
export const clearWaitingForTranscription = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

/**
 * Mark input enabled timestamp
 */
export const markInputEnabled = assign({
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    inputEnabled: Date.now(),
  }),
});

/**
 * Mark trial exposure start when the trial content begins its visible fade-in.
 */
export const markTrialRevealStart = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    if (context.timestamps.trialStart > 0) {
      return context.timestamps;
    }
    const trialStart = event?.timestamp || Date.now();
    return {
      ...context.timestamps,
      trialStart,
      feedbackStart: context.testType === 's'
        ? context.timestamps.feedbackStart || trialStart
        : context.timestamps.feedbackStart,
    };
  },
});

/**
 * Mark first keypress timestamp
 */
export const markFirstKeypress = assign({
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
});

/**
 * Mark feedback start timestamp
 */
export const markFeedbackStart = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    const feedbackStart = event?.timestamp || Date.now();
    clientConsole(2, '[CardMachine][FeedbackTiming] markFeedbackStart', {
      testType: context.testType,
      feedbackStart,
      existingFeedbackTimeoutMs: context.feedbackTimeoutMs,
      isCorrect: context.isCorrect,
    });
    return {
      ...context.timestamps,
      feedbackStart,
    };
  },
});

/**
 * Mark feedback end timestamp
 */
export const markFeedbackEnd = assign({
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    feedbackEnd: event?.timestamp || Date.now(),
  }),
});

/**
 * Mark trial end timestamp
 */
export const markTrialEnd = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    if (!context.timestamps.trialEnd && context.testType !== 's') {
      clientConsole(1, '[CardMachine] Missing submit timestamp before transition; applying fallback trialEnd', {
        testType: context.testType,
        source: context.source,
        trialStart: context.timestamps.trialStart,
        feedbackStart: context.timestamps.feedbackStart,
        feedbackEnd: context.timestamps.feedbackEnd
      });
    }
    return {
      ...context.timestamps,
      trialEnd: context.timestamps.trialEnd || event?.timestamp || Date.now(), // Don't overwrite if already set
    };
  },
});

/**
 * Set error message
 */
export const setErrorMessage = assign({
  errorMessage: ({ context, event }: ActionArgs) => {
    const typeSource = typeof event?.type === 'string' ? event.type : '';
    const source = event?.source || (typeSource.startsWith('error.platform.') ? typeSource.replace('error.platform.', '') : typeSource) || 'unknown';
    const rawError = event?.error ?? event?.cause ?? event?.output;
    const errorRecord = (typeof rawError === 'object' && rawError !== null) ? rawError as Record<string, unknown> : null;
    const message = errorRecord?.message || errorRecord?.reason || errorRecord?.error || rawError || context.errorMessage || 'Unknown error';
    return `${source}: ${message}`;
  },
});

/**
 * Clear error message
 */
export const clearErrorMessage = assign({
  errorMessage: () => undefined,
});

/**
 * Swap in prestimulus display text before showing the question.
 */
export const setPrestimulusDisplay = assign({
  currentDisplay: ({ context }: ActionArgs) => {
    const prestimulusDisplay = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.prestimulusDisplay;
    if (!prestimulusDisplay) {
      return context.currentDisplay;
    }
    return { text: prestimulusDisplay };
  },
});

/**
 * Restore stored question display after prestimulus.
 */
export const restoreQuestionDisplay = assign({
  currentDisplay: ({ context }: ActionArgs) => context.questionDisplay || context.currentDisplay,
});


/**
 * Apply answer evaluation result from service.
 * Also upgrades userAnswer to the stim file's original casing for feedback display.
 */
export const applyValidationResult = assign({
  isCorrect: ({ event }: ActionArgs) => {
    const result = event?.output?.isCorrect ?? false;
    return result;
  },
  userAnswer: ({ context }: ActionArgs) => getStimAnswerDisplayCase(context.userAnswer),
  feedbackMessage: ({ event }: ActionArgs) => event?.output?.matchText || '',
  feedbackTimeoutMs: ({ context, event }: ActionArgs) => {
    const timeoutContext: {
      deliveryParams?: Record<string, unknown>;
      testType?: string;
      isCorrect?: boolean;
    } = {
      testType: context.testType,
      isCorrect: event?.output?.isCorrect ?? false,
    };

    if (context.deliveryParams && typeof context.deliveryParams === 'object') {
      timeoutContext.deliveryParams = context.deliveryParams as Record<string, unknown>;
    }

    const timeoutMs = getFeedbackTimeoutMs(timeoutContext);

    clientConsole(2, '[CardMachine][FeedbackTiming] applyValidationResult', {
      testType: context.testType,
      isCorrect: timeoutContext.isCorrect,
      feedbackTimeoutMs: timeoutMs,
      correctprompt: timeoutContext.deliveryParams?.correctprompt,
      reviewstudy: timeoutContext.deliveryParams?.reviewstudy,
      purestudy: timeoutContext.deliveryParams?.purestudy,
      feedbackTimeout: timeoutContext.deliveryParams?.feedbackTimeout,
    });

    return timeoutMs;
  },
});

// =============================================================================
// ANSWER VALIDATION ACTIONS
// =============================================================================

/**
 * Validate user's answer against correct answer
 * This is a placeholder - actual implementation will use answerAssess.js
 */
export const validateAnswer = assign({
  isCorrect: ({ context }: ActionArgs) => {
    const userAnswer = context.userAnswer.trim();
    const correctAnswer = context.currentAnswer.trim();

    if (!userAnswer) {
      // Empty answer is incorrect
      return false;
    }

    // Case-sensitive comparison if enabled
    if (context.uiSettings.caseSensitive) {
      return userAnswer === correctAnswer;
    }

    // Case-insensitive comparison
    return userAnswer.toLowerCase() === correctAnswer.toLowerCase();
  },
});

// =============================================================================
// SIDE EFFECT ACTIONS (Pure functions that return void)
// =============================================================================

/**
 * Log state transition
 * @param {CardMachineActorArgs} args
 */
export function logStateTransition({ context: _context, event, self }: ActionArgs) {
  const snapshotState = self?.getSnapshot?.();
  const _eventType = event?.type || 'unknown';
  const _stateValue = snapshotState?.value;

  if (
    typeof _stateValue === 'string' ||
    (typeof _stateValue === 'object' && _stateValue !== null)
  ) {
    clientConsole(2, '[CardMachine][State]', {
      eventType: _eventType,
      state: _stateValue,
    });
  }
}

/**
 * Log error to console and error reporting
 * @param {CardMachineActorArgs} args
 */
export function logError({ context, event }: ActionArgs) {
  const rawType = typeof event?.type === 'string' ? event.type : '';
  const source = event?.source ||
    (rawType.startsWith('error.platform.') ? rawType.replace('error.platform.', '') : rawType) || 'unknown';
  const error = event?.error ?? event?.cause ?? event?.output;

  // Suppress "no-results" error from SR (silence is common and retryable)
  if (source === 'speechRecognition' && (error === 'no-results' || event?.silence)) {
    
    return;
  }

  clientConsole(1, LOG_PREFIXES.ERROR, `Error from ${source}:`, error);
  if (!error) {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Error event details:', event, { context });
  }

  // TODO: Send to error reporting system (ErrorReports collection)
  // Meteor.call('reportError', {
  //   source,
  //   error: error.message,
  //   stack: error.stack,
  //   context: {
  //     sessionId: context.sessionId,
  //     tdfId: context.tdfId,
  //     testType: context.testType,
  //   },
  // });
}

/**
 * Log trial history to database
 * @param {CardMachineActorArgs} args
 */
export function logHistory({ context: _context }: ActionArgs) {
  

  // TODO: Call Meteor method to save to Histories collection
  // Meteor.callAsync('logTrialHistory', {
  //   sessionId: context.sessionId,
  //   tdfId: context.tdfId,
  //   unitId: context.unitId,
  //   testType: context.testType,
  //   userAnswer: context.userAnswer,
  //   correctAnswer: context.currentAnswer,
  //   isCorrect: context.isCorrect,
  //   isTimeout: context.isTimeout,
  //   timestamps: context.timestamps,
  //   engineIndices: context.engineIndices,
  // });
}

/**
 * Focus on input element
 * @param {CardMachineActorArgs} args
 */
export function focusInput() {
  // Find and focus the input element
  // This will be implemented in Svelte component
  

  // Dispatch custom event for Svelte component to handle
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:focusInput'));
  }
}

/**
 * Disable input element
 * @param {CardMachineActorArgs} args
 */
export function disableInput() {
  

  CardStore.setInputReady(false);
  Session.set('inputReady', false);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:disableInput'));
  }
}

/**
 * Enable input element
 * @param {CardMachineActorArgs} args
 */
export function enableInput() {
  

  CardStore.setInputReady(true);
  Session.set('inputReady', true);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:enableInput'));
  }
}

/**
 * Clear feedback display
 * @param {CardMachineActorArgs} args
 */
export function clearFeedback() {
  CardStore.setCardValue('feedbackTtsText', '');
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:clearFeedback'));
  }
}

/**
 * Announce to screen reader
 * @param {CardMachineActorArgs} args
 */
export function announceToScreenReader({ context }: ActionArgs) {
  // Determine what to announce based on current state
  let message = '';

  if (context.isCorrect) {
    message = context.uiSettings.correctMessage || 'Correct';
  } else if (!context.isCorrect && context.userAnswer) {
    message = context.uiSettings.incorrectMessage || 'Incorrect';
  } else if (context.isTimeout) {
    message = 'Time out';
  }

  if (message && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:announce', {
      detail: { message },
    }));
  }
}

/**
 * Track performance metrics
 * @param {CardMachineActorArgs} args
 */
export function trackPerformance({ context, event: _event }: ActionArgs) {
  const trialEnd = context.timestamps.trialEnd ?? context.timestamps.trialStart;
  const inputEnabled = context.timestamps.inputEnabled ?? context.timestamps.trialStart;
  const _trialDuration = trialEnd - context.timestamps.trialStart;
  const _responseTime = context.timestamps.firstKeypress
    ? context.timestamps.firstKeypress - inputEnabled
    : null;

  

  // TODO: Send to UserMetrics collection
  // Meteor.callAsync('updateUserMetrics', {
  //   userId: Meteor.userId(),
  //   tdfId: context.tdfId,
  //   trialDuration,
  //   responseTime,
  //   isCorrect: context.isCorrect,
  // });
}

/**
 * Update scroll history (if feature is kept)
 * @param {CardMachineActorArgs} args
 */
export function updateScrollHistory({ context: _context }: ActionArgs) {
  // TODO: Determine if scroll history feature should be kept
  
}

/**
 * Display answer (for study trials)
 * @param {CardMachineActorArgs} args
 */
export function displayAnswer({ context }: ActionArgs) {
  const displayAnswerText = Answers.getDisplayAnswerText(
    String(context.originalAnswer || context.currentAnswer || '')
  ) || String(context.currentAnswer || '');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:displayAnswer', {
      detail: { answer: displayAnswerText },
    }));
  }
}

export function startEarlyLockForCurrentTrial({ context }: ActionArgs) {
  startEarlyLockForCurrentTrialService(context as unknown as Parameters<typeof startEarlyLockForCurrentTrialService>[0]);
}

export function commitPreparedTrialRuntime({ context }: ActionArgs) {
  commitPreparedTrialRuntimeService({
    engine: context.engine as Parameters<typeof commitPreparedTrialRuntimeService>[0]['engine'],
    preparedTrial: context.preparedTrial || null,
  });
}

/**
 * Display feedback
 * @param {CardMachineActorArgs} args
 */
export function displayFeedback({ context }: ActionArgs) {
  CardStore.setCardValue('feedbackTtsText', '');
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:displayFeedback', {
      detail: {
        isCorrect: context.isCorrect,
        correctAnswer: context.currentAnswer,
        userAnswer: context.userAnswer,
      },
    }));
  }
}

/**
 * Notify video layer about answer correctness for rewind handling.
 */
export function notifyVideoAnswer({ context }: ActionArgs) {
  clientConsole(2, '[VIDEO-REWIND-DEBUG] notifyVideoAnswer called:', {
    isActive: context.videoSession?.isActive,
    isCorrect: context.isCorrect,
    currentCheckpointIndex: context.videoSession?.currentCheckpointIndex,
  });
  if (!context.videoSession?.isActive) {
    clientConsole(1, '[VIDEO-REWIND-DEBUG] notifyVideoAnswer skipped because videoSession is not active');
    return;
  }
  if (!Number.isFinite(context.videoSession.currentCheckpointIndex)) {
    throw new Error('[CardMachine] Video answer completion missing active checkpoint index');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:videoAnswer', {
      detail: {
        isCorrect: context.isCorrect,
        checkpointIndex: context.videoSession.currentCheckpointIndex,
      },
    }));
    clientConsole(2, '[VIDEO-REWIND-DEBUG] cardMachine:videoAnswer event dispatched');
  }
}

/**
 * Set display ready flag (after fade-in complete)
 * @param {CardMachineActorArgs} args
 */
export function setDisplayReady({ context: _context }: ActionArgs) {
  

  CardStore.setDisplayReady(true);
  Session.set('displayReady', true);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:displayReady'));
  }
}

/**
 * Clear display/input readiness before loading a new trial.
 */
export function setDisplayNotReady() {
  CardStore.setDisplayReady(false);
  Session.set('displayReady', false);
}

export function setInputNotReady() {
  CardStore.setInputReady(false);
  Session.set('inputReady', false);
}

/**
 * Start recording (SR)
 * @param {CardMachineActorArgs} args
 */
export function startRecording({ context: _context, event: _event }: ActionArgs) {
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:startRecording'));
  }
}

/**
 * Trigger question TTS without blocking input.
 */
export function maybeSpeakQuestion({ context }: ActionArgs) {
  const display = context.currentDisplay || {};
  const questionText = display.clozeText || display.text || '';

  if (!questionText || display.audioSrc) {
    return;
  }

  if (!shouldPlayAudioPrompt('question')) {
    return;
  }

  if (CardStore.isTtsRequested()) {
    return;
  }

  void ttsPlaybackService(context, {
    text: questionText,
    isQuestion: true,
    autoRestartSr: true,
  });
}

/**
 * Stop recording (SR)
 * @param {CardMachineActorArgs} args
 */
export function stopRecording({ context: _context, event: _event }: ActionArgs) {
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:stopRecording'));
  }
}

/**
 * Play TTS
 * @param {CardMachineActorArgs} args
 */
export function playTTS({ context, event: _event }: ActionArgs) {
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:playTTS', {
      detail: { text: context.currentDisplay.text },
    }));
  }
}

/**
 * Stop TTS
 * @param {CardMachineActorArgs} args
 */
export function stopTTS({ context: _context, event: _event }: ActionArgs) {
  

  stopTtsPlayback('machine-stop');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:stopTTS'));
  }
}

/**
 * Resume video playback (video sessions).
 */
export function resumeVideoPlayback() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:resumeVideo'));
  }
}

/**
 * Reset timers
 * @param {CardMachineActorArgs} args
 */
export function resetTimers({ context: _context }: ActionArgs) {
  

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cardMachine:resetTimers'));
  }
}

/**
 * Actions to run when error occurs
 */
export const errorActions = [
  setErrorMessage,
  logError,
  disableInput,
  stopRecording,
  stopTTS,
];

// =============================================================================
// UNIT PROGRESSION ACTIONS
// =============================================================================

/**
 * Handle unit completion - navigate to next unit or completion page
 * Calls unitIsFinished() from unitProgression service
 */
export function handleUnitCompletion({ context: _context, event: _event }: ActionArgs) {
  

  // Import and call unitIsFinished
  import('../services/unitProgression').then(({ unitIsFinished }) => {
    unitIsFinished('Unit Engine');
  }).catch((error) => {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Failed to handle unit completion:', error);
  });
}









