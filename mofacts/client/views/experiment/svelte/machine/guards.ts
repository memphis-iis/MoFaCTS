/**
 * @fileoverview Guard functions for card state machine
 * Guards are boolean predicates that determine whether transitions should occur
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { TRIAL_TYPES, SUPPORTED_TRIAL_TYPES, THRESHOLDS, ERROR_SEVERITY_MAP, ERROR_SEVERITY } from './constants';
import { getFeedbackTimeoutMs } from '../utils/timeoutUtils';
import { evaluateSrAvailability } from '../../../../lib/audioAvailability';

type FeedbackTimeoutContext = Parameters<typeof getFeedbackTimeoutMs>[0];

type CardMachineActorArgs = {
  context: {
    testType?: string;
    feedbackTimeoutMs?: number | undefined;
    deliverySettings?: {
      forceCorrection?: boolean | string | undefined;
      isVideoSession?: boolean | undefined;
    };
    isCorrect?: boolean | undefined;
    buttonTrial?: boolean | undefined;
    audio?: {
      recordingLocked?: boolean | undefined;
      waitingForTranscription?: boolean | undefined;
      srAttempts?: number | undefined;
      maxSrAttempts?: number | undefined;
    };
    unitFinished?: boolean | undefined;
    preparedAdvanceMode?: string | undefined;
    preparedTrial?: Record<string, unknown> | null | undefined;
    engine?: unknown;
    userAnswer?: string | undefined;
    currentAnswer?: string | undefined;
    reviewEntry?: string | undefined;
    currentDisplay?: Record<string, unknown> & {
      audioSrc?: string | undefined;
    };
    consecutiveTimeouts?: number | undefined;
    isTimeout?: boolean | undefined;
    feedbackText?: string | undefined;
    feedbackRevealStarted?: boolean | undefined;
    feedbackSuppressed?: boolean | undefined;
  };
  event: {
    type?: string | undefined;
    userAnswer?: unknown;
    unitFinished?: boolean | undefined;
    source?: unknown;
    output?: {
      isCorrect?: unknown;
    } | undefined;
    checkpointIndex?: unknown;
    questionIndex?: unknown;
  };
};

function resolveFeedbackTimeoutMs({ context, event }: CardMachineActorArgs): number {
  const validationResult = event?.output;
  const validationIsCorrect =
    validationResult && typeof validationResult === 'object' && 'isCorrect' in validationResult
      ? Boolean(validationResult.isCorrect)
      : context.isCorrect;

  return getFeedbackTimeoutMs({
    deliverySettings: context.deliverySettings,
    testType: context.testType,
    isCorrect: validationIsCorrect,
  } as FeedbackTimeoutContext);
}

type MeteorAudioSettings = {
  audioInputMode?: boolean;
  audioPromptMode?: string;
};

type MeteorUserLike = {
  audioSettings?: MeteorAudioSettings;
};

function getMeteorUserAudioSettings(): MeteorAudioSettings {
  const user = Meteor.user() as MeteorUserLike | null | undefined;
  return user?.audioSettings ?? {};
}

// =============================================================================
// TRIAL TYPE GUARDS
// =============================================================================

/**
 * Check if current trial is a study trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isStudyTrial({ context }: CardMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.STUDY;
}

/**
 * Check if current trial is a drill trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isDrillTrial({ context }: CardMachineActorArgs): boolean {
  return [TRIAL_TYPES.DRILL, TRIAL_TYPES.FORCE_CORRECT, TRIAL_TYPES.TIMED_PROMPT].includes(context.testType || '');
}

/**
 * Check if current trial is a test trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isTestTrial({ context }: CardMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.TEST || context.testType === TRIAL_TYPES.H5P;
}

/**
 * Check if current trial type is supported
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isSupportedTrialType({ context }: CardMachineActorArgs): boolean {
  return SUPPORTED_TRIAL_TYPES.has(context.testType || '');
}

/**
 * Check if current trial type is unsupported (should error)
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function isUnsupportedTrialType(args: CardMachineActorArgs): boolean {
  return !isSupportedTrialType(args);
}

/**
 * Check if current trial is a force correct trial and user was incorrect
 */
