import { ReactiveDict } from 'meteor/reactive-dict';

const progressionState = new ReactiveDict('trialProgressionState');

const TrialProgressionKeys = Object.freeze({
  QUESTION_INDEX: 'questionIndex',
});

export function getQuestionIndex(): number {
  return Number(progressionState.get(TrialProgressionKeys.QUESTION_INDEX) || 0);
}

export function setQuestionIndex(value: number | null | undefined): void {
  progressionState.set(TrialProgressionKeys.QUESTION_INDEX, value || 0);
}

export function incrementQuestionIndex(delta = 1): void {
  const current = getQuestionIndex();
  progressionState.set(TrialProgressionKeys.QUESTION_INDEX, current + delta);
}

export function resetQuestionIndex(): void {
  setQuestionIndex(0);
}
