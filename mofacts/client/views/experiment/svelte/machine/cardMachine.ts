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

import { createMachine as xCreateMachine } from 'xstate';
import { EVENTS, STATES } from './constants';
import * as guards from './guards';
import * as cardMachineActions from './cardMachineActions';
import { createServices } from './services';
import {
  initialContext,
  type MachineArgs,
} from './cardMachineTypes';
import {
  markIncomingPreparationFailed,
  markIncomingReady,
  storePreparedIncomingTrial,
} from './preparedAdvanceMachine';
import {
  clearIncomingPreparationState,
  commitPreparedTrialToActiveContext,
  loadSelectedTrialIntoActiveContext,
  markUnitFinishedAfterEngineUpdate,
} from './trialContextMachine';
import {
  acceptVideoCheckpoint,
  activateVideoSessionAtStart,
  markVideoEnded,
  resumeVideoSessionAfterClearing,
  resumeVideoSessionAfterQuestion,
} from './videoSessionMachine';
import {
  markFeedbackRevealStarted,
  resetFeedbackRevealState,
  storeFeedbackContent,
} from './feedbackContextMachine';
import {
  setExternalUnitFinishedMessage,
  setFadeOutStallError,
  setInvalidVideoCheckpointError,
  setUnexpectedVideoCheckpointError,
  setUnsupportedTrialTypeError,
} from './machineErrorContext';
import {
  toDisplayedTrialStateInput,
  toEvaluateAnswerInput,
  toFeedbackTtsInput,
  toHistoryLoggingInput,
  toOutcomeHistoryStateInput,
  toPrepareIncomingTrialInput,
  toSelectCardInput,
  toServiceInput,
  toSpeechRecognitionInput,
  toStudyAnswerTtsInput,
  toUpdateEngineInput,
} from './cardMachineServiceInputs';
import {
  activeTrialIsDrillOrTest,
  engineUpdateFinishedUnit,
  feedbackAdvanceIsReady,
  incomingPreparationAlreadyComplete,
  preparedResultFinishedUnit,
  preparedResultHasNoAdvance,
  preparedResultUsesDirectAdvance,
  questionAudioIsAvailable,
} from './cardMachineTransitionGuards';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Narrow exception: current XState v5 config/actor typings in this file are not modeled well enough yet, but we can still type the machine callback payloads locally.
const createMachine: any = xCreateMachine;

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
                    activateVideoSessionAtStart,
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
              input: toSelectCardInput,
              onDone: [
                {
                  target: STATES.READY_PROMPT,
                  guard: 'isSupportedTrialType',
                  actions: [
                    loadSelectedTrialIntoActiveContext,
                    'syncDeliverySettings',
                    'syncCardStore',
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
                    setUnsupportedTrialTypeError,
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
                  setUnsupportedTrialTypeError,
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
              input: toDisplayedTrialStateInput,
              onDone: [
                {
                  target: `#cardMachine.${STATES.STUDY}`,
                  guard: 'isStudyTrial',
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.AUDIO_GATE,
                  guard: questionAudioIsAvailable,
                  actions: ['logStateTransition'],
                },
                {
                  target: STATES.AWAITING,
                  guard: activeTrialIsDrillOrTest,
                  actions: ['logStateTransition'],
                },
                {
                  target: '#cardMachine.error',
                  actions: [
                    setUnsupportedTrialTypeError,
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
                      input: toSpeechRecognitionInput,
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
              input: toEvaluateAnswerInput,
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
          input: toPrepareIncomingTrialInput,
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
              input: toStudyAnswerTtsInput,
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
              guard: feedbackAdvanceIsReady,
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
          input: toPrepareIncomingTrialInput,
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
            entry: [resetFeedbackRevealState, 'displayFeedback', 'announceToScreenReader', 'logStateTransition'],
            always: [
              {
                target: 'speaking',
                guard: 'feedbackReadyForTts',
                actions: ['logStateTransition'],
              },
              {
                target: 'waiting',
                guard: 'feedbackReadyWithoutTts',
                actions: ['logStateTransition'],
              },
            ],
            on: {
              [EVENTS.REVIEW_REVEAL_STARTED]: {
                actions: [
                  markFeedbackRevealStarted,
                  'markFeedbackStart',
                  'logStateTransition',
                ],
              },
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
              input: toFeedbackTtsInput,
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
              onDone: [
                {
                  target: 'forceCorrecting',
                  guard: 'needsForceCorrectPrompt',
                  actions: ['logStateTransition'],
                },
                {
                  target: 'readyToFade',
                  actions: ['logStateTransition'],
                },
              ],
            },
          },
          readyToFade: {
            entry: ['logStateTransition'],
            always: {
              guard: feedbackAdvanceIsReady,
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
                guard: incomingPreparationAlreadyComplete,
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
              input: toHistoryLoggingInput,
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
              input: toOutcomeHistoryStateInput,
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
          trackingPerformance: {
            entry: ['logStateTransition'],
            invoke: {
              id: 'updateEngineService',
              src: 'updateEngineService',
              input: toUpdateEngineInput,
              onDone: [
                {
                  // MEDIUM FIX #1: Check if unit finished after engine update
                  // If so, trigger unit completion instead of continuing to next card
                  guard: engineUpdateFinishedUnit,
                  target: '#cardMachine.transition.fadingOut',
                  actions: [
                    'logStateTransition',
                    markUnitFinishedAfterEngineUpdate,
                  ],
                },
                {
                  guard: 'isVideoSession',
                  target: '#cardMachine.videoWaiting',
                  actions: [
                    'incrementQuestionIndex',
                    resumeVideoSessionAfterQuestion,
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
              input: toPrepareIncomingTrialInput,
              onDone: [
                {
                  guard: preparedResultFinishedUnit,
                  target: 'logging',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
                {
                  guard: preparedResultHasNoAdvance,
                  target: 'logging',
                  actions: [
                    storePreparedIncomingTrial,
                    'logStateTransition',
                  ],
                },
                {
                  guard: preparedResultUsesDirectAdvance,
                  target: 'directAdvance',
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
          directAdvance: {
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
                    commitPreparedTrialToActiveContext,
                    'resetSrState',
                    'resetSrAttempts',
                    'clearErrorMessage',
                    'syncDeliverySettings',
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
                actions: setFadeOutStallError,
              },
            },
          },
          clearing: {
            entry: [
              'setDisplayNotReady',
              'setInputNotReady',
              'clearFeedback',
              'resetTimers',
              clearIncomingPreparationState,
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
                  resumeVideoSessionAfterClearing,
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
                acceptVideoCheckpoint,
              'logStateTransition',
            ],
            },
            {
              target: `#cardMachine.${STATES.ERROR}`,
              actions: [
                setInvalidVideoCheckpointError,
                'logError',
                'logStateTransition',
              ],
            },
          ],
          [EVENTS.VIDEO_ENDED]: {
            target: 'videoEnded',
              guard: 'isVideoSession',
              actions: [
                markVideoEnded,
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
      FEEDBACK_CONTENT: {
        actions: storeFeedbackContent,
      },
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
          setExternalUnitFinishedMessage,
          'logStateTransition',
        ],
      },
      [EVENTS.VIDEO_CHECKPOINT]: {
        target: `#cardMachine.${STATES.ERROR}`,
        actions: [
          setUnexpectedVideoCheckpointError,
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

      // Composite actions
      errorActions: cardMachineActions.errorActions,
    },

    actors: createServices(),

    delays: {
      FADE_IN_DURATION: () => getCssDuration('--transition-smooth'),
      FADE_OUT_DURATION: () => getCssDuration('--transition-smooth'),
      FADE_OUT_STALL_TIMEOUT: () => getCssDuration('--transition-smooth') + 1000,
      FORCE_CORRECT_TIMEOUT: ({ context }: MachineArgs) => {
        const timeout = parseInt(String(context.deliverySettings?.forcecorrecttimeout ?? ''), 10);
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