export function isForceCorrectTrialAndIncorrect({ context }: CardMachineActorArgs): boolean {
  const isForceCorrect = context.testType === TRIAL_TYPES.FORCE_CORRECT || 
                         context.testType === TRIAL_TYPES.TIMED_PROMPT ||
                         context.deliverySettings?.forceCorrection === true ||
                         context.deliverySettings?.forceCorrection === 'true';
  return isForceCorrect && !context.isCorrect;
}

export function needsForceCorrectPrompt(args: CardMachineActorArgs): boolean {
  return isForceCorrectTrialAndIncorrect(args) && String(args.context.reviewEntry || '').trim() === '';
}

/**
 * Check if current trial is a timed prompt trial
 */
export function isTimedPromptTrial({ context }: CardMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.TIMED_PROMPT;
}

/**
 * Check if force correction input matches correct answer
 */
export function isCorrectForceCorrection({ context, event }: CardMachineActorArgs): boolean {
  const userAnswer = (event && typeof event === 'object' && 'userAnswer' in event
    ? String(event.userAnswer ?? '')
    : '').trim().toLowerCase();
  const correctAnswer = String(context.currentAnswer || '').trim().toLowerCase();
  return userAnswer === correctAnswer;
}

// =============================================================================
// INPUT MODE GUARDS
// =============================================================================

/**
 * Check if current trial is a button (multiple choice) trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isButtonTrial({ context }: CardMachineActorArgs): boolean {
  return context.buttonTrial === true;
}

/**
 * Check if current trial is a text entry trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isTextTrial({ context }: CardMachineActorArgs): boolean {
  return context.buttonTrial === false;
}

// =============================================================================
// SPEECH RECOGNITION GUARDS
// =============================================================================

/**
 * Check if speech recognition should be enabled for this trial
 * SR is only enabled for text entry trials when explicitly requested
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function srEnabled(args: CardMachineActorArgs): boolean {
  const availability = evaluateSrAvailability({
    user: Meteor.user() as MeteorUserLike | null,
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
    requireTextTrial: true,
    isTextTrial: isTextTrial(args),
  });
  return availability.status === 'available';
}

/**
 * Check if SR is disabled
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function srDisabled(args: CardMachineActorArgs): boolean {
  return !srEnabled(args);
}

/**
 * Check if recording is currently locked (e.g., during TTS playback)
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function recordingLocked({ context }: CardMachineActorArgs): boolean {
  return context.audio?.recordingLocked === true;
}

/**
 * Check if recording is unlocked
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function recordingUnlocked(args: CardMachineActorArgs): boolean {
  return !recordingLocked(args);
}

/**
 * Check if SR has attempts remaining
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function hasAttemptsRemaining({ context }: CardMachineActorArgs): boolean {
  return (context.audio?.srAttempts ?? 0) < (context.audio?.maxSrAttempts ?? 0);
}

/**
 * Check if SR has exhausted all attempts
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function attemptsExhausted(args: CardMachineActorArgs): boolean {
  return !hasAttemptsRemaining(args);
}

// =============================================================================
// TTS GUARDS
// =============================================================================

/**
 * Check if TTS is enabled for this trial
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function ttsEnabled(_args: CardMachineActorArgs): boolean {
  const userPromptMode = getMeteorUserAudioSettings().audioPromptMode;
  const questionTtsEnabled = !!userPromptMode && userPromptMode !== 'silent';
  const feedbackTtsEnabled = Session.get('enableAudioPromptAndFeedback') === true;

  return questionTtsEnabled || feedbackTtsEnabled;
}

/**
 * Check if TTS is disabled
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function ttsDisabled(args: CardMachineActorArgs): boolean {
  return !ttsEnabled(args);
}

function feedbackContentReady({ context }: CardMachineActorArgs): boolean {
  if (context.feedbackSuppressed === true) {
    return true;
  }
  return typeof context.feedbackText === 'string' && context.feedbackText.trim() !== '';
}

export function feedbackReadyForTts(args: CardMachineActorArgs): boolean {
  return args.context.feedbackRevealStarted === true &&
    args.context.feedbackSuppressed !== true &&
    feedbackContentReady(args) &&
    ttsEnabled(args);
}

export function feedbackReadyWithoutTts(args: CardMachineActorArgs): boolean {
  return args.context.feedbackRevealStarted === true &&
    feedbackContentReady(args) &&
    (args.context.feedbackSuppressed === true || ttsDisabled(args));
}

// =============================================================================
// FEEDBACK GUARDS
// =============================================================================

/**
 * Check if feedback should be displayed
 * Feedback is shown for drill trials when feedback timeout is > 0ms
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function needsFeedback(args: CardMachineActorArgs): boolean {
  const feedbackTimeoutMs = resolveFeedbackTimeoutMs(args);
  return (
    isDrillTrial(args) &&
    feedbackTimeoutMs > 0
  );
}

/**
 * Check if feedback should NOT be displayed
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function noFeedback(args: CardMachineActorArgs): boolean {
  return !needsFeedback(args);
}

/**
 * Check if feedback should be displayed and this is a video session.
 */
