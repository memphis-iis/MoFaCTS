import { clientConsole } from '../../../../lib/clientLogger';
import { getFeedbackTimeoutMs } from '../utils/timeoutUtils';
import { assign, type ActionArgs } from './cardMachineActionTypes';
import { normalizeUserAnswerForFeedback } from './learnerResponseActions';

export const applyValidationResult = assign({
  isCorrect: ({ event }: ActionArgs) => {
    const result = event?.output?.isCorrect ?? false;
    return result;
  },
  userAnswer: normalizeUserAnswerForFeedback,
  feedbackMessage: ({ event }: ActionArgs) => event?.output?.matchText || '',
  sparcNodeValues: ({ context, event }: ActionArgs) => ({
    ...(context.sparcNodeValues || {}),
    ...(event?.output?.sparcNodeValues || {}),
  }),
  feedbackTimeoutMs: ({ context, event }: ActionArgs) => {
    const timeoutContext: {
      deliverySettings?: Record<string, unknown>;
      testType?: string;
      isCorrect?: boolean;
    } = {
      testType: context.testType,
      isCorrect: event?.output?.isCorrect ?? false,
    };

    if (context.deliverySettings && typeof context.deliverySettings === 'object') {
      timeoutContext.deliverySettings = context.deliverySettings as Record<string, unknown>;
    }

    const timeoutMs = getFeedbackTimeoutMs(timeoutContext);

    clientConsole(2, '[CardMachine][FeedbackTiming] applyValidationResult', {
      testType: context.testType,
      isCorrect: timeoutContext.isCorrect,
      feedbackTimeoutMs: timeoutMs,
      correctprompt: timeoutContext.deliverySettings?.correctprompt,
      reviewstudy: timeoutContext.deliverySettings?.reviewstudy,
      purestudy: timeoutContext.deliverySettings?.purestudy,
    });

    return timeoutMs;
  },
});

export const validateAnswer = assign({
  isCorrect: ({ context }: ActionArgs) => {
    const userAnswer = context.userAnswer.trim();
    const correctAnswer = context.currentAnswer.trim();

    if (!userAnswer) {
      return false;
    }

    if (context.deliverySettings.caseSensitive) {
      return userAnswer === correctAnswer;
    }

    return userAnswer.toLowerCase() === correctAnswer.toLowerCase();
  },
});
