import { assign as xAssign } from 'xstate';
import type { MachineArgs } from './cardMachineTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches cardMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

export const resetFeedbackRevealState = assign({
  feedbackText: () => '',
  feedbackRevealStarted: () => false,
  feedbackSuppressed: () => false,
});

export const markFeedbackRevealStarted = assign({
  feedbackRevealStarted: () => true,
});

export const storeFeedbackContent = assign({
  feedbackText: ({ event }: MachineArgs) => String(event.feedbackText || '').trim(),
  feedbackSuppressed: ({ event }: MachineArgs) => event.feedbackSuppressed === true,
});
