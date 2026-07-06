import * as guards from './guards';
import * as contentRuntimeMachineActions from './contentRuntimeMachineActions';
import { createServices } from './services';
import type { MachineArgs } from './contentRuntimeMachineTypes';

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

export const contentRuntimeMachineOptions = {
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
    initializeSession: contentRuntimeMachineActions.initializeSession,
    loadCardData: contentRuntimeMachineActions.loadCardData,
    captureAnswer: contentRuntimeMachineActions.captureAnswer,
    setReviewEntry: contentRuntimeMachineActions.setReviewEntry,
    captureTranscription: contentRuntimeMachineActions.captureTranscription,
    markTimeout: contentRuntimeMachineActions.markTimeout,
    markTimeoutReset: contentRuntimeMachineActions.markTimeoutReset,
    resetTimeoutCounter: contentRuntimeMachineActions.resetTimeoutCounter,
    incrementSrAttempt: contentRuntimeMachineActions.incrementSrAttempt,
    resetSrState: contentRuntimeMachineActions.resetSrState,
    resetSrAttempts: contentRuntimeMachineActions.resetSrAttempts,
    lockRecording: contentRuntimeMachineActions.lockRecording,
    unlockRecording: contentRuntimeMachineActions.unlockRecording,
    setWaitingForTranscription: contentRuntimeMachineActions.setWaitingForTranscription,
    clearWaitingForTranscription: contentRuntimeMachineActions.clearWaitingForTranscription,
    markInputEnabled: contentRuntimeMachineActions.markInputEnabled,
    markFirstKeypress: contentRuntimeMachineActions.markFirstKeypress,
    markTrialRevealStart: contentRuntimeMachineActions.markTrialRevealStart,
    markFeedbackStart: contentRuntimeMachineActions.markFeedbackStart,
    markFeedbackEnd: contentRuntimeMachineActions.markFeedbackEnd,
    markTrialEnd: contentRuntimeMachineActions.markTrialEnd,
    setErrorMessage: contentRuntimeMachineActions.setErrorMessage,
    clearErrorMessage: contentRuntimeMachineActions.clearErrorMessage,
    validateAnswer: contentRuntimeMachineActions.validateAnswer,
    applyValidationResult: contentRuntimeMachineActions.applyValidationResult,
    applySparcActionResult: contentRuntimeMachineActions.applySparcActionResult,
    clearUserAnswer: contentRuntimeMachineActions.clearUserAnswer,
    syncDeliverySettings: contentRuntimeMachineActions.syncDeliverySettings,
    syncCardStore: contentRuntimeMachineActions.syncCardStore,
    syncSessionIndices: contentRuntimeMachineActions.syncSessionIndices,
    syncCurrentAnswer: contentRuntimeMachineActions.syncCurrentAnswer,
    incrementQuestionIndex: contentRuntimeMachineActions.incrementQuestionIndex,
    setPrestimulusDisplay: contentRuntimeMachineActions.setPrestimulusDisplay,
    restoreQuestionDisplay: contentRuntimeMachineActions.restoreQuestionDisplay,
    forceSrFailureAnswer: contentRuntimeMachineActions.forceSrFailureAnswer,

    // Side effect actions
    logStateTransition: contentRuntimeMachineActions.logStateTransition,
    logError: contentRuntimeMachineActions.logError,
    focusInput: contentRuntimeMachineActions.focusInput,
    disableInput: contentRuntimeMachineActions.disableInput,
    enableInput: contentRuntimeMachineActions.enableInput,
    clearFeedback: contentRuntimeMachineActions.clearFeedback,
    announceToScreenReader: contentRuntimeMachineActions.announceToScreenReader,
    handleUnitCompletion: contentRuntimeMachineActions.handleUnitCompletion,
    displayAnswer: contentRuntimeMachineActions.displayAnswer,
    displayFeedback: contentRuntimeMachineActions.displayFeedback,
    setDisplayReady: contentRuntimeMachineActions.setDisplayReady,
    setDisplayNotReady: contentRuntimeMachineActions.setDisplayNotReady,
    setInputNotReady: contentRuntimeMachineActions.setInputNotReady,
    startRecording: contentRuntimeMachineActions.startRecording,
    maybeSpeakQuestion: contentRuntimeMachineActions.maybeSpeakQuestion,
    startEarlyLockForCurrentTrial: contentRuntimeMachineActions.startEarlyLockForCurrentTrial,
    commitPreparedTrialRuntime: contentRuntimeMachineActions.commitPreparedTrialRuntime,
    stopRecording: contentRuntimeMachineActions.stopRecording,
    playTTS: contentRuntimeMachineActions.playTTS,
    stopTTS: contentRuntimeMachineActions.stopTTS,
    notifyVideoAnswer: contentRuntimeMachineActions.notifyVideoAnswer,
    resumeVideoPlayback: contentRuntimeMachineActions.resumeVideoPlayback,
    resetTimers: contentRuntimeMachineActions.resetTimers,
  },

  actors: createServices(),

  delays: {
    FADE_IN_DURATION: () => getCssDuration('--app-transition-smooth'),
    FADE_OUT_DURATION: () => getCssDuration('--app-transition-smooth'),
    FADE_OUT_STALL_TIMEOUT: () => getCssDuration('--app-transition-smooth') + 1000,
    FORCE_CORRECT_TIMEOUT: ({ context }: MachineArgs) => resolveForceCorrectTimeout(context),
  },
};
