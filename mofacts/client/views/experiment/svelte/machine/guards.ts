/**
 * @fileoverview Guard functions for card state machine
 * Guards are boolean predicates that determine whether transitions should occur
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { TRIAL_TYPES, SUPPORTED_TRIAL_TYPES, THRESHOLDS, ERROR_SEVERITY_MAP, ERROR_SEVERITY } from './constants';
import { getFeedbackTimeoutMs } from '../utils/timeoutUtils';
import { evaluateSrAvailability } from '../../../../lib/audioAvailability';
import { getAudioPromptMode } from '../../../../lib/state/audioState';
import { selfHostedH5PTrialDisplayOwnsInteraction } from '../services/h5pTrialDisplay';
import { resolveSessionSurfaceState } from '../services/sessionSurfaceMode';
import {
  getIsVideoSessionFlag,
  getVideoCheckpoints,
  isResumeInProgress,
  isResumeRequested,
} from '../services/cardRuntimeState';

type FeedbackTimeoutContext = Parameters<typeof getFeedbackTimeoutMs>[0];
type PreparedAdvanceMode = 'none' | 'seamless' | 'direct';

type ContentRuntimeMachineActorArgs = {
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
    preparedAdvanceMode?: PreparedAdvanceMode | undefined;
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
    timestamps?: {
      trialStart?: number | undefined;
    };
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

function resolveFeedbackTimeoutMs({ context, event }: ContentRuntimeMachineActorArgs): number {
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
};

type MeteorUserLike = {
  audioSettings?: MeteorAudioSettings;
};

// =============================================================================
// TRIAL TYPE GUARDS
// =============================================================================

/**
 * Check if current trial is a study trial
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isStudyTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.STUDY;
}

/**
 * Check if current trial is a drill trial
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isDrillTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return [TRIAL_TYPES.DRILL, TRIAL_TYPES.FORCE_CORRECT, TRIAL_TYPES.TIMED_PROMPT].includes(context.testType || '');
}

/**
 * Check if current trial is a test trial
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isTestTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.TEST || context.testType === TRIAL_TYPES.H5P;
}

/**
 * Check if current trial type is supported
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isSupportedTrialType({ context }: ContentRuntimeMachineActorArgs): boolean {
  return SUPPORTED_TRIAL_TYPES.has(context.testType || '');
}

/**
 * Check if current trial type is unsupported (should error)
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function isUnsupportedTrialType(args: ContentRuntimeMachineActorArgs): boolean {
  return !isSupportedTrialType(args);
}

/**
 * Check if current trial is a force correct trial and user was incorrect
 */
export function isForceCorrectTrialAndIncorrect({ context }: ContentRuntimeMachineActorArgs): boolean {
  const isForceCorrect = context.testType === TRIAL_TYPES.FORCE_CORRECT || 
                         context.testType === TRIAL_TYPES.TIMED_PROMPT ||
                         context.deliverySettings?.forceCorrection === true ||
                         context.deliverySettings?.forceCorrection === 'true';
  return isForceCorrect && !context.isCorrect;
}

export function needsForceCorrectPrompt(args: ContentRuntimeMachineActorArgs): boolean {
  return isForceCorrectTrialAndIncorrect(args) && String(args.context.reviewEntry || '').trim() === '';
}

/**
 * Check if current trial is a timed prompt trial
 */
export function isTimedPromptTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.testType === TRIAL_TYPES.TIMED_PROMPT;
}

/**
 * Check if force correction input matches correct answer
 */
export function isCorrectForceCorrection({ context, event }: ContentRuntimeMachineActorArgs): boolean {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isButtonTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.buttonTrial === true;
}