export function needsFeedbackAndVideoSession(args: CardMachineActorArgs): boolean {
  return needsFeedback(args) && isVideoSession(args);
}

/**
 * Check if feedback is skipped and this is a video session.
 */
export function noFeedbackAndVideoSession(args: CardMachineActorArgs): boolean {
  return noFeedback(args) && isVideoSession(args);
}

/**
 * Check if answer was correct
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function answerCorrect({ context }: CardMachineActorArgs): boolean {
  return context.isCorrect === true;
}

/**
 * Check if answer was incorrect
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function answerIncorrect({ context }: CardMachineActorArgs): boolean {
  return context.isCorrect === false;
}

// =============================================================================
// TIMEOUT GUARDS
// =============================================================================

/**
 * Check if trial timed out
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function didTimeout({ context }: CardMachineActorArgs): boolean {
  return context.isTimeout === true;
}

/**
 * Check if trial did NOT timeout
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function didNotTimeout({ context }: CardMachineActorArgs): boolean {
  return context.isTimeout === false;
}

/**
 * Check if consecutive timeout threshold has been reached
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function hitTimeoutThreshold({ context }: CardMachineActorArgs): boolean {
  const threshold = THRESHOLDS.CONSECUTIVE_TIMEOUT_WARNING;
  return (context.consecutiveTimeouts ?? 0) >= threshold;
}

/**
 * Check if still waiting for SR transcription
 * (main timeout should pause)
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function waitingForTranscription({ context }: CardMachineActorArgs): boolean {
  return context.audio?.waitingForTranscription === true;
}

/**
 * Check if NOT waiting for transcription
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function notWaitingForTranscription(args: CardMachineActorArgs): boolean {
  return !waitingForTranscription(args);
}

// =============================================================================
// UNIT/SESSION GUARDS
// =============================================================================

/**
 * Check if the unit has finished
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function unitFinished({ context, event }: CardMachineActorArgs): boolean {
  // Check event payload if it's a CARD_SELECTED event
  if (event.type === 'CARD_SELECTED' && event.unitFinished) {
    return true;
  }
  // Otherwise rely on context flag (if available)
  return context.unitFinished === true;
}

/**
 * Check if the unit has NOT finished
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function unitNotFinished(args: CardMachineActorArgs): boolean {
  return !unitFinished(args);
}

export function canUsePreparedAdvance({ context }: CardMachineActorArgs): boolean {
  const engine = context.engine as { unitType?: string } | null | undefined;
  if (engine?.unitType !== 'model' && engine?.unitType !== 'schedule') {
    return false;
  }
  if (Session.get('isVideoSession') === true) {
    return false;
  }
  if (Session.get('resumeToQuestion') === true || Session.get('resumeInProgress') === true) {
    return false;
  }
  return true;
}

export function hasPreparedTrial({ context }: CardMachineActorArgs): boolean {
  return Boolean(context.preparedTrial && context.preparedTrial.currentDisplay);
}

// =============================================================================
// ERROR GUARDS
// =============================================================================

/**
 * Check if error is hard (should stop machine)
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isHardError({ event }: CardMachineActorArgs): boolean {
  if (event.type !== 'ERROR') return false;

  const source = typeof event.source === 'string' ? event.source : 'unknown';
  const severity = ERROR_SEVERITY_MAP[source as keyof typeof ERROR_SEVERITY_MAP] || ERROR_SEVERITY.HARD;
  return severity === ERROR_SEVERITY.HARD;
}

/**
 * Check if error is soft (should continue to next trial)
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isSoftError({ event }: CardMachineActorArgs): boolean {
  if (event.type !== 'ERROR') return false;

  const source = typeof event.source === 'string' ? event.source : 'unknown';
  const severity = ERROR_SEVERITY_MAP[source as keyof typeof ERROR_SEVERITY_MAP] || ERROR_SEVERITY.HARD;
  return severity === ERROR_SEVERITY.SOFT;
}

// =============================================================================
// VIDEO SESSION GUARDS
// =============================================================================

/**
 * Check if this is a video session
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function isVideoSession({ context }: CardMachineActorArgs): boolean {
  return context.deliverySettings?.isVideoSession === true || Session.get('isVideoSession') === true;
}

/**
 * Check if this is NOT a video session
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function isNotVideoSession(args: CardMachineActorArgs): boolean {
  return !isVideoSession(args);
}

/**
 * Check that a concrete configured video checkpoint can be accepted.
 */
