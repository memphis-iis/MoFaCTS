/**
 * @fileoverview Card XState Machine (Phase 2)
 * Single source of truth for card trial flow
 *
 * Top-level states: idle → presenting → (study | feedback | transition) → idle or error
 *
 * Substates:
 * - presenting: loading → fadingIn → displaying → awaiting → exit
 * - transition: start → fadingOut → clearing → loop or finish
 *
 * Trial types supported: s (study), d (drill), t (test)
 * Other trial types trigger error state
 */

import { createMachine as xCreateMachine, assign as xAssign } from 'xstate';
import { Session } from 'meteor/session';
import { EVENTS, STATES, DEFAULT_UI_SETTINGS, SR_CONFIG } from './constants';
import * as guards from './guards';
import * as actions from './actions';
import { createServices } from './services';
import { CardStore } from '../../modules/cardStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Narrow exception: current XState v5 config/actor typings in this file are not modeled well enough yet, but we can still type the machine callback payloads locally.
const createMachine: any = xCreateMachine;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Same narrow exception as above for `assign`; this keeps runtime semantics unchanged while we remove the many broader `any` callback usages in the machine body.
const assign: any = xAssign;

type DeliveryParams = Record<string, unknown>;
type UiSettings = typeof DEFAULT_UI_SETTINGS & Record<string, unknown>;

interface CurrentDisplay extends Record<string, unknown> {
  text?: string;
  clozeText?: string;
  audioSrc?: string;
  videoSrc?: string;
  imgSrc?: string;
}

interface ButtonChoice extends Record<string, unknown> {
  verbalChoice?: string;
  buttonName?: unknown;
  buttonValue?: string;
  isImage?: boolean;
}

interface EngineIndices extends Record<string, unknown> {
  clusterIndex?: number;
  stimIndex?: number;
  whichStim?: number;
  probabilityEstimate?: unknown;
}

interface AudioState {
  ttsRequested: boolean;
  recordingLocked: boolean;
  waitingForTranscription: boolean;
  srAttempts: number;
  maxSrAttempts: number;
}

interface VideoSessionState {
  isActive: boolean;
  checkpoints: unknown[];
  currentCheckpointIndex: number;
  pendingQuestionIndex: number | null;
  ended: boolean;
}

interface TrialTimestamps {
  trialStart: number;
  trialEnd: number | undefined;
  firstKeypress: number | undefined;
  inputEnabled: number | undefined;
  feedbackStart: number | undefined;
  feedbackEnd: number | undefined;
}

interface CardMachineContext {
  currentDisplay: CurrentDisplay;
  questionDisplay: CurrentDisplay | undefined;
  currentAnswer: string;
  originalAnswer: string;
  userAnswer: string;
  feedbackMessage: string;
  isCorrect: boolean;
  isTimeout: boolean;
  feedbackTimeoutMs: number | undefined;
  reviewEntry: string;
  buttonTrial: boolean;
  buttonList: ButtonChoice[];
  testType: string;
  deliveryParams: DeliveryParams;
  uiSettings: UiSettings;
  setspec: Record<string, unknown> | undefined;
  audio: AudioState;
  srGrammarMatch: boolean | null;
  engine: unknown;
  engineIndices: EngineIndices | null;
  sessionId: string;
  unitId: string;
  tdfId: string;
  speechHintExclusionList: string;
  questionIndex: number;
  alternateDisplayIndex: number | null;
  source: string;
  wasReportedForRemoval: boolean;
  timeoutResetCounter: number;
  consecutiveTimeouts: number;
  errorMessage: string | undefined;
  unitFinished: boolean | undefined;
  preparedAdvanceMode: string;
  preparedTrial: PreparedAdvanceResult | null;
  incomingPreparationComplete: boolean;
  incomingReady: boolean;
  videoSession: VideoSessionState;
  timestamps: TrialTimestamps;
}

interface CardMachineEvent extends Record<string, unknown> {
  type: string;
  sessionId?: string;
  unitId?: string;
  tdfId?: string;
  source?: string;
  userAnswer?: string;
  timestamp?: number;
  checkpointIndex?: number;
  questionIndex?: number;
  unitFinished?: boolean;
}

interface CardSelectionResult extends Record<string, unknown> {
  currentDisplay?: CurrentDisplay;
  currentAnswer?: string;
  originalAnswer?: string;
  buttonTrial?: boolean;
  buttonList?: ButtonChoice[];
  testType?: string;
  deliveryParams?: Partial<DeliveryParams>;
  uiSettings?: Partial<UiSettings>;
  setspec?: Record<string, unknown>;
  engineIndices?: EngineIndices | null;
  engine?: unknown;
  unitFinished?: boolean;
  questionIndex?: number;
  preparedAdvanceMode?: string;
  speechHintExclusionList?: string;
}

interface UpdateEngineResult {
  unitFinished?: boolean;
}

interface PreparedAdvanceResult extends CardSelectionResult {
  preparedAdvanceMode?: string;
  preparedSelection?: Record<string, unknown> | null;
}

type MachineArgs = {
  context: CardMachineContext;
  event: CardMachineEvent;
};

type CardSelectionDoneArgs = {
  context: CardMachineContext;
  event: { output?: CardSelectionResult };
};

type UpdateEngineDoneArgs = {
  event: { output?: UpdateEngineResult };
};

type PreparedAdvanceDoneArgs = {
  context: CardMachineContext;
  event: { output?: PreparedAdvanceResult };
};

function toServiceInput({ context, event }: MachineArgs) {
  return { context, event };
}

function hasQuestionAudioFromContext(context: CardMachineContext): boolean {
  return guards.hasQuestionAudio({ context, event: { type: '__machine_internal__' } });
}

function isDrillOrTestTrial(context: CardMachineContext): boolean {
  const event = { type: '__machine_internal__' };
  return guards.isDrillTrial({ context, event }) || guards.isTestTrial({ context, event });
}

function getPreparedTrial(context: CardMachineContext): PreparedAdvanceResult | null {
  return context.preparedTrial || null;
}

function isFeedbackAdvanceReady(context: CardMachineContext): boolean {
  if (!context.incomingPreparationComplete) {
    return false;
  }
  if (context.unitFinished || !context.preparedTrial) {
    return true;
  }
  return context.incomingReady === true;
}

