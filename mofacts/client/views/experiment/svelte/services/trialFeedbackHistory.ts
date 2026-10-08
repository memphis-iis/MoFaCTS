import { hasAnswerFeedback } from '../utils/timeoutUtils';

/** Record the feedback actually required by the trial type and outcome duration. */
export function buildTrialFeedbackHistory(context: {
  readonly testType: string;
  readonly isCorrect: boolean;
  readonly deliverySettings: Record<string, unknown>;
  readonly feedbackText?: string;
}): { feedbackText: string; feedbackType: string } {
  if (!hasAnswerFeedback(context)) {
    return { feedbackText: '', feedbackType: '' };
  }

  if (typeof context.feedbackText !== 'string' || context.feedbackText.trim() === '') {
    throw new Error('[History Logging] feedbackText missing before history write');
  }

  return {
    feedbackText: context.feedbackText.trim(),
    feedbackType: context.isCorrect ? 'correct' : 'incorrect',
  };
}
