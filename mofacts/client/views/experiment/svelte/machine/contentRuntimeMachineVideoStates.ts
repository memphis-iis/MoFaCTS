import { EVENTS, STATES } from './constants';
import {
  acceptVideoCheckpoint,
  markVideoEnded,
} from './videoSessionMachine';
import { setInvalidVideoCheckpointError } from './machineErrorContext';

export const contentRuntimeMachineVideoStates = {
  /**
   * Video playback continues until the next checkpoint triggers a question.
   */
  videoWaiting: {
    entry: ['logStateTransition'],
    on: {
      [EVENTS.VIDEO_CHECKPOINT]: [
        {
          target: `#contentRuntimeMachine.${STATES.PRESENTING}`,
          guard: 'canAcceptVideoCheckpoint',
          actions: [
            acceptVideoCheckpoint,
            'logStateTransition',
          ],
        },
        {
          target: `#contentRuntimeMachine.${STATES.ERROR}`,
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
};
