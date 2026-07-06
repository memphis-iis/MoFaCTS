import { assign as xAssign } from 'xstate';
import type { MachineArgs } from './contentRuntimeMachineTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches contentRuntimeMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

export const setUnsupportedTrialTypeError = assign({
  errorMessage: ({ context }: MachineArgs) => `Unsupported trial type: ${context.testType}`,
});

export const setFadeOutStallError = assign({
  errorMessage: ({ context }: MachineArgs) => `transition.fadingOut stalled without TRANSITION_COMPLETE (preparedAdvanceMode=${String(context.preparedAdvanceMode || 'none')})`,
});

export const setInvalidVideoCheckpointError = assign({
  errorMessage: ({ event }: MachineArgs) => (
    `[ContentRuntimeMachine] Invalid video checkpoint event: checkpointIndex=${String(event.checkpointIndex)}, questionIndex=${String(event.questionIndex)}`
  ),
});

export const setUnexpectedVideoCheckpointError = assign({
  errorMessage: ({ event }: MachineArgs) => (
    `[ContentRuntimeMachine] VIDEO_CHECKPOINT received outside videoWaiting: checkpointIndex=${String(event.checkpointIndex)}, questionIndex=${String(event.questionIndex)}`
  ),
});

export const setExternalUnitFinishedMessage = assign({
  errorMessage: () => 'Unit finished by external event',
});
