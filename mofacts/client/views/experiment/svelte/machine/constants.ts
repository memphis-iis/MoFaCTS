import { UI_SETTINGS_RUNTIME_DEFAULTS } from '../../../../../common/fieldRegistry.ts';

/**
 * @fileoverview Constants for card state machine
 * Timing values, trial types, limits, and configuration defaults
 */

// =============================================================================
// TRIAL TYPE CODES
// =============================================================================

/**
 * Trial type codes (single character)
 * These map to TDF testType values
 */
export const TRIAL_TYPES = {
  STUDY: 's',    // Study trial: display answer immediately
  DRILL: 'd',    // Drill trial: require input, show feedback
  TEST: 't',     // Test trial: require input, no feedback
  FORCE_CORRECT: 'm', // Force correction: require typing correct answer
  TIMED_PROMPT: 'n',  // Timed prompt: require input within time limit
};

/**
 * Set of supported trial types
 * Any other trial type should trigger error state
 */
export const SUPPORTED_TRIAL_TYPES = new Set([
  TRIAL_TYPES.STUDY,
  TRIAL_TYPES.DRILL,
  TRIAL_TYPES.TEST,
  TRIAL_TYPES.FORCE_CORRECT,
  TRIAL_TYPES.TIMED_PROMPT,
]);

// =============================================================================
// TIMING CONSTANTS (milliseconds)
// =============================================================================

/**
 * Default timing values
 * These are fallbacks if not specified in deliveryParams
 */
export const DEFAULT_TIMINGS = {
  /** Default main trial timeout (30 seconds) */
  MAIN_TIMEOUT: 30000,

  /** Default feedback display timeout (2 seconds) */
  FEEDBACK_TIMEOUT: 2000,

  /** Default fade-in duration (300ms) */
  FADE_IN_DURATION: 300,

  /** Default fade-out duration (200ms) */
  FADE_OUT_DURATION: 200,

  /** Debounce delay for input validation (300ms) */
  INPUT_DEBOUNCE: 300,

  /** Delay before enabling input after display (100ms) */
  INPUT_ENABLE_DELAY: 100,
};

// =============================================================================
// SPEECH RECOGNITION CONSTANTS
// =============================================================================

/**
 * Speech recognition configuration
 */
export const SR_CONFIG = {
  /** Maximum SR attempts per trial */
  MAX_ATTEMPTS: 3,

  /** Delay between SR attempts (ms) - 0 for immediate */
  RETRY_DELAY: 0,

  /** SR timeout per attempt (ms) - Google Cloud default */
  ATTEMPT_TIMEOUT: 10000,

  /** Minimum confidence threshold for accepting transcript */
  MIN_CONFIDENCE: 0.5,

  /** Voice activity detection threshold (0-1) */
  VAD_THRESHOLD: 0.5,

  /** Time to wait for voice activity before timeout (ms) */
  VOICE_ACTIVITY_TIMEOUT: 15000,
};

// =============================================================================
// TIMEOUT & PERFORMANCE THRESHOLDS
// =============================================================================

/**
 * Performance and error thresholds
 */
export const THRESHOLDS = {
  /** Default consecutive timeouts before warning */
  CONSECUTIVE_TIMEOUT_WARNING: 3,

  /** Maximum consecutive timeouts before intervention */
  CONSECUTIVE_TIMEOUT_MAX: 5,
};

// =============================================================================
// ERROR SEVERITY LEVELS
// =============================================================================

/**
 * Error severity determines machine behavior
 * - SOFT: Log and continue (transition to next trial)
 * - HARD: Stop machine in error state
 */
export const ERROR_SEVERITY = {
  SOFT: 'soft',    // Continue to next trial
  HARD: 'hard',    // Stop in error state
};

/**
 * Error source to severity mapping
 * Determines whether errors cause hard stop or soft continue
 */
