import { EVENTS, STATES } from './constants';
import { assign } from 'xstate';
import type { UpdateEngineDoneArgs } from './contentRuntimeMachineTypes';
import {
  markIncomingPreparationFailed,
  markIncomingReady,
  storePreparedIncomingTrial,
} from './preparedAdvanceMachine';
import {
  clearIncomingPreparationState,
  commitPreparedTrialToActiveContext,
  markUnitFinishedAfterEngineUpdate,
} from './trialContextMachine';
import {
  resumeVideoSessionAfterClearing,
  resumeVideoSessionAfterQuestion,
} from './videoSessionMachine';
import {
  toHistoryLoggingInput,
  toOutcomeHistoryStateInput,
  toPrepareIncomingTrialInput,
  toUpdateEngineInput,
} from './contentRuntimeMachineServiceInputs';
import {
  engineUpdateFinishedUnit,
  incomingPreparationAlreadyComplete,
  preparedResultFinishedUnit,
  preparedResultHasNoAdvance,
  preparedResultUsesDirectAdvance,
} from './contentRuntimeMachineTransitionGuards';

export const contentRuntimeMachineTransitionState = {
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
          target: `#contentRuntimeMachine.${STATES.ERROR}`,
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
          target: `#contentRuntimeMachine.${STATES.ERROR}`,
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
            guard: ({ event }: { event: { output?: { status?: string } } }) => event.output?.status === 'error',
            target: '#contentRuntimeMachine.error',
            actions: [assign({ errorMessage: () => 'The trial engine update failed' }), 'logError'],
          },
          {
            guard: ({ context }: { context: { navigationRequested?: boolean } }) => context.navigationRequested === true,
            target: '#contentRuntimeMachine.navigationReady',
            actions: [assign({ unitFinished: ({ event }: UpdateEngineDoneArgs) => event.output?.unitFinished === true }), 'logStateTransition'],
          },
          {
            guard: engineUpdateFinishedUnit,
            target: '#contentRuntimeMachine.transition.fadingOut',
            actions: [
              'logStateTransition',
              markUnitFinishedAfterEngineUpdate,
            ],
          },
          {
            guard: 'isVideoSession',
            target: '#contentRuntimeMachine.videoWaiting',
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
            target: '#contentRuntimeMachine.transition.fadingOut',
            actions: ['logStateTransition'],
          },
          {
            target: 'fadingOut',
            actions: ['incrementQuestionIndex', 'logStateTransition'],
          },
        ],
        onError: {
          target: '#contentRuntimeMachine.error',
          actions: ['setErrorMessage', 'logError'],
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
      invoke: {
        id: 'waitForTrialFadeOut',
        src: 'waitForTrialFadeOut',
        onDone: [
          {
            guard: 'shouldEnterBlocksBoardFromPreparedAdvance',
            target: `#contentRuntimeMachine.${STATES.PRESENTING}.${STATES.BLOCKS_BOARD}`,
            actions: [
              'commitPreparedTrialRuntime',
              commitPreparedTrialToActiveContext,
              'resetSrState',
              'resetSrAttempts',
              'clearErrorMessage',
              'syncDeliverySettings',
              'setDisplayNotReady',
              'setInputNotReady',
              'clearFeedback',
              'resetTimers',
              'logStateTransition',
            ],
          },
          {
            guard: 'hasPreparedTrial',
            target: `#contentRuntimeMachine.${STATES.PRESENTING}.${STATES.DISPLAYING}`,
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
        onError: {
          target: `#contentRuntimeMachine.${STATES.ERROR}`,
          actions: ['setErrorMessage', 'logError', 'logStateTransition'],
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
        {
          guard: 'unitFinished',
          actions: [
            'handleUnitCompletion',
            'logStateTransition',
          ],
        },
        {
          guard: 'isVideoSession',
          target: '#contentRuntimeMachine.videoWaiting',
          actions: [
            resumeVideoSessionAfterClearing,
            'resumeVideoPlayback',
            'logStateTransition',
          ],
        },
        {
          target: `#contentRuntimeMachine.${STATES.PRESENTING}`,
          actions: ['logStateTransition'],
        },
      ],
    },
  },
};
