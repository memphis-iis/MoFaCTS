import { EVENTS, STATES } from './constants';
import {
  acceptVideoCheckpoint,
  markVideoEnded,
  resumeVideoSessionAfterQuestion,
} from './videoSessionMachine';
import { setInvalidVideoCheckpointError } from './machineErrorContext';

export const contentRuntimeMachineVideoStates = {
  /**
   * Video playback continues until the next checkpoint triggers a question.
   */
  videoWaiting: {
    entry: ['logStateTransition'],
    on: {
      VIDEO_WORKSHEET_CHECKPOINT: {
        target: 'videoWorksheet', guard: 'canAcceptVideoCheckpoint', actions: [acceptVideoCheckpoint],
      },
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

  /** Worksheet owns work and review; no adaptive trial runs at this checkpoint. */
  videoWorksheet: {
    on: {
      VIDEO_WORKSHEET_COMPLETE: {
        target: 'videoWaiting', actions: [resumeVideoSessionAfterQuestion, 'resumeVideoPlayback'],
      },
    },
  },
  videoEnded: {
    entry: ['logStateTransition'],
    on: {
      [EVENTS.VIDEO_CONTINUE]: {
        actions: ['handleUnitCompletion', 'logStateTransition'],
      },
    },
  },
};
