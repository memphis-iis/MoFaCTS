import { ReactiveDict } from 'meteor/reactive-dict';

const trialTimingState = new ReactiveDict('trialTimingState');

const TrialTimingKeys = Object.freeze({
  TRIAL_START_TIMESTAMP: 'trialStartTimestamp',
  TRIAL_END_TIMESTAMP: 'trialEndTimeStamp',
  CUR_TIMEOUT_ID: 'CurTimeoutId',
  CUR_INTERVAL_ID: 'CurIntervalId',
  VAR_LEN_TIMEOUT_NAME: 'varLenTimeoutName',
  SCROLL_LIST_COUNT: 'scrollListCount',
});

const TRIAL_TIMING_DEFAULTS = Object.freeze({
  [TrialTimingKeys.TRIAL_START_TIMESTAMP]: 0,
  [TrialTimingKeys.TRIAL_END_TIMESTAMP]: 0,
  [TrialTimingKeys.CUR_TIMEOUT_ID]: undefined,
  [TrialTimingKeys.CUR_INTERVAL_ID]: undefined,
  [TrialTimingKeys.VAR_LEN_TIMEOUT_NAME]: null,
  [TrialTimingKeys.SCROLL_LIST_COUNT]: 0,
});

export function resetTrialTimingState(): void {
  Object.entries(TRIAL_TIMING_DEFAULTS).forEach(([key, value]) => {
    trialTimingState.set(key, value as never);
  });
}

export function getTrialStartTimestamp(): number {
  return (trialTimingState.get(TrialTimingKeys.TRIAL_START_TIMESTAMP) as number | undefined) || 0;
}

export function setTrialStartTimestamp(value: number): void {
  trialTimingState.set(TrialTimingKeys.TRIAL_START_TIMESTAMP, value || 0);
}

export function getTrialEndTimestamp(): number {
  return (trialTimingState.get(TrialTimingKeys.TRIAL_END_TIMESTAMP) as number | undefined) || 0;
}

export function setTrialEndTimestamp(value: number): void {
  trialTimingState.set(TrialTimingKeys.TRIAL_END_TIMESTAMP, value || 0);
}

export function setCurTimeoutId(value: unknown): void {
  trialTimingState.set(TrialTimingKeys.CUR_TIMEOUT_ID, value as never);
}

export function setCurIntervalId(value: unknown): void {
  trialTimingState.set(TrialTimingKeys.CUR_INTERVAL_ID, value as never);
}

export function setVarLenTimeoutName(value: unknown): void {
  trialTimingState.set(TrialTimingKeys.VAR_LEN_TIMEOUT_NAME, value as never);
}

export function getScrollListCount(): number {
  return (trialTimingState.get(TrialTimingKeys.SCROLL_LIST_COUNT) as number | undefined) || 0;
}

export function setScrollListCount(value: number): void {
  trialTimingState.set(TrialTimingKeys.SCROLL_LIST_COUNT, value || 0);
}

resetTrialTimingState();