const storePreparedIncomingTrial = assign({
  preparedTrial: ({ event }: PreparedAdvanceDoneArgs) => (
    event.output?.unitFinished === true ||
    event.output?.preparedAdvanceMode === 'none' ||
    !event.output?.currentDisplay
  )
    ? null
    : event.output || null,
  engine: ({ context, event }: PreparedAdvanceDoneArgs) => event.output?.engine || context.engine,
  unitFinished: ({ event }: PreparedAdvanceDoneArgs) => event.output?.unitFinished === true,
  preparedAdvanceMode: ({ event }: PreparedAdvanceDoneArgs) => event.output?.unitFinished === true
    ? 'none'
    : event.output?.preparedAdvanceMode || 'seamless',
  incomingPreparationComplete: () => true,
  incomingReady: () => false,
});

const markIncomingPreparationFailed = assign({
  preparedTrial: () => null,
  incomingPreparationComplete: () => true,
  incomingReady: () => false,
  preparedAdvanceMode: () => 'none',
});

const markIncomingReady = assign({
  incomingReady: () => true,
});

function resolveSelectedQuestionIndex(context: CardMachineContext, event: CardSelectionDoneArgs['event']): number {
  const outputQuestionIndex = event.output?.questionIndex;
  const outputEngine = event.output?.engine as { unitType?: string } | undefined;
  const contextEngine = context.engine as { unitType?: string } | undefined;
  const unitType = String(outputEngine?.unitType || contextEngine?.unitType || '');

  if (unitType === 'schedule') {
    if (typeof outputQuestionIndex !== 'number' || !Number.isFinite(outputQuestionIndex)) {
      throw new Error('Schedule card selection must provide a live questionIndex');
    }
    return outputQuestionIndex;
  }

  return (typeof outputQuestionIndex === 'number' && Number.isFinite(outputQuestionIndex))
    ? outputQuestionIndex
    : (context.questionIndex || 1);
}

function resolvePreparedQuestionIndex(context: CardMachineContext): number {
  const preparedQuestionIndex = getPreparedTrial(context)?.questionIndex;
  const preparedEngine = getPreparedTrial(context)?.engine as { unitType?: string } | undefined;
  const contextEngine = context.engine as { unitType?: string } | undefined;
  const unitType = String(preparedEngine?.unitType || contextEngine?.unitType || '');

  if (unitType === 'schedule') {
    if (typeof preparedQuestionIndex !== 'number' || !Number.isFinite(preparedQuestionIndex)) {
      throw new Error('Prepared schedule transition must provide a live questionIndex');
    }
    return preparedQuestionIndex;
  }

  return Number(preparedQuestionIndex || context.questionIndex || 1);
}

// =============================================================================
// INITIAL CONTEXT
// =============================================================================

/**
 * Initial machine context
 * @type {CardMachineContext}
 */
const initialContext = {
  // Display & answer
  currentDisplay: {},
  currentAnswer: '',
  originalAnswer: '',
  userAnswer: '',
  feedbackMessage: '',
  isCorrect: false,
  isTimeout: false,
  feedbackTimeoutMs: undefined,
  reviewEntry: '',

  // Trial configuration
  buttonTrial: false,
  buttonList: [],
  testType: 'd', // Default to drill

  // Settings & params (defaults)
  deliveryParams: {},
  uiSettings: DEFAULT_UI_SETTINGS,
  setspec: {},

  // Audio & SR state
  audio: {
    ttsRequested: false,
    recordingLocked: false,
    waitingForTranscription: false,
    srAttempts: 0,
    maxSrAttempts: SR_CONFIG.MAX_ATTEMPTS,
  },
  srGrammarMatch: null,

  // Engine & session
  engine: null, // Unit engine instance (schedule/model/empty)
  engineIndices: null,
  sessionId: '',
  unitId: '',
  tdfId: '',
  speechHintExclusionList: '',

  // Trial metadata
  questionIndex: 1, // Current question index (1-based)
  alternateDisplayIndex: null, // For alternate displays
  source: 'keyboard', // How answer was provided: 'keyboard', 'button', 'timeout', 'SR', 'simulation'
  wasReportedForRemoval: false, // Was item flagged for removal
  timeoutResetCounter: 0,

  // Performance tracking
  consecutiveTimeouts: 0,
  errorMessage: undefined,
  preparedAdvanceMode: 'none',
  preparedTrial: null,
  incomingPreparationComplete: false,
  incomingReady: false,

  // Video session state
  videoSession: {
    isActive: false,
    checkpoints: [],
    currentCheckpointIndex: 0,
    pendingQuestionIndex: null,
    ended: false,
  },

  // Timestamps
  timestamps: {
    trialStart: 0,
    trialEnd: undefined,
    firstKeypress: undefined,
    inputEnabled: undefined,
    feedbackStart: undefined,
    feedbackEnd: undefined,
  },
};

// =============================================================================
// MACHINE DEFINITION
// =============================================================================

/**
 * Card state machine
 */
