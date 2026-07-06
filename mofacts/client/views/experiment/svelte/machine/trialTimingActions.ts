import { clientConsole } from '../../../../lib/clientLogger';
import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

export const markInputEnabled = assign({
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    inputEnabled: Date.now(),
  }),
});

export const markTrialRevealStart = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    if (context.timestamps.trialStart > 0) {
      return context.timestamps;
    }
    const trialStart = event?.timestamp || Date.now();
    return {
      ...context.timestamps,
      trialStart,
      timeoutStart: context.timestamps.timeoutStart || trialStart,
      feedbackStart: context.testType === 's'
        ? context.timestamps.feedbackStart || trialStart
        : context.timestamps.feedbackStart,
    };
  },
});

export const markFirstKeypress = assign({
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
});

export const markFeedbackStart = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    const feedbackStart = event?.timestamp || Date.now();
    clientConsole(2, '[ContentRuntimeMachine][FeedbackTiming] markFeedbackStart', {
      testType: context.testType,
      feedbackStart,
      existingFeedbackTimeoutMs: context.feedbackTimeoutMs,
      isCorrect: context.isCorrect,
    });
    return {
      ...context.timestamps,
      feedbackStart,
    };
  },
});

export const markFeedbackEnd = assign({
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    feedbackEnd: event?.timestamp || Date.now(),
  }),
});

export const markTrialEnd = assign({
  timestamps: ({ context, event }: ActionArgs) => {
    if (!context.timestamps.trialEnd && context.testType !== 's') {
      clientConsole(1, '[ContentRuntimeMachine] Missing submit timestamp before transition; using transition trialEnd timestamp', {
        testType: context.testType,
        source: context.source,
        trialStart: context.timestamps.trialStart,
        feedbackStart: context.timestamps.feedbackStart,
        feedbackEnd: context.timestamps.feedbackEnd,
      });
    }
    return {
      ...context.timestamps,
      trialEnd: context.timestamps.trialEnd || event?.timestamp || Date.now(),
    };
  },
});

export function resetTimers({ context: _context }: ActionArgs) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:resetTimers'));
  }
}