export const ERROR_SEVERITY_MAP = {
  // Soft errors - continue to next trial
  'ttsPlayback': ERROR_SEVERITY.SOFT,
  'speechRecognition': ERROR_SEVERITY.SOFT,
  'prefetchImage': ERROR_SEVERITY.SOFT,
  'videoPlayer': ERROR_SEVERITY.SOFT,

  // Hard errors - stop machine
  'selectNextCard': ERROR_SEVERITY.HARD,
  'logHistory': ERROR_SEVERITY.HARD,
  'unknown': ERROR_SEVERITY.HARD,
};

// =============================================================================
// STATE MACHINE EVENT NAMES
// =============================================================================

/**
 * Event type constants for state machine
 */
export const EVENTS = {
  // Lifecycle events
  START: 'START',
  CARD_SELECTED: 'CARD_SELECTED',
  ENABLE_INPUT: 'ENABLE_INPUT',
  SUBMIT: 'SUBMIT',
  TIMEOUT: 'TIMEOUT',
  FEEDBACK_TIMEOUT: 'FEEDBACK_TIMEOUT',
  UNIT_FINISHED: 'UNIT_FINISHED',
  INCOMING_READY: 'INCOMING_READY',
  TRANSITION_COMPLETE: 'TRANSITION_COMPLETE',
  FIRST_KEYPRESS: 'FIRST_KEYPRESS',
  INPUT_ACTIVITY: 'INPUT_ACTIVITY',
  SKIP_STUDY: 'SKIP_STUDY',
  TRIAL_REVEAL_STARTED: 'TRIAL_REVEAL_STARTED',
  REVIEW_REVEAL_STARTED: 'REVIEW_REVEAL_STARTED',

  // Speech recognition events
  ENABLE_SR: 'ENABLE_SR',
  VOICE_START: 'VOICE_START',
  VOICE_STOP: 'VOICE_STOP',
  TRANSCRIPTION_SUCCESS: 'TRANSCRIPTION_SUCCESS',
  TRANSCRIPTION_ERROR: 'TRANSCRIPTION_ERROR',
  MAX_ATTEMPTS_REACHED: 'MAX_ATTEMPTS_REACHED',

  // TTS events
  TTS_COMPLETE: 'TTS_COMPLETE',

  // Video session events
  VIDEO_CHECKPOINT: 'VIDEO_CHECKPOINT',   // Video reached a question checkpoint
  VIDEO_ENDED: 'VIDEO_ENDED',             // Video playback ended
  RESUME_VIDEO: 'RESUME_VIDEO',           // Resume video after answering question
  VIDEO_CONTINUE: 'VIDEO_CONTINUE',       // Continue after video end

  // Error events
  ERROR: 'ERROR',
};

// =============================================================================
// STATE NAMES
// =============================================================================

/**
 * State name constants for reference
 */
export const STATES = {
  IDLE: 'idle',
  PRESENTING: 'presenting',
  LOADING: 'loading',
  FADING_IN: 'fadingIn',
  DISPLAYING: 'displaying',
  READY_PROMPT: 'readyPrompt',
  PRESTIMULUS: 'prestimulus',
  AUDIO_GATE: 'audioGate',
  AWAITING: 'awaiting',
  STUDY: 'study',
  FEEDBACK: 'feedback',
  TRANSITION: 'transition',
  ERROR: 'error',
};

// =============================================================================
// LOGGING PREFIXES
// =============================================================================

/**
 * Console logging prefixes for debugging
 */
export const LOG_PREFIXES = {
  STATE_MACHINE: '[SM]',
  SPEECH_RECOGNITION: '[SR]',
  TTS: '[TTS]',
  TIMEOUT: '[TIMEOUT]',
  ERROR: '[ERROR]',
  PERFORMANCE: '[PERF]',
};

// =============================================================================
// DEFAULT UI SETTINGS
// =============================================================================

/**
 * Default UI settings
 * Used when TDF doesn't specify values
 */
export const DEFAULT_UI_SETTINGS = UI_SETTINGS_RUNTIME_DEFAULTS;