export function canAcceptVideoCheckpoint(args: CardMachineActorArgs): boolean {
  if (!isVideoSession(args)) {
    return false;
  }

  const checkpointIndex = Number(args.event.checkpointIndex);
  const questionIndex = Number(args.event.questionIndex);
  if (!Number.isInteger(checkpointIndex) || checkpointIndex < 0 || !Number.isFinite(questionIndex)) {
    return false;
  }

  const checkpoints = Session.get('videoCheckpoints') as {
    times?: unknown[];
    questions?: unknown[];
  } | null | undefined;

  if (!Array.isArray(checkpoints?.times) || !Array.isArray(checkpoints?.questions)) {
    return false;
  }
  if (checkpointIndex >= checkpoints.times.length || checkpointIndex >= checkpoints.questions.length) {
    return false;
  }

  const checkpointTime = Number(checkpoints.times[checkpointIndex]);
  const configuredQuestionIndex = Number(checkpoints.questions[checkpointIndex]);
  return Number.isFinite(checkpointTime) &&
    Number.isFinite(configuredQuestionIndex) &&
    configuredQuestionIndex === questionIndex;
}

// =============================================================================
// INPUT VALIDATION GUARDS
// =============================================================================

/**
 * Check if user has provided an answer
 * @param {CardMachineContext} context
 * @param {CardMachineEvent} event
 * @returns {boolean}
 */
export function hasUserAnswer({ context }: CardMachineActorArgs): boolean {
  return typeof context.userAnswer === 'string' && context.userAnswer.trim().length > 0;
}

/**
 * Check if user has NOT provided an answer
 * @param {CardMachineActorArgs} args
 * @returns {boolean}
 */
export function noUserAnswer(args: CardMachineActorArgs): boolean {
  return !hasUserAnswer(args);
}

// =============================================================================
// PRESTIMULUS & AUDIO GUARDS
// =============================================================================

/**
 * Check if prestimulus display is configured.
 */
export function hasPrestimulus(): boolean {
  const prestimulusDisplay = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.prestimulusDisplay;
  return typeof prestimulusDisplay === 'string' && prestimulusDisplay.trim().length > 0;
}

/**
 * Check if question audio should gate input.
 */
export function hasQuestionAudio({ context }: CardMachineActorArgs): boolean {
  return !!context.currentDisplay?.audioSrc;
}






