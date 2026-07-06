import { EVENTS, STATES } from './constants';
import * as contentRuntimeMachineActions from './contentRuntimeMachineActions';
import { storeFeedbackContent } from './feedbackContextMachine';
import {
  setExternalUnitFinishedMessage,
  setUnexpectedVideoCheckpointError,
} from './machineErrorContext';

export const contentRuntimeMachineGlobalHandlers = {
  FEEDBACK_CONTENT: {
    actions: storeFeedbackContent,
  },
  [EVENTS.TRIAL_REVEAL_STARTED]: {
    actions: ['markTrialRevealStart', 'logStateTransition'],
  },
  [EVENTS.SPARC_ACTION]: {
    actions: ['applySparcActionResult', 'logStateTransition'],
  },
  [EVENTS.ERROR]: [
    {
      target: `#contentRuntimeMachine.${STATES.TRANSITION}`,
      guard: 'isSoftError',
      actions: ['logError', 'logStateTransition'],
    },
    {
      target: `#contentRuntimeMachine.${STATES.ERROR}`,
      guard: 'isHardError',
      actions: [...contentRuntimeMachineActions.errorActions, 'logStateTransition'],
    },
  ],
  [EVENTS.UNIT_FINISHED]: {
    target: `#contentRuntimeMachine.${STATES.IDLE}`,
    actions: [
      setExternalUnitFinishedMessage,
      'logStateTransition',
    ],
  },
  [EVENTS.VIDEO_CHECKPOINT]: {
    target: `#contentRuntimeMachine.${STATES.ERROR}`,
    actions: [
      setUnexpectedVideoCheckpointError,
      'logError',
      'logStateTransition',
    ],
  },
};
