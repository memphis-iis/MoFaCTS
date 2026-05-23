import type { H5PTrialResult } from '../../../../../common/types';
import { getStimAnswerDisplayCase } from '../../../../lib/currentTestingHelpers';
import { assign, type ActionArgs, type ActionEvent } from './cardMachineActionTypes';

function getH5PSubmitResult(event?: ActionEvent): H5PTrialResult | null {
  if (event?.source !== 'h5p') {
    return null;
  }
  if (!event.h5pResult) {
    throw new Error('[CardMachine] H5P submit event missing h5pResult');
  }
  return event.h5pResult;
}

export const clearUserAnswer = assign({
  userAnswer: () => '',
});

export const captureAnswer = assign({
  userAnswer: ({ event }: ActionArgs) => event?.userAnswer,
  source: ({ event, context }: ActionArgs) => event?.source || context.source || 'keyboard',
  h5pResult: ({ event }: ActionArgs) => getH5PSubmitResult(event),
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: event?.timestamp || Date.now(),
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
});

export const setReviewEntry = assign({
  reviewEntry: ({ context, event, self }: ActionArgs) => {
    const snapshot = self?.getSnapshot?.();
    if (snapshot?.matches?.('feedback.forceCorrecting')) {
      return event?.userAnswer ?? context.reviewEntry;
    }
    return context.reviewEntry;
  },
});

export const captureTranscription = assign({
  userAnswer: ({ event }: ActionArgs) => event?.transcript,
  srGrammarMatch: ({ event }: ActionArgs) => event?.isCorrect,
  source: () => 'voice',
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: context.timestamps.trialEnd || event?.timestamp || Date.now(),
    firstKeypress: context.timestamps.firstKeypress || event?.timestamp || Date.now(),
  }),
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

export const forceSrFailureAnswer = assign({
  userAnswer: () => '',
  isCorrect: () => false,
  isTimeout: () => false,
  source: () => 'voice',
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: context.timestamps.trialEnd || Date.now(),
    firstKeypress: context.timestamps.firstKeypress || context.timestamps.trialEnd || Date.now(),
  }),
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

export const markTimeout = assign({
  isTimeout: () => true,
  userAnswer: () => '',
  source: () => 'timeout',
  consecutiveTimeouts: ({ context }: ActionArgs) => context.consecutiveTimeouts + 1,
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialEnd: Date.now(),
  }),
});

export const resetTimeoutCounter = assign({
  consecutiveTimeouts: () => 0,
});

export const markTimeoutReset = assign({
  timeoutResetCounter: ({ context }: ActionArgs) => {
    const current = Number.isFinite(context.timeoutResetCounter) ? context.timeoutResetCounter : 0;
    return current + 1;
  },
  timestamps: ({ context, event }: ActionArgs) => ({
    ...context.timestamps,
    timeoutStart: event?.timestamp || Date.now(),
  }),
});

export const normalizeUserAnswerForFeedback = ({ context }: ActionArgs) => getStimAnswerDisplayCase(context.userAnswer);
