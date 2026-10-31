import { assign as xAssign, and, not, or, stateIn } from 'xstate';
import type { MachineArgs } from './contentRuntimeMachineTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches contentRuntimeMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

export const resetFeedbackRevealState = assign({
  feedbackText: () => '',
  feedbackRevealStarted: () => false,
});

export const markFeedbackRevealStarted = assign({
  feedbackRevealStarted: () => true,
});

export const storeFeedbackContent = assign({
  feedbackText: ({ event }: MachineArgs) => String(event.feedbackText || '').trim(),
});

export const requestPracticeNavigation = assign({
  navigationRequested: () => true,
});

export const practiceNavigationTransitions = [
  {
    guard: or([
      stateIn({ presenting: 'validating' }),
      stateIn('study'),
      stateIn('feedback'),
      and([stateIn('transition'), not(stateIn({ transition: 'fadingOut' })), not(stateIn({ transition: 'clearing' }))]),
    ]),
    actions: requestPracticeNavigation,
  },
  {
    target: '#contentRuntimeMachine.navigationReady',
    actions: requestPracticeNavigation,
  },
];
