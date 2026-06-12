import { EVENTS, STATES } from './constants';
import * as cardMachineActions from './cardMachineActions';
import { storeFeedbackContent } from './feedbackContextMachine';
import {
  setExternalUnitFinishedMessage,
  setUnexpectedVideoCheckpointError,
} from './machineErrorContext';

export const cardMachineGlobalHandlers = {
  FEEDBACK_CONTENT: {
    actions: storeFeedbackContent,
  },
  [EVENTS.TRIAL_REVEAL_STARTED]: {
    actions: ['markTrialRevealStart', 'logStateTransition'],
  },
  [EVENTS.ERROR]: [
    {
      target: `#cardMachine.${STATES.TRANSITION}`,
      guard: 'isSoftError',
      actions: ['logError', 'logStateTransition'],
    },
    {
      target: `#cardMachine.${STATES.ERROR}`,
      guard: 'isHardError',
      actions: [...cardMachineActions.errorActions, 'logStateTransition'],
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
};