/**
 * Check if current trial is a text entry trial
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isTextTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.buttonTrial === false;
}

// =============================================================================
// SPEECH RECOGNITION GUARDS
// =============================================================================

/**
 * Check if speech recognition should be enabled for this trial
 * SR is only enabled for text entry trials when explicitly requested
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function srEnabled(args: ContentRuntimeMachineActorArgs): boolean {
  const availability = evaluateSrAvailability({
    user: Meteor.user() as MeteorUserLike | null,
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
    serverSpeechConfigured: Session.get('speechAPIKeyConfigured'),
    requireTextTrial: true,
    isTextTrial: isTextTrial(args),
  });
  return availability.status === 'available';
}

/**
 * Check if SR is disabled
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function srDisabled(args: ContentRuntimeMachineActorArgs): boolean {
  return !srEnabled(args);
}

/**
 * Check if recording is currently locked (e.g., during TTS playback)
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function recordingLocked({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.audio?.recordingLocked === true;
}

/**
 * Check if recording is unlocked
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function recordingUnlocked(args: ContentRuntimeMachineActorArgs): boolean {
  return !recordingLocked(args);
}

/**
 * Check if SR has attempts remaining
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function hasAttemptsRemaining({ context }: ContentRuntimeMachineActorArgs): boolean {
  return (context.audio?.srAttempts ?? 0) < (context.audio?.maxSrAttempts ?? 0);
}

/**
 * Check if SR has exhausted all attempts
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function attemptsExhausted(args: ContentRuntimeMachineActorArgs): boolean {
  return !hasAttemptsRemaining(args);
}

// =============================================================================
// TTS GUARDS
// =============================================================================

/**
 * Check if TTS is enabled for this trial
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function ttsEnabled(_args: ContentRuntimeMachineActorArgs): boolean {
  const audioPromptMode = getAudioPromptMode();
  const questionTtsEnabled = !!audioPromptMode && audioPromptMode !== 'silent';
  const feedbackTtsEnabled = Session.get('enableAudioPromptAndFeedback') === true;

  return questionTtsEnabled || feedbackTtsEnabled;
}

/**
 * Check if TTS is disabled
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function ttsDisabled(args: ContentRuntimeMachineActorArgs): boolean {
  return !ttsEnabled(args);
}

function feedbackContentReady({ context }: ContentRuntimeMachineActorArgs): boolean {
  if (context.feedbackSuppressed === true) {
    return true;
  }
  return typeof context.feedbackText === 'string' && context.feedbackText.trim() !== '';
}

export function feedbackReadyForTts(args: ContentRuntimeMachineActorArgs): boolean {
  return args.context.feedbackRevealStarted === true &&
    args.context.feedbackSuppressed !== true &&
    feedbackContentReady(args) &&
    ttsEnabled(args);
}

export function feedbackReadyWithoutTts(args: ContentRuntimeMachineActorArgs): boolean {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function needsFeedback(args: ContentRuntimeMachineActorArgs): boolean {
  if (selfHostedH5PTrialDisplayOwnsInteraction(args.context.currentDisplay)) {
    return false;
  }

  const feedbackTimeoutMs = resolveFeedbackTimeoutMs(args);
  return (
    isDrillTrial(args) &&
    feedbackTimeoutMs > 0
  );
}

/**
 * Check if feedback should NOT be displayed
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function noFeedback(args: ContentRuntimeMachineActorArgs): boolean {
  return !needsFeedback(args);
}

/**
 * Check if feedback should be displayed and this is a video session.
 */
export function needsFeedbackAndVideoSession(args: ContentRuntimeMachineActorArgs): boolean {
  return needsFeedback(args) && isVideoSession(args);
}

/**
 * Check if feedback is skipped and this is a video session.
 */
export function noFeedbackAndVideoSession(args: ContentRuntimeMachineActorArgs): boolean {
  return noFeedback(args) && isVideoSession(args);
}

