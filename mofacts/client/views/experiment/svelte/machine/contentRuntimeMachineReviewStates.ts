import { EVENTS, STATES } from './constants';
import {
  markIncomingPreparationFailed,
  markIncomingReady,
  storePreparedIncomingTrial,
} from './preparedAdvanceMachine';
import {
  markFeedbackRevealStarted,
  resetFeedbackRevealState,
} from './feedbackContextMachine';
import {
  toFeedbackTtsInput,
  toPrepareIncomingTrialInput,
  toServiceInput,
  toStudyAnswerTtsInput,
} from './contentRuntimeMachineServiceInputs';
import { feedbackAdvanceIsReady } from './contentRuntimeMachineTransitionGuards';

export const contentRuntimeMachineReviewStates = {
  /**
   * Display answer immediately for study trials.
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
        target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
        actions: ['logStateTransition'],
      },
      [EVENTS.INCOMING_READY]: {
        actions: [markIncomingReady, 'logStateTransition'],
      },
    },
    states: {
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
            target: 'waiting',
            actions: ['logError', 'logStateTransition'],
          },
        },
      },
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
          target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
          actions: ['logStateTransition'],
        },
      },
    },
  },

  /**
   * Display feedback for drill trials.
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
            target: 'waiting',
            actions: ['logError', 'logStateTransition'],
          },
        },
      },
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
          target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
          actions: ['logStateTransition'],
        },
      },
    },
  },
};
