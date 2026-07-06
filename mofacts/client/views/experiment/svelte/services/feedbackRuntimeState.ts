import { ReactiveDict } from 'meteor/reactive-dict';

const feedbackRuntimeState = new ReactiveDict('feedbackRuntimeState');

const FeedbackRuntimeKeys = Object.freeze({
  DISPLAY_FEEDBACK: 'displayFeedback',
  IN_FEEDBACK: 'inFeedback',
  FEEDBACK_UNSET: 'feedbackUnset',
  FEEDBACK_TYPE_FROM_HISTORY: 'feedbackTypeFromHistory',
});

export function getDisplayFeedback(): boolean {
  return feedbackRuntimeState.get(FeedbackRuntimeKeys.DISPLAY_FEEDBACK) === true;
}

export function setDisplayFeedback(value: unknown): void {
  feedbackRuntimeState.set(FeedbackRuntimeKeys.DISPLAY_FEEDBACK, Boolean(value));
}

export function isInFeedback(): boolean {
  return feedbackRuntimeState.get(FeedbackRuntimeKeys.IN_FEEDBACK) === true;
}

export function setInFeedback(value: unknown): void {
  feedbackRuntimeState.set(FeedbackRuntimeKeys.IN_FEEDBACK, Boolean(value));
}

export function isFeedbackUnset(): boolean {
  return feedbackRuntimeState.get(FeedbackRuntimeKeys.FEEDBACK_UNSET) === true;
}

export function setFeedbackUnset(value: unknown): void {
  feedbackRuntimeState.set(FeedbackRuntimeKeys.FEEDBACK_UNSET, Boolean(value));
}

export function getFeedbackTypeFromHistory(): unknown {
  return feedbackRuntimeState.get(FeedbackRuntimeKeys.FEEDBACK_TYPE_FROM_HISTORY);
}

export function setFeedbackTypeFromHistory(value: unknown): void {
  feedbackRuntimeState.set(FeedbackRuntimeKeys.FEEDBACK_TYPE_FROM_HISTORY, value as never);
}

export function resetFeedbackRuntimeState(): void {
  setDisplayFeedback(false);
  setInFeedback(false);
  setFeedbackUnset(false);
  setFeedbackTypeFromHistory(undefined);
}