/**
 * Check if answer was correct
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function answerCorrect({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.isCorrect === true;
}

/**
 * Check if answer was incorrect
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function answerIncorrect({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.isCorrect === false;
}

// =============================================================================
// TIMEOUT GUARDS
// =============================================================================

/**
 * Check if trial timed out
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function didTimeout({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.isTimeout === true;
}

/**
 * Check if trial did NOT timeout
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function didNotTimeout({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.isTimeout === false;
}

export function trialRevealStarted({ context }: ContentRuntimeMachineActorArgs): boolean {
  return Number(context.timestamps?.trialStart) > 0;
}

/**
 * Check if consecutive timeout threshold has been reached
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function hitTimeoutThreshold({ context }: ContentRuntimeMachineActorArgs): boolean {
  const threshold = THRESHOLDS.CONSECUTIVE_TIMEOUT_WARNING;
  return (context.consecutiveTimeouts ?? 0) >= threshold;
}

/**
 * Check if still waiting for SR transcription
 * (main timeout should pause)
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function waitingForTranscription({ context }: ContentRuntimeMachineActorArgs): boolean {
  return context.audio?.waitingForTranscription === true;
}

/**
 * Check if NOT waiting for transcription
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function notWaitingForTranscription(args: ContentRuntimeMachineActorArgs): boolean {
  return !waitingForTranscription(args);
}

export function trialDisplaySuppressesStandardTimeout({ context }: ContentRuntimeMachineActorArgs): boolean {
  if (selfHostedH5PTrialDisplayOwnsInteraction(context.currentDisplay)) {
    return true;
  }
  const display = context.currentDisplay;
  return Boolean(
    display &&
    typeof display === 'object' &&
    !Array.isArray(display) &&
    Array.isArray((display as Record<string, unknown>).nodes) &&
    Array.isArray((display as Record<string, unknown>).productionRules),
  );
}

// =============================================================================
// UNIT/SESSION GUARDS
// =============================================================================

/**
 * Check if the unit has finished
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function unitFinished({ context, event }: ContentRuntimeMachineActorArgs): boolean {
  // Check event payload if it's a CARD_SELECTED event
  if (event.type === 'CARD_SELECTED' && event.unitFinished) {
    return true;
  }
  // Otherwise rely on context flag (if available)
  return context.unitFinished === true;
}

/**
 * Check if the unit has NOT finished
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function unitNotFinished(args: ContentRuntimeMachineActorArgs): boolean {
  return !unitFinished(args);
}

type PreparedAdvanceEngineLike = {
  unitType?: unknown;
};

export function canEngineUsePreparedAdvance(engine: PreparedAdvanceEngineLike | null | undefined): boolean {
  return engine?.unitType === 'model' || engine?.unitType === 'schedule';
}

export function canUsePreparedAdvance(args: ContentRuntimeMachineActorArgs): boolean {
  const { context } = args;
  const engine = context.engine as { unitType?: string } | null | undefined;
  if (!canEngineUsePreparedAdvance(engine)) {
    return false;
  }
  if (isVideoSession(args)) {
    return false;
  }
  if (isResumeRequested() || isResumeInProgress()) {
    return false;
  }
  return true;
}

export function hasPreparedTrial({ context }: ContentRuntimeMachineActorArgs): boolean {
  return Boolean(context.preparedTrial && context.preparedTrial.currentDisplay);
}

// =============================================================================
// ERROR GUARDS
// =============================================================================

/**
 * Check if error is hard (should stop machine)
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isHardError({ event }: ContentRuntimeMachineActorArgs): boolean {
  if (event.type !== 'ERROR') return false;

  const source = typeof event.source === 'string' ? event.source : 'unknown';
  const severity = ERROR_SEVERITY_MAP[source as keyof typeof ERROR_SEVERITY_MAP] || ERROR_SEVERITY.HARD;
  return severity === ERROR_SEVERITY.HARD;
}

/**
 * Check if error is soft (should continue to next trial)
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isSoftError({ event }: ContentRuntimeMachineActorArgs): boolean {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function isVideoSession({ context }: ContentRuntimeMachineActorArgs): boolean {
  return resolveSessionSurfaceState({
    deliverySettings: context.deliverySettings,
    sessionIsVideoSession: getIsVideoSessionFlag(),
  }).isVideoSession;
}

/**
 * Check if this is NOT a video session
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function isNotVideoSession(args: ContentRuntimeMachineActorArgs): boolean {
  return !isVideoSession(args);
}

/**
 * Check that a concrete configured video checkpoint can be accepted.
 */
export function canAcceptVideoCheckpoint(args: ContentRuntimeMachineActorArgs): boolean {
  if (!isVideoSession(args)) {
    return false;
  }

  const checkpointIndex = Number(args.event.checkpointIndex);
  const questionIndex = Number(args.event.questionIndex);
  if (!Number.isInteger(checkpointIndex) || checkpointIndex < 0 || !Number.isFinite(questionIndex)) {
    return false;
  }

  const checkpoints = getVideoCheckpoints() as {
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
 * @param {ContentRuntimeMachineContext} context
 * @param {ContentRuntimeMachineEvent} event
 * @returns {boolean}
 */
export function hasUserAnswer({ context }: ContentRuntimeMachineActorArgs): boolean {
  return typeof context.userAnswer === 'string' && context.userAnswer.trim().length > 0;
}

/**
 * Check if user has NOT provided an answer
 * @param {ContentRuntimeMachineActorArgs} args
 * @returns {boolean}
 */
export function noUserAnswer(args: ContentRuntimeMachineActorArgs): boolean {
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
export function hasQuestionAudio({ context }: ContentRuntimeMachineActorArgs): boolean {
  return !!context.currentDisplay?.audioSrc;
}