export const cardMachine = createMachine(
  {
    id: 'cardMachine',
    initial: STATES.IDLE,
    context: initialContext,
    states: {
      /**
       * IDLE STATE
       * Wait for START event
       */
      [STATES.IDLE]: {
        initial: 'ready',
        states: {
          /**
           * READY SUBSTATE
           * Ready to start fresh session
           */
          ready: {
            entry: ['logStateTransition'],
            on: {
              [EVENTS.START]: [
                {
                  target: '#cardMachine.videoWaiting',
                  guard: 'isVideoSession',
                  actions: [
                    'initializeSession',
                    assign({
                      videoSession: ({ context }: MachineArgs) => ({
                        ...context.videoSession,
                        isActive: true,
                        currentCheckpointIndex: 0,
                        pendingQuestionIndex: null,
                        ended: false,
                      }),
                    }),
                    'logStateTransition',
                  ],
                },
                {
                  target: `#cardMachine.${STATES.PRESENTING}`,
                  actions: ['initializeSession', 'logStateTransition'],
                },
              ],
            },
          },
        },
      },

      /**
       * PRESENTING STATE
       * Load and display trial card
       * Substates: loading → fadingIn → displaying → awaiting
       */
      [STATES.PRESENTING]: {
        initial: STATES.LOADING,
        states: {
          /**
           * LOADING SUBSTATE
           * Invoke selectCardService (Phase 6) to get next trial from unit engine
           */
          [STATES.LOADING]: {
            entry: ['setDisplayNotReady', 'setInputNotReady', 'logStateTransition'],
            invoke: {
              id: 'selectCardService',
              src: 'selectCardService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                // Pass current engine and session info
                engine: context.engine,
                sessionId: context.sessionId,
                unitId: context.unitId,
                tdfId: context.tdfId,
              }),
              onDone: [
                {
                  target: STATES.READY_PROMPT,
                  guard: 'isSupportedTrialType',
                  actions: [
                    assign({
                      // Load card data from service result
                      currentDisplay: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentDisplay || context.currentDisplay,
                      questionDisplay: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentDisplay || context.questionDisplay,
                      currentAnswer: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentAnswer || context.currentAnswer,
                      originalAnswer: ({ context, event }: CardSelectionDoneArgs) => event.output?.originalAnswer || context.originalAnswer,
                      buttonTrial: ({ context, event }: CardSelectionDoneArgs) => event.output?.buttonTrial ?? context.buttonTrial,
                      buttonList: ({ context, event }: CardSelectionDoneArgs) => event.output?.buttonList || context.buttonList || [],
                      testType: ({ context, event }: CardSelectionDoneArgs) => event.output?.testType || context.testType,
                      deliveryParams: ({ context, event }: CardSelectionDoneArgs) => ({
                        ...(context.deliveryParams || {}),
                        ...(event.output?.deliveryParams || {}),
                      }),
                      uiSettings: ({ context, event }: CardSelectionDoneArgs) => ({
                        ...DEFAULT_UI_SETTINGS,
                        ...(context.uiSettings || {}),
                        ...(event.output?.uiSettings || {}),
                      }),
                      setspec: ({ context, event }: CardSelectionDoneArgs) => event.output?.setspec || context.setspec,
                      engineIndices: ({ context, event }: CardSelectionDoneArgs) => event.output?.engineIndices || context.engineIndices,
                      engine: ({ context, event }: CardSelectionDoneArgs) => event.output?.engine || context.engine, // Update engine reference
                      unitFinished: ({ event }: CardSelectionDoneArgs) => event.output?.unitFinished || false,
                      questionIndex: ({ context, event }: CardSelectionDoneArgs) => resolveSelectedQuestionIndex(context, event),
                      preparedAdvanceMode: () => 'none',
                      preparedTrial: () => null,
                      incomingPreparationComplete: () => false,
                      incomingReady: () => false,
                      // Reset trial state
                      userAnswer: () => '',
                      feedbackMessage: () => '',
                      isCorrect: () => false,
                      isTimeout: () => false,
                      feedbackTimeoutMs: () => undefined,
                      srGrammarMatch: () => null,
                      reviewEntry: () => '',
                      source: () => 'keyboard', // Default source, updated by input method
                      timestamps: () => ({
                        trialStart: 0,
                        trialEnd: undefined,
                        firstKeypress: undefined,
                        inputEnabled: undefined,
                        feedbackStart: undefined,
                        feedbackEnd: undefined,
                      }),
                    }),
                    'syncUiSettings',
                    'syncCardStore',
                    'syncDeliveryParams',
                    'syncSessionIndices',
                    'syncCurrentAnswer',
                    'resetSrState',
                    'resetSrAttempts',
                    'clearErrorMessage',
                    'logStateTransition',
                  ],
                },
                {
                  target: '#cardMachine.error',
                  actions: [
                    assign({
                      errorMessage: ({ context }: MachineArgs) => `Unsupported trial type: ${context.testType}`,
                    }),
                    'logError',
                    'logStateTransition',
                  ],
                },
              ],
              onError: {
                target: '#cardMachine.error',
                actions: ['errorActions', 'logStateTransition'],
              },
            },
            // Guard for unsupported trial types
            always: [
              {
                target: '#cardMachine.error',
                guard: 'isUnsupportedTrialType',
                actions: [
                  assign({
                    errorMessage: ({ context }: MachineArgs) => `Unsupported trial type: ${context.testType}`,
                  }),
                  'logError',
                ],
              },
            ],
          },

          /**
           * FADING_IN SUBSTATE
           * Fade-in animation for trial display
           */
          [STATES.FADING_IN]: {
            entry: ['logStateTransition'],
            // TODO: Add video player service invocation for video sessions
            // invoke: {
            //   id: 'videoPlayerService',
            //   src: 'videoPlayerService',
            //   data: (context) => ({
            //     videoSrc: context.currentDisplay.videoSrc,
            //     checkpoints: context.deliveryParams.videoCheckpoints,
            //   }),
            //   cond: 'isVideoSession',
            // },
            after: {
              FADE_IN_DURATION: {
                target: STATES.DISPLAYING,
                actions: ['setDisplayReady', 'logStateTransition'],
              },
            },
          },

          /**
           * DISPLAYING SUBSTATE
           * Card is displayed, update experiment state, then branch to audio/study/awaiting.
           */
          [STATES.DISPLAYING]: {
            entry: ['startEarlyLockForCurrentTrial', 'logStateTransition'],
            invoke: {
              id: 'experimentStateService',
              src: 'experimentStateService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                stateUpdate: {
                  clusterIndex: context.engineIndices?.clusterIndex,
                  originalDisplay: context.currentDisplay?.text || context.currentDisplay?.clozeText || '',
                  originalAnswer: context.originalAnswer,
                  currentAnswer: context.currentAnswer,
                },
                source: 'cardMachine.displaying',
              }),
              onDone: [
                {
                  target: `#cardMachine.${STATES.STUDY}`,
                  guard: 'isStudyTrial',
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.AUDIO_GATE,
                  guard: ({ context }: MachineArgs) => hasQuestionAudioFromContext(context),
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.AWAITING,
                  guard: ({ context }: MachineArgs) => isDrillOrTestTrial(context),
                  actions: ['logStateTransition'],
                },
                {
                  target: '#cardMachine.error',
                  actions: [
                    assign({
                      errorMessage: ({ context }: MachineArgs) => `Unsupported trial type: ${context.testType}`,
                    }),
                    'logError',
                    'logStateTransition',
                  ],
                },
              ],
              onError: {
                target: STATES.READY_PROMPT,
                actions: ['logError', 'logStateTransition'],
              },
            },
          },

          /**
           * READY_PROMPT SUBSTATE
           * Optional delay before any display based on readyPromptStringDisplayTime.
           */
          [STATES.READY_PROMPT]: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'readyPromptDelayService',
              src: 'readyPromptDelayService',
              input: toServiceInput,
              onDone: [
                {
                  target: STATES.PRESTIMULUS,
                  guard: 'hasPrestimulus',
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.FADING_IN,
                  actions: ['logStateTransition'],
                },
              ],
              onError: {
                target: '#cardMachine.error',
                actions: ['errorActions', 'logStateTransition'],
              },
            },
          },

          /**
           * PRESTIMULUS SUBSTATE
           * Optional prestimulus display before showing the question.
           */
          [STATES.PRESTIMULUS]: {
            entry: ['setPrestimulusDisplay', 'logStateTransition'],
            invoke: {
              id: 'prestimulusDelayService',
              src: 'prestimulusDelayService',
              input: toServiceInput,
              onDone: {
                target: STATES.FADING_IN,
                actions: [
                  'restoreQuestionDisplay',
                  'logStateTransition',
                ],
              },
              onError: {
                target: '#cardMachine.error',
                actions: ['errorActions', 'logStateTransition'],
              },
            },
          },

          /**
           * AUDIO_GATE SUBSTATE
           * Delay and play question audio before enabling input.
           */
          [STATES.AUDIO_GATE]: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'questionAudioGateService',
              src: 'questionAudioGateService',
              input: toServiceInput,
              onDone: [
                {
                  target: `#cardMachine.${STATES.STUDY}`,
                  guard: 'isStudyTrial',
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.AWAITING,
                  actions: ['logStateTransition'],
                },
              ],
              onError: {
                target: '#cardMachine.error',
                actions: ['errorActions', 'logStateTransition'],
              },
            },
          },

          /**
           * AWAITING SUBSTATE
           * Waiting for user input (text or button)
           * Parallel state for SR if enabled
           */
          [STATES.AWAITING]: {
            entry: ['enableInput', 'markInputEnabled', 'focusInput', 'maybeSpeakQuestion', 'startRecording', 'logStateTransition'],
            exit: ['disableInput', 'stopRecording', 'logStateTransition'],
            type: 'parallel',
            states: {
              /**
               * INPUT MODE
               * Handles text entry or multiple choice
               */
              inputMode: {
                initial: 'ready',
                states: {
                  ready: {
                    on: {
                      [EVENTS.FIRST_KEYPRESS]: {
                        actions: ['markFirstKeypress', 'logStateTransition'],
                      },
                      [EVENTS.SUBMIT]: {
                        target: '#cardMachine.presenting.validating',
                        actions: ['captureAnswer', 'logStateTransition'],
                      },
                      [EVENTS.TIMEOUT]: {
                        target: '#cardMachine.presenting.validating',
                        actions: ['markTimeout', 'logStateTransition'],
                      },
                    },
                  },
                },
              },

              /**
               * SPEECH RECOGNITION (parallel)
               * Only active if SR is enabled for this trial
               */
              speechRecognition: {
                initial: 'checking',
                states: {
                  checking: {
                    always: [
                      {
                        target: 'active',
                        guard: 'srEnabled',
                      },
                      {
                        target: 'disabled',
                        guard: 'srDisabled',
                      },
                    ],
                  },
                  disabled: {
                    type: 'final',
                  },
                  active: {
                    invoke: {
                      id: 'speechRecognitionService',
                      src: 'speechRecognitionService',
                      input: ({ context, event }: MachineArgs) => ({
                        context,
                        event,
                        // Pass answer and context for phonetic matching
                        correctAnswer: context.currentAnswer,
                        deliveryParams: context.deliveryParams,
                        speechHintExclusionList: context.speechHintExclusionList,
                      }),
                    },
                    initial: 'ready',
                    states: {
                      ready: {
                        entry: ['logStateTransition'],
                        on: {
                          [EVENTS.VOICE_START]: {
                            target: 'recording',
                            actions: ['markFirstKeypress', 'logStateTransition'],
                          },
                          [EVENTS.TRANSCRIPTION_SUCCESS]: {
                            target: 'success',
                            actions: ['captureTranscription', 'logStateTransition'],
                          },
                          [EVENTS.TRANSCRIPTION_ERROR]: {
                            target: 'error',
                            actions: ['incrementSrAttempt', 'clearWaitingForTranscription', 'logError'],
                          },
                        },
                      },
                      recording: {
                        entry: ['logStateTransition'],
                        on: {
                          [EVENTS.VOICE_STOP]: {
                            target: 'processing',
                            actions: ['setWaitingForTranscription', 'logStateTransition'],
                          },
                          [EVENTS.TRANSCRIPTION_SUCCESS]: {
                            target: 'success',
                            actions: ['captureTranscription', 'logStateTransition'],
                          },
                          [EVENTS.TRANSCRIPTION_ERROR]: {
                            target: 'error',
                            actions: ['incrementSrAttempt', 'clearWaitingForTranscription', 'logError'],
                          },
                        },
                      },
                      processing: {
                        entry: ['logStateTransition'],
                        on: {
                          [EVENTS.TRANSCRIPTION_SUCCESS]: {
                            target: 'success',
                            actions: ['captureTranscription', 'logStateTransition'],
                          },
                          [EVENTS.TRANSCRIPTION_ERROR]: {
                            target: 'error',
                            actions: ['incrementSrAttempt', 'clearWaitingForTranscription', 'logError'],
                          },
                        },
                      },
                      success: {
                        type: 'final',
                        entry: [
                          'clearWaitingForTranscription',
                          'logStateTransition',
                        ],
                        // Auto-submit after successful transcription
                        always: {
                          target: '#cardMachine.presenting.validating',
                        },
                      },
                      error: {
                        entry: ['logStateTransition'],
                        always: [
                          {
                            target: 'ready',
                            guard: 'hasAttemptsRemaining',
                            actions: ['startRecording', 'logStateTransition'],
                          },
                          {
                            target: 'exhausted',
                            guard: 'attemptsExhausted',
                            actions: ['logStateTransition'],
                          },
                        ],
                      },
                      exhausted: {
                        type: 'final',
                        entry: ['forceSrFailureAnswer', 'logStateTransition'],
                        // SR exhausted - submit empty answer
                        always: {
                          target: '#cardMachine.presenting.validating',
                        },
                      },
                    },
                  },
                },
              },

              /**
               * MAIN TIMEOUT (parallel)
               * Runs concurrently with input/SR
               * Pauses if waiting for transcription
               */
              mainTimeout: {
                initial: 'running',
                on: {
                  [EVENTS.INPUT_ACTIVITY]: {
                    target: '.running',
                    actions: ['markFirstKeypress', 'markTimeoutReset'],
                  },
                  [EVENTS.TRANSCRIPTION_ERROR]: {
                    target: '.running',
                    actions: ['markTimeoutReset'],
                  },
                  [EVENTS.VOICE_START]: {
                    target: '.running',
                    actions: ['markTimeoutReset'],
                  },
                },
                states: {
                  running: {
                    invoke: {
                      id: 'mainCardTimeout',
                      src: 'mainCardTimeout',
                      input: toServiceInput,
                      onDone: {
                        target: '#cardMachine.presenting.validating',
                        actions: ['markTimeout', 'logStateTransition'],
                      },
                    },
                    always: [
                      {
                        target: 'paused',
                        guard: 'waitingForTranscription',
                      },
                    ],
                  },
                  paused: {
                    always: [
                      {
                        target: 'running',
                        guard: 'notWaitingForTranscription',
                      },
                    ],
                  },
                },
              },
            },
          },

          /**
           * VALIDATING SUBSTATE
           */
          validating: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'evaluateAnswerService',
              src: 'evaluateAnswerService',
              input: ({ context }: MachineArgs) => ({ context }),
              onDone: [
                {
                  target: `#cardMachine.${STATES.FEEDBACK}`,
                  guard: 'needsFeedbackAndVideoSession',
                  actions: ['applyValidationResult', 'notifyVideoAnswer', 'logStateTransition'],
                },
                {
                  target: `#cardMachine.${STATES.TRANSITION}`,
                  guard: 'noFeedbackAndVideoSession',
                  actions: ['applyValidationResult', 'notifyVideoAnswer', 'logStateTransition'],
                },
                {
                  target: `#cardMachine.${STATES.FEEDBACK}`,
                  guard: 'needsFeedback',
                  actions: ['applyValidationResult', 'logStateTransition'],
                },
                {
                  target: `#cardMachine.${STATES.TRANSITION}`,
                  guard: 'noFeedback',
                  actions: ['applyValidationResult', 'logStateTransition'],
                },
              ],
              onError: {
                target: '#cardMachine.error',
                actions: ['errorActions', 'logStateTransition'],
              },
            },
          },
        },
      },

      /**
       * STUDY STATE
       * Display answer immediately for study trials
       * Optionally play TTS for the answer
       */
      [STATES.STUDY]: {
        initial: 'preparing',
        invoke: {
          id: 'prepareIncomingDuringStudyService',
          src: 'prepareIncomingTrialService',
          input: ({ context, event }: MachineArgs) => ({
            context,
            event,
            engine: context.engine,
          }),
          onDone: {
            actions: [storePreparedIncomingTrial, 'logStateTransition'],
          },
          onError: {
            actions: [markIncomingPreparationFailed, 'logError', 'logStateTransition'],
          },
        },
        on: {
          [EVENTS.SKIP_STUDY]: {
            target: `#cardMachine.${STATES.TRANSITION}`,
            actions: ['logStateTransition'],
          },
          [EVENTS.INCOMING_READY]: {
            actions: [markIncomingReady, 'logStateTransition'],
          },
        },
        states: {
          /**
           * PREPARING SUBSTATE
           * Begin review timing immediately with presentation start.
           */
          preparing: {
            entry: ['displayAnswer', 'announceToScreenReader', 'logStateTransition'],
            on: {
              [EVENTS.TRIAL_REVEAL_STARTED]: [
                {
                  target: 'speaking',
                  guard: 'hasQuestionAudio',
                  actions: ['markTrialRevealStart', 'logStateTransition'],
                },
                {
                  target: 'speaking',
                  guard: 'ttsEnabled',
                  actions: ['markTrialRevealStart', 'logStateTransition'],
                },
                {
                  target: 'waiting',
                  actions: ['markTrialRevealStart', 'logStateTransition'],
                },
              ],
            },
          },
          /**
           * SPEAKING SUBSTATE
           * Play TTS for answer
           */
          speaking: {
            entry: ['lockRecording', 'logStateTransition'],
            exit: ['unlockRecording'],
            invoke: {
              id: 'ttsService',
              src: 'ttsService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                text: context.currentAnswer,
                questionText: context.currentDisplay?.clozeText || context.currentDisplay?.text || '',
                questionAudioSrc: context.currentDisplay?.audioSrc || '',
                delayAfterQuestionMs: 1000,
                display: context.currentDisplay,
                isQuestion: false, // This is the answer (study mode)
                deliveryParams: context.deliveryParams,
              }),
              onDone: {
                target: 'waiting',
                actions: ['logStateTransition'],
              },
              onError: {
                // TTS failed - continue anyway (soft error)
                target: 'waiting',
                actions: ['logError', 'logStateTransition'],
              },
            },
          },
          /**
           * WAITING SUBSTATE
           * Auto-advance after timeout
           */
          waiting: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'feedbackTimeout',
              src: 'feedbackTimeout',
              input: toServiceInput,
              onDone: {
                target: 'readyToFade',
                actions: ['logStateTransition'],
              },
            },
          },
          readyToFade: {
            entry: ['logStateTransition'],
            always: {
              guard: ({ context }: MachineArgs) => isFeedbackAdvanceReady(context),
              target: `#cardMachine.${STATES.TRANSITION}`,
              actions: ['logStateTransition'],
            },
          },
        },
      },

      /**
       * FEEDBACK STATE
       * Display feedback for drill trials
       * Optionally play TTS for feedback
       */
      [STATES.FEEDBACK]: {
        initial: 'preparing',
        invoke: {
          id: 'prepareIncomingDuringFeedbackService',
          src: 'prepareIncomingTrialService',
          input: ({ context, event }: MachineArgs) => ({
            context,
            event,
            engine: context.engine,
          }),
          onDone: {
            actions: [storePreparedIncomingTrial, 'logStateTransition'],
          },
          onError: {
            actions: [markIncomingPreparationFailed, 'logError', 'logStateTransition'],
          },
        },
        on: {
          [EVENTS.INCOMING_READY]: {
            actions: [markIncomingReady, 'logStateTransition'],
          },
        },
        states: {
          /**
           * PREPARING SUBSTATE
           * Display feedback and start review timing with presentation start.
           */
          preparing: {
            entry: ['displayFeedback', 'announceToScreenReader', 'logStateTransition'],
            always: [
              {
                target: 'forceCorrecting',
                guard: 'isForceCorrectTrialAndIncorrect',
                actions: ['markFeedbackStart', 'logStateTransition'],
              },
            ],
            on: {
              [EVENTS.REVIEW_REVEAL_STARTED]: [
                {
                  target: 'speaking',
                  guard: 'ttsEnabled',
                  actions: ['markFeedbackStart', 'logStateTransition'],
                },
                {
                  target: 'waiting',
                  guard: 'ttsDisabled',
                  actions: ['markFeedbackStart', 'logStateTransition'],
                },
              ],
            },
          },
          /**
           * FORCE_CORRECTING SUBSTATE
           * Require user to type the correct answer
           */
          forceCorrecting: {
            entry: ['clearUserAnswer', 'logStateTransition'],
            on: {
              [EVENTS.SUBMIT]: {
                target: 'waiting',
                guard: 'isCorrectForceCorrection',
                actions: ['setReviewEntry', 'logStateTransition'],
              },
            },
            after: {
              FORCE_CORRECT_TIMEOUT: {
                target: 'waiting',
                guard: 'isTimedPromptTrial',
              },
            },
          },
          /**
           * SPEAKING SUBSTATE
           * Play TTS for feedback
           */
          speaking: {
            entry: ['lockRecording', 'logStateTransition'],
            exit: ['unlockRecording'],
            invoke: {
              id: 'ttsService',
              src: 'ttsService',
              input: ({ context, event }: MachineArgs) => {
                const feedbackText = CardStore.getCardValue('feedbackTtsText');
                if (typeof feedbackText !== 'string' || feedbackText.trim() === '') {
                  throw new Error('[cardMachine] feedbackTtsText missing at feedback.speaking handoff');
                }

                return {
                  context,
                  event,
                  text: feedbackText,
                  isQuestion: false, // This is feedback
                  display: context.currentDisplay,
                  deliveryParams: context.deliveryParams,
                  feedbackType: context.isCorrect ? 'correct' : 'incorrect',
                };
              },
              onDone: {
                target: 'waiting',
                actions: ['logStateTransition'],
              },
              onError: {
                // TTS failed - continue anyway (soft error)
                target: 'waiting',
                actions: ['logError', 'logStateTransition'],
              },
            },
          },
          /**
           * WAITING SUBSTATE
           * Auto-advance after timeout
           */
          waiting: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'feedbackTimeout',
              src: 'feedbackTimeout',
              input: toServiceInput,
              onDone: {
                target: 'readyToFade',
                actions: ['logStateTransition'],
              },
            },
          },
          readyToFade: {
            entry: ['logStateTransition'],
            always: {
              guard: ({ context }: MachineArgs) => isFeedbackAdvanceReady(context),
              target: `#cardMachine.${STATES.TRANSITION}`,
              actions: ['logStateTransition'],
            },
          },
        },
      },

      /**
       * TRANSITION STATE
       * Clean up current trial and prepare for next
       * Substates: maybePrepareIncoming → logging → trackingPerformance → fadingOut → clearing/commit
       */
      [STATES.TRANSITION]: {
        initial: 'maybePrepareIncoming',
        states: {
          maybePrepareIncoming: {
            always: [
              {
                guard: ({ context }: MachineArgs) => context.incomingPreparationComplete === true,
                target: 'logging',
                actions: ['logStateTransition'],
              },
              {
                target: 'prepareIncoming',
                actions: ['logStateTransition'],
              },
            ],
          },
          /**
           * LOGGING SUBSTATE
           * Invoke history logging service to persist trial data
           */
          logging: {
            entry: ['markFeedbackEnd', 'markTrialEnd', 'logStateTransition'],
            invoke: {
              id: 'historyLoggingService',
              src: 'historyLoggingService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                // Pass engine reference via event data
                engine: context.engine,
              }),
              onDone: {
                target: 'updatingState',
                actions: ['logStateTransition'],
              },
              onError: {
                target: `#cardMachine.${STATES.ERROR}`,
                actions: ['logError', 'logStateTransition'],
              },
            },
          },
          updatingState: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'experimentStateService',
              src: 'experimentStateService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                stateUpdate: {
                  overallOutcomeHistory: Session.get('overallOutcomeHistory'),
                },
                source: 'cardMachine.transition.logging',
              }),
              onDone: {
                target: 'trackingPerformance',
                actions: ['logStateTransition'],
              },
              onError: {
                target: 'trackingPerformance',
                actions: ['logError', 'logStateTransition'],
              },
            },
          },
          /**
           * TRACKING_PERFORMANCE SUBSTATE
           * Track performance metrics (optional analytics)
           */
          trackingPerformance: {
            entry: ['trackPerformance', 'logStateTransition'],
            invoke: {
              id: 'updateEngineService',
              src: 'updateEngineService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                isCorrect: context.isCorrect,
                responseTime: context.timestamps.trialEnd
                  ? context.timestamps.trialEnd - context.timestamps.trialStart
                  : 0,
              }),
              onDone: [
                {
                  // MEDIUM FIX #1: Check if unit finished after engine update
                  // If so, trigger unit completion instead of continuing to next card
                  guard: ({ event }: UpdateEngineDoneArgs) => event.output?.unitFinished === true,
                  target: '#cardMachine.transition.fadingOut',
                  actions: [
                    'logStateTransition',
                    assign({
                      unitFinished: true,
                      preparedTrial: () => null,
                      incomingPreparationComplete: () => false,
                      incomingReady: () => false,
                    }),
                  ],
                },
                {
                  guard: 'isVideoSession',
                  target: '#cardMachine.videoWaiting',
                  actions: [
                    'incrementQuestionIndex',
                    assign({
                      preparedTrial: () => null,
                      incomingPreparationComplete: () => false,
                      incomingReady: () => false,
                      preparedAdvanceMode: () => 'none',
                      unitFinished: () => false,
                      videoSession: ({ context }: MachineArgs) => ({
                        ...context.videoSession,
                        isActive: true,
                        pendingQuestionIndex: null,
                        ended: false,
                      }),
                    }),
                    'clearFeedback',
                    'resetTimers',
                    'resumeVideoPlayback',
                    'logStateTransition',
                  ],
                },
                {
                  guard: 'hasPreparedTrial',
                  target: '#cardMachine.transition.fadingOut',
                  actions: ['logStateTransition'],
                },
                {
                  // Default: continue to next card
                  target: 'fadingOut',
                  actions: ['incrementQuestionIndex', 'logStateTransition'],
                },
              ],
              onError: {
                target: 'fadingOut',
                actions: ['logError', 'incrementQuestionIndex'],
              },
            },
          },
          prepareIncoming: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'prepareIncomingTrialService',
              src: 'prepareIncomingTrialService',
              input: ({ context, event }: MachineArgs) => ({
                context,
                event,
                engine: context.engine,
              }),
              onDone: [
                {
                  guard: ({ event }: PreparedAdvanceDoneArgs) => event.output?.unitFinished === true,
                  target: 'logging',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
                {
                  guard: ({ event }: PreparedAdvanceDoneArgs) => event.output?.preparedAdvanceMode === 'none',
                  target: 'logging',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
                {
                  guard: ({ event }: PreparedAdvanceDoneArgs) => event.output?.preparedAdvanceMode === 'fallback',
                  target: 'fallbackAdvance',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
                {
                  target: 'seamlessAdvance',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
              ],
              onError: {
                target: 'logging',
                actions: [
                  markIncomingPreparationFailed,
                  'logError',
                  'logStateTransition',
                ],
              },
            },
          },
          seamlessAdvance: {
            entry: ['logStateTransition'],
            on: {
              [EVENTS.INCOMING_READY]: {
                target: 'logging',
                actions: [markIncomingReady, 'logStateTransition'],
              },
            },
          },
          fallbackAdvance: {
            entry: ['logStateTransition'],
            on: {
              [EVENTS.INCOMING_READY]: {
                target: 'logging',
                actions: [markIncomingReady, 'logStateTransition'],
              },
            },
          },
          fadingOut: {
            entry: ['logStateTransition'],
            on: {
              [EVENTS.TRANSITION_COMPLETE]: [
                {
                  guard: 'hasPreparedTrial',
                  target: `#cardMachine.${STATES.PRESENTING}.${STATES.DISPLAYING}`,
                  actions: [
                    'commitPreparedTrialRuntime',
                    assign({
                      currentDisplay: ({ context }: MachineArgs) => getPreparedTrial(context)?.currentDisplay || context.currentDisplay,
                      questionDisplay: ({ context }: MachineArgs) => getPreparedTrial(context)?.currentDisplay || context.questionDisplay,
                      currentAnswer: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.currentAnswer || context.currentAnswer || ''),
                      originalAnswer: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.originalAnswer || context.originalAnswer || ''),
                      buttonTrial: ({ context }: MachineArgs) => getPreparedTrial(context)?.buttonTrial ?? context.buttonTrial,
                      buttonList: ({ context }: MachineArgs) => getPreparedTrial(context)?.buttonList || context.buttonList || [],
                      testType: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.testType || context.testType || 'd'),
                      deliveryParams: ({ context }: MachineArgs) => ({
                        ...(context.deliveryParams || {}),
                        ...(getPreparedTrial(context)?.deliveryParams || {}),
                      }),
                      uiSettings: ({ context }: MachineArgs) => ({
                        ...DEFAULT_UI_SETTINGS,
                        ...(context.uiSettings || {}),
                        ...(getPreparedTrial(context)?.uiSettings || {}),
                      }),
                      setspec: ({ context }: MachineArgs) => getPreparedTrial(context)?.setspec || context.setspec,
                      engineIndices: ({ context }: MachineArgs) => getPreparedTrial(context)?.engineIndices || context.engineIndices,
                      engine: ({ context }: MachineArgs) => getPreparedTrial(context)?.engine || context.engine,
                      unitFinished: () => false,
                      questionIndex: ({ context }: MachineArgs) => resolvePreparedQuestionIndex(context),
                      preparedAdvanceMode: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.preparedAdvanceMode || context.preparedAdvanceMode || 'none'),
                      preparedTrial: () => null,
                      incomingPreparationComplete: () => false,
                      incomingReady: () => false,
                      speechHintExclusionList: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.speechHintExclusionList || context.speechHintExclusionList || ''),
                      userAnswer: () => '',
                      feedbackMessage: () => '',
                      isCorrect: () => false,
                      isTimeout: () => false,
                      feedbackTimeoutMs: () => undefined,
                      srGrammarMatch: () => null,
                      reviewEntry: () => '',
                      source: () => 'keyboard',
                      timestamps: () => ({
                        trialStart: 0,
                        trialEnd: undefined,
                        firstKeypress: undefined,
                        inputEnabled: undefined,
                        feedbackStart: undefined,
                        feedbackEnd: undefined,
                      }),
                    }),
                    'resetSrState',
                    'resetSrAttempts',
                    'clearErrorMessage',
                    'syncUiSettings',
                    'setDisplayReady',
                    'setInputNotReady',
                    'clearFeedback',
                    'resetTimers',
                    'logStateTransition',
                  ],
                },
                {
                  target: 'clearing',
                  actions: ['logStateTransition'],
                },
              ],
            },
            after: {
              FADE_OUT_STALL_TIMEOUT: {
                target: `#cardMachine.${STATES.ERROR}`,
                actions: assign({
                  errorMessage: ({ context }: MachineArgs) => `transition.fadingOut stalled without TRANSITION_COMPLETE (preparedAdvanceMode=${String(context.preparedAdvanceMode || 'none')})`,
                }),
              },
            },
          },
          clearing: {
            entry: [
              'setDisplayNotReady',
              'setInputNotReady',
              'clearFeedback',
              'resetTimers',
              assign({
                preparedTrial: () => null,
                incomingPreparationComplete: () => false,
                incomingReady: () => false,
              }),
              'logStateTransition',
            ],
            always: [
              // Check if unit is finished
              {
                guard: 'unitFinished',
                actions: [
                  'handleUnitCompletion', // Navigate to next unit or completion page
                  'logStateTransition',
                ],
              },
              {
                guard: 'isVideoSession',
                target: '#cardMachine.videoWaiting',
                actions: [
                  assign({
                    videoSession: ({ context }: MachineArgs) => ({
                      ...context.videoSession,
                      isActive: true,
                      pendingQuestionIndex: null,
                      ended: false,
                    }),
                  }),
                  'resumeVideoPlayback',
                  'logStateTransition',
                ],
              },
              // Otherwise loop back to presenting
              {
                target: `#cardMachine.${STATES.PRESENTING}`,
                actions: ['logStateTransition'],
              },
            ],
          },
        },
      },

      /**
       * VIDEO_WAITING STATE
       * Video playback continues until the next checkpoint triggers a question.
       */
      videoWaiting: {
        entry: ['logStateTransition'],
        on: {
          [EVENTS.VIDEO_CHECKPOINT]: [
            {
              target: `#cardMachine.${STATES.PRESENTING}`,
              guard: 'canAcceptVideoCheckpoint',
              actions: [
                assign({
                  videoSession: ({ context, event }: MachineArgs) => ({
                    ...context.videoSession,
                    currentCheckpointIndex: Number(event.checkpointIndex),
                    pendingQuestionIndex: Number(event.questionIndex),
                    ended: false,
                  }),
              }),
              'logStateTransition',
            ],
            },
            {
              target: `#cardMachine.${STATES.ERROR}`,
              actions: [
                assign({
                  errorMessage: ({ event }: MachineArgs) => (
                    `[CardMachine] Invalid video checkpoint event: checkpointIndex=${String(event.checkpointIndex)}, questionIndex=${String(event.questionIndex)}`
                  ),
                }),
                'logError',
                'logStateTransition',
              ],
            },
          ],
          [EVENTS.VIDEO_ENDED]: {
            target: 'videoEnded',
              guard: 'isVideoSession',
              actions: [
                assign({
                  videoSession: ({ context }: MachineArgs) => ({
                    ...context.videoSession,
                    ended: true,
                  }),
              }),
              'logStateTransition',
            ],
          },
        },
      },

      /**
       * VIDEO_ENDED STATE
       * Video has finished; wait for UI to advance the unit.
       */
      videoEnded: {
        entry: ['logStateTransition'],
        on: {
          [EVENTS.VIDEO_CONTINUE]: {
            actions: ['handleUnitCompletion', 'logStateTransition'],
          },
        },
      },

      /**
       * ERROR STATE
       * Hard errors that stop the machine
       */
      [STATES.ERROR]: {
        entry: ['setErrorMessage', 'logError', 'disableInput', 'stopRecording', 'stopTTS'],
        type: 'final',
      },
    },

    // Global error handler
    on: {
      [EVENTS.TRIAL_REVEAL_STARTED]: {
        actions: ['markTrialRevealStart', 'logStateTransition'],
      },
      [EVENTS.ERROR]: [
        // Soft errors: log and continue to next trial
        {
          target: `#cardMachine.${STATES.TRANSITION}`,
          guard: 'isSoftError',
          actions: ['logError', 'logStateTransition'],
        },
        // Hard errors: stop machine
        {
          target: `#cardMachine.${STATES.ERROR}`,
          guard: 'isHardError',
          actions: ['errorActions', 'logStateTransition'],
        },
      ],
      [EVENTS.UNIT_FINISHED]: {
        target: `#cardMachine.${STATES.IDLE}`,
        actions: [
          assign({ errorMessage: () => 'Unit finished by external event' }),
          'logStateTransition',
        ],
      },
      [EVENTS.VIDEO_CHECKPOINT]: {
        target: `#cardMachine.${STATES.ERROR}`,
        actions: [
          assign({
            errorMessage: ({ event }: MachineArgs) => (
              `[CardMachine] VIDEO_CHECKPOINT received outside videoWaiting: checkpointIndex=${String(event.checkpointIndex)}, questionIndex=${String(event.questionIndex)}`
            ),
          }),
          'logError',
          'logStateTransition',
        ],
      },
    },
  },
  {
    // =============================================================================
    // MACHINE OPTIONS
    // =============================================================================

    guards: {
      // Trial type guards
      isStudyTrial: guards.isStudyTrial,
      isDrillTrial: guards.isDrillTrial,
      isTestTrial: guards.isTestTrial,
      isForceCorrectTrialAndIncorrect: guards.isForceCorrectTrialAndIncorrect,
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
      waitingForTranscription: guards.waitingForTranscription,
      notWaitingForTranscription: guards.notWaitingForTranscription,

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
      initializeSession: actions.initializeSession,
      loadCardData: actions.loadCardData,
      captureAnswer: actions.captureAnswer,
      setReviewEntry: actions.setReviewEntry,
      captureTranscription: actions.captureTranscription,
      markTimeout: actions.markTimeout,
      markTimeoutReset: actions.markTimeoutReset,
      resetTimeoutCounter: actions.resetTimeoutCounter,
      incrementSrAttempt: actions.incrementSrAttempt,
      resetSrState: actions.resetSrState,
      resetSrAttempts: actions.resetSrAttempts,
      lockRecording: actions.lockRecording,
      unlockRecording: actions.unlockRecording,
      setWaitingForTranscription: actions.setWaitingForTranscription,
      clearWaitingForTranscription: actions.clearWaitingForTranscription,
      markInputEnabled: actions.markInputEnabled,
      markFirstKeypress: actions.markFirstKeypress,
      markTrialRevealStart: actions.markTrialRevealStart,
      markFeedbackStart: actions.markFeedbackStart,
      markFeedbackEnd: actions.markFeedbackEnd,
      markTrialEnd: actions.markTrialEnd,
      setErrorMessage: actions.setErrorMessage,
      clearErrorMessage: actions.clearErrorMessage,
      validateAnswer: actions.validateAnswer,
      applyValidationResult: actions.applyValidationResult,
      clearUserAnswer: actions.clearUserAnswer,
      syncDeliveryParams: actions.syncDeliveryParams,
      syncUiSettings: actions.syncUiSettings,
      syncCardStore: actions.syncCardStore,
      syncSessionIndices: actions.syncSessionIndices,
      syncCurrentAnswer: actions.syncCurrentAnswer,
      incrementQuestionIndex: actions.incrementQuestionIndex,
      setPrestimulusDisplay: actions.setPrestimulusDisplay,
      restoreQuestionDisplay: actions.restoreQuestionDisplay,
      forceSrFailureAnswer: actions.forceSrFailureAnswer,

      // Side effect actions
      logStateTransition: actions.logStateTransition,
      logError: actions.logError,
      logHistory: actions.logHistory,
      focusInput: actions.focusInput,
      disableInput: actions.disableInput,
      enableInput: actions.enableInput,
      clearFeedback: actions.clearFeedback,
      announceToScreenReader: actions.announceToScreenReader,
      trackPerformance: actions.trackPerformance,
      updateScrollHistory: actions.updateScrollHistory,
      handleUnitCompletion: actions.handleUnitCompletion,
      displayAnswer: actions.displayAnswer,
      displayFeedback: actions.displayFeedback,
      setDisplayReady: actions.setDisplayReady,
      setDisplayNotReady: actions.setDisplayNotReady,
      setInputNotReady: actions.setInputNotReady,
      startRecording: actions.startRecording,
      maybeSpeakQuestion: actions.maybeSpeakQuestion,
      startEarlyLockForCurrentTrial: actions.startEarlyLockForCurrentTrial,
      commitPreparedTrialRuntime: actions.commitPreparedTrialRuntime,
      stopRecording: actions.stopRecording,
      playTTS: actions.playTTS,
      stopTTS: actions.stopTTS,
      notifyVideoAnswer: actions.notifyVideoAnswer,
      resumeVideoPlayback: actions.resumeVideoPlayback,
      resetTimers: actions.resetTimers,

      // Composite actions
      errorActions: actions.errorActions,
    },

    actors: createServices(),

    delays: {
      FADE_IN_DURATION: () => getCssDuration('--transition-smooth'),
      FADE_OUT_DURATION: () => getCssDuration('--transition-smooth'),
      FADE_OUT_STALL_TIMEOUT: () => getCssDuration('--transition-smooth') + 1000,
      FORCE_CORRECT_TIMEOUT: ({ context }: MachineArgs) => {
        const timeout = parseInt(String(context.deliveryParams?.forcecorrecttimeout ?? ''), 10);
        return Number.isFinite(timeout) ? timeout : 2000; // Default to 2s
      },
    },
  }
);

/**
 * @param {string} varName
 * @returns {number}
 */
function getCssDuration(varName: string): number {
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







