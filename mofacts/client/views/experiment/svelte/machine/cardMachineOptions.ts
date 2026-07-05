import * as guards from './guards';
import * as cardMachineActions from './cardMachineActions';
import { createServices } from './services';
import type { MachineArgs } from './cardMachineTypes';

export function getCssDuration(varName: string): number {
  if (typeof window === 'undefined') {
    throw new Error(`Missing required theme duration: ${varName}`);
  }
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (/^\d+(\.\d+)?$/.test(cssValue)) {
    const parsed = Number(cssValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (cssValue.endsWith('ms')) {
    const parsed = Number(cssValue.slice(0, -2));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (cssValue.endsWith('s')) {
    const parsed = Number(cssValue.slice(0, -1));
    if (Number.isFinite(parsed)) return parsed * 1000;
  }
  throw new Error(`Missing required theme duration: ${varName}`);
}

export function resolveForceCorrectTimeout(context: {
  deliverySettings?: {
    forcecorrecttimeout?: unknown;
  };
}): number {
  const timeout = parseInt(String(context.deliverySettings?.forcecorrecttimeout ?? ''), 10);
  return Number.isFinite(timeout) ? timeout : 2000;
}

export const cardMachineOptions = {
  guards: {
    // Trial type guards
    isStudyTrial: guards.isStudyTrial,
    isDrillTrial: guards.isDrillTrial,
    isTestTrial: guards.isTestTrial,
    isForceCorrectTrialAndIncorrect: guards.isForceCorrectTrialAndIncorrect,
    needsForceCorrectPrompt: guards.needsForceCorrectPrompt,
    isCorrectForceCorrection: guards.isCorrectForceCorrection,
    isTimedPromptTrial: guards.isTimedPromptTrial,
    isSupportedTrialType: guards.isSupportedTrialType,
    isUnsupportedTrialType: guards.isUnsupportedTrialType,

    // Input mode guards
    isButtonTrial: guards.isButtonTrial,
    isTextTrial: guards.isTextTrial,

    // SR guards
    srEnabled: guards.srEnabled,
    srDisabled: guards.srDisabled,
    recordingLocked: guards.recordingLocked,
    recordingUnlocked: guards.recordingUnlocked,
    hasAttemptsRemaining: guards.hasAttemptsRemaining,
    attemptsExhausted: guards.attemptsExhausted,

    // TTS guards
    ttsEnabled: guards.ttsEnabled,
    ttsDisabled: guards.ttsDisabled,
    feedbackReadyForTts: guards.feedbackReadyForTts,
    feedbackReadyWithoutTts: guards.feedbackReadyWithoutTts,

    // Feedback guards
    needsFeedback: guards.needsFeedback,
    needsFeedbackAndVideoSession: guards.needsFeedbackAndVideoSession,
    noFeedback: guards.noFeedback,
    noFeedbackAndVideoSession: guards.noFeedbackAndVideoSession,
    answerCorrect: guards.answerCorrect,
    answerIncorrect: guards.answerIncorrect,

    // Timeout guards
    didTimeout: guards.didTimeout,
    didNotTimeout: guards.didNotTimeout,
    hitTimeoutThreshold: guards.hitTimeoutThreshold,
    trialRevealStarted: guards.trialRevealStarted,
    waitingForTranscription: guards.waitingForTranscription,
    notWaitingForTranscription: guards.notWaitingForTranscription,
    trialDisplaySuppressesStandardTimeout: guards.trialDisplaySuppressesStandardTimeout,

    // Unit/session guards
    unitFinished: guards.unitFinished,
    unitNotFinished: guards.unitNotFinished,
    canUsePreparedAdvance: guards.canUsePreparedAdvance,
    hasPreparedTrial: guards.hasPreparedTrial,

    // Error guards
    isHardError: guards.isHardError,
    isSoftError: guards.isSoftError,

    // Video session guards
    isVideoSession: guards.isVideoSession,
    isNotVideoSession: guards.isNotVideoSession,
    canAcceptVideoCheckpoint: guards.canAcceptVideoCheckpoint,

    hasUserAnswer: guards.hasUserAnswer,
    noUserAnswer: guards.noUserAnswer,
    hasPrestimulus: guards.hasPrestimulus,
    hasQuestionAudio: guards.hasQuestionAudio,
  },

  actions: {
    // Context assignment actions
    initializeSession: cardMachineActions.initializeSession,
    loadCardData: cardMachineActions.loadCardData,
    captureAnswer: cardMachineActions.captureAnswer,
    setReviewEntry: cardMachineActions.setReviewEntry,
    captureTranscription: cardMachineActions.captureTranscription,
    markTimeout: cardMachineActions.markTimeout,
    markTimeoutReset: cardMachineActions.markTimeoutReset,
    resetTimeoutCounter: cardMachineActions.resetTimeoutCounter,
    incrementSrAttempt: cardMachineActions.incrementSrAttempt,
    resetSrState: cardMachineActions.resetSrState,
    resetSrAttempts: cardMachineActions.resetSrAttempts,
    lockRecording: cardMachineActions.lockRecording,
    unlockRecording: cardMachineActions.unlockRecording,
    setWaitingForTranscription: cardMachineActions.setWaitingForTranscription,
    clearWaitingForTranscription: cardMachineActions.clearWaitingForTranscription,
    markInputEnabled: cardMachineActions.markInputEnabled,
    markFirstKeypress: cardMachineActions.markFirstKeypress,
    markTrialRevealStart: cardMachineActions.markTrialRevealStart,
    markFeedbackStart: cardMachineActions.markFeedbackStart,
    markFeedbackEnd: cardMachineActions.markFeedbackEnd,
    markTrialEnd: cardMachineActions.markTrialEnd,
    setErrorMessage: cardMachineActions.setErrorMessage,
    clearErrorMessage: cardMachineActions.clearErrorMessage,
    validateAnswer: cardMachineActions.validateAnswer,
    applyValidationResult: cardMachineActions.applyValidationResult,
    applySparcActionResult: cardMachineActions.applySparcActionResult,
    clearUserAnswer: cardMachineActions.clearUserAnswer,
    syncDeliverySettings: cardMachineActions.syncDeliverySettings,
    syncCardStore: cardMachineActions.syncCardStore,
    syncSessionIndices: cardMachineActions.syncSessionIndices,
    syncCurrentAnswer: cardMachineActions.syncCurrentAnswer,
    incrementQuestionIndex: cardMachineActions.incrementQuestionIndex,
    setPrestimulusDisplay: cardMachineActions.setPrestimulusDisplay,
    restoreQuestionDisplay: cardMachineActions.restoreQuestionDisplay,
    forceSrFailureAnswer: cardMachineActions.forceSrFailureAnswer,

    // Side effect actions
    logStateTransition: cardMachineActions.logStateTransition,
    logError: cardMachineActions.logError,
    focusInput: cardMachineActions.focusInput,
    disableInput: cardMachineActions.disableInput,
    enableInput: cardMachineActions.enableInput,
    clearFeedback: cardMachineActions.clearFeedback,
    announceToScreenReader: cardMachineActions.announceToScreenReader,
    handleUnitCompletion: cardMachineActions.handleUnitCompletion,
    displayAnswer: cardMachineActions.displayAnswer,
    displayFeedback: cardMachineActions.displayFeedback,
    setDisplayReady: cardMachineActions.setDisplayReady,
    setDisplayNotReady: cardMachineActions.setDisplayNotReady,
    setInputNotReady: cardMachineActions.setInputNotReady,
    startRecording: cardMachineActions.startRecording,
    maybeSpeakQuestion: cardMachineActions.maybeSpeakQuestion,
    startEarlyLockForCurrentTrial: cardMachineActions.startEarlyLockForCurrentTrial,
    commitPreparedTrialRuntime: cardMachineActions.commitPreparedTrialRuntime,
    stopRecording: cardMachineActions.stopRecording,
    playTTS: cardMachineActions.playTTS,
    stopTTS: cardMachineActions.stopTTS,
    notifyVideoAnswer: cardMachineActions.notifyVideoAnswer,
    resumeVideoPlayback: cardMachineActions.resumeVideoPlayback,
    resetTimers: cardMachineActions.resetTimers,
  },

  actors: createServices(),

  delays: {
    FADE_IN_DURATION: () => getCssDuration('--app-transition-smooth'),
    FADE_OUT_DURATION: () => getCssDuration('--app-transition-smooth'),
    FADE_OUT_STALL_TIMEOUT: () => getCssDuration('--app-transition-smooth') + 1000,
    FORCE_CORRECT_TIMEOUT: ({ context }: MachineArgs) => resolveForceCorrectTimeout(context),
  },
};
