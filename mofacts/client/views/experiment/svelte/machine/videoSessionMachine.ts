import { assign as xAssign } from 'xstate';
import type { MachineArgs } from './contentRuntimeMachineTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches contentRuntimeMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

export const activateVideoSessionAtStart = assign({
  videoSession: ({ context }: MachineArgs) => ({
    ...context.videoSession,
    isActive: true,
    currentCheckpointIndex: 0,
    pendingQuestionIndex: null,
    ended: false,
  }),
});

export const resumeVideoSessionAfterQuestion = assign({
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
});

export const resumeVideoSessionAfterClearing = assign({
  videoSession: ({ context }: MachineArgs) => ({
    ...context.videoSession,
    isActive: true,
    pendingQuestionIndex: null,
    ended: false,
  }),
});

export const acceptVideoCheckpoint = assign({
  videoSession: ({ context, event }: MachineArgs) => ({
    ...context.videoSession,
    currentCheckpointIndex: Number(event.checkpointIndex),
    pendingQuestionIndex: Number(event.questionIndex),
    ended: false,
  }),
});

export const markVideoEnded = assign({
  videoSession: ({ context }: MachineArgs) => ({
    ...context.videoSession,
    ended: true,
  }),
});
