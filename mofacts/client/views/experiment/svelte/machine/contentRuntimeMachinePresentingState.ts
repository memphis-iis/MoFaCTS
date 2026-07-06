import { EVENTS, STATES } from './constants';
import * as contentRuntimeMachineActions from './contentRuntimeMachineActions';
import { loadSelectedTrialIntoActiveContext } from './trialContextMachine';
import { setUnsupportedTrialTypeError } from './machineErrorContext';
import {
  toDisplayedTrialStateInput,
  toEvaluateAnswerInput,
  toSelectCardInput,
  toServiceInput,
  toSpeechRecognitionInput,
} from './contentRuntimeMachineServiceInputs';
import {
  activeTrialIsDrillOrTest,
  questionAudioIsAvailable,
} from './contentRuntimeMachineTransitionGuards';

export const contentRuntimeMachinePresentingState = {
  initial: STATES.LOADING,
  states: {
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
            target: '#contentRuntimeMachine.error',
            actions: [
              setUnsupportedTrialTypeError,
              'logError',
              'logStateTransition',
            ],
          },
        ],
        onError: {
          target: '#contentRuntimeMachine.error',
          actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
        },
      },
      always: [
        {
          target: '#contentRuntimeMachine.error',
          guard: 'isUnsupportedTrialType',
          actions: [
            setUnsupportedTrialTypeError,
            'logError',
          ],
        },
      ],
    },

    [STATES.FADING_IN]: {
      entry: ['logStateTransition'],
      after: {
        FADE_IN_DURATION: {
          target: STATES.DISPLAYING,
          actions: ['setDisplayReady', 'logStateTransition'],
        },
      },
    },

    [STATES.DISPLAYING]: {
      entry: ['startEarlyLockForCurrentTrial', 'logStateTransition'],
      invoke: {
        id: 'experimentStateService',
        src: 'experimentStateService',
        input: toDisplayedTrialStateInput,
        onDone: [
          {
            target: `#contentRuntimeMachine.${STATES.STUDY}`,
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
            target: '#contentRuntimeMachine.error',
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
          target: '#contentRuntimeMachine.error',
          actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
        },
      },
    },

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
          target: '#contentRuntimeMachine.error',
          actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
        },
      },
    },

    [STATES.AUDIO_GATE]: {
      entry: ['logStateTransition'],
      invoke: {
        id: 'questionAudioGateService',
        src: 'questionAudioGateService',
        input: toServiceInput,
        onDone: [
          {
            target: `#contentRuntimeMachine.${STATES.STUDY}`,
            guard: 'isStudyTrial',
            actions: ['logStateTransition'],
          },
          {
            target: STATES.AWAITING,
            actions: ['logStateTransition'],
          },
        ],
        onError: {
          target: '#contentRuntimeMachine.error',
          actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
        },
      },
    },

    [STATES.AWAITING]: {
      entry: ['enableInput', 'markInputEnabled', 'focusInput', 'maybeSpeakQuestion', 'startRecording', 'logStateTransition'],
      exit: ['disableInput', 'stopRecording', 'logStateTransition'],
      type: 'parallel',
      states: {
        inputMode: {
          initial: 'ready',
          states: {
            ready: {
              on: {
                [EVENTS.FIRST_KEYPRESS]: {
                  actions: ['markFirstKeypress', 'logStateTransition'],
                },
                [EVENTS.SUBMIT]: {
                  target: '#contentRuntimeMachine.presenting.validating',
                  actions: ['captureAnswer', 'logStateTransition'],
                },
                [EVENTS.TIMEOUT]: {
                  target: '#contentRuntimeMachine.presenting.validating',
                  actions: ['markTimeout', 'logStateTransition'],
                },
              },
            },
          },
        },

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
                  always: {
                    target: '#contentRuntimeMachine.presenting.validating',
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
                  always: {
                    target: '#contentRuntimeMachine.presenting.validating',
                  },
                },
              },
            },
          },
        },

        mainTimeout: {
          initial: 'waitingForReveal',
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
            waitingForReveal: {
              on: {
                [EVENTS.TRIAL_REVEAL_STARTED]: {
                  target: 'running',
                  actions: ['markTrialRevealStart', 'logStateTransition'],
                },
              },
              always: [
                {
                  target: 'running',
                  guard: 'trialRevealStarted',
                },
              ],
            },
            running: {
              invoke: {
                id: 'mainCardTimeout',
                src: 'mainCardTimeout',
                input: toServiceInput,
                onDone: {
                  target: '#contentRuntimeMachine.presenting.validating',
                  actions: ['markTimeout', 'logStateTransition'],
                },
              },
              always: [
                {
                  target: 'disabled',
                  guard: 'trialDisplaySuppressesStandardTimeout',
                },
                {
                  target: 'paused',
                  guard: 'waitingForTranscription',
                },
              ],
            },
            disabled: {},
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

    validating: {
      entry: ['logStateTransition'],
      invoke: {
        id: 'evaluateAnswerService',
        src: 'evaluateAnswerService',
        input: toEvaluateAnswerInput,
        onDone: [
          {
            target: `#contentRuntimeMachine.${STATES.FEEDBACK}`,
            guard: 'needsFeedbackAndVideoSession',
            actions: ['applyValidationResult', 'notifyVideoAnswer', 'logStateTransition'],
          },
          {
            target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
            guard: 'noFeedbackAndVideoSession',
            actions: ['applyValidationResult', 'notifyVideoAnswer', 'logStateTransition'],
          },
          {
            target: `#contentRuntimeMachine.${STATES.FEEDBACK}`,
            guard: 'needsFeedback',
            actions: ['applyValidationResult', 'logStateTransition'],
          },
          {
            target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
            guard: 'noFeedback',
            actions: ['applyValidationResult', 'logStateTransition'],
          },
        ],
        onError: {
          target: '#contentRuntimeMachine.error',
          actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
        },
      },
    },
  },
};
