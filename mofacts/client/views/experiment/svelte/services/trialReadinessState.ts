import { ReactiveDict } from 'meteor/reactive-dict';
import { Session } from 'meteor/session';

const trialReadinessState = new ReactiveDict('trialReadinessState');

const TrialReadinessKeys = Object.freeze({
  DISPLAY_READY: 'displayReady',
  INPUT_READY: 'inputReady',
  ENTER_KEY_LOCK: 'enterKeyLock',
  PAUSED_LOCKS: 'pausedLocks',
});

export function isDisplayReady(): boolean {
  return trialReadinessState.get(TrialReadinessKeys.DISPLAY_READY) === true;
}

export function setDisplayReady(value: unknown): void {
  const isReady = Boolean(value);
  trialReadinessState.set(TrialReadinessKeys.DISPLAY_READY, isReady);
  Session.set(TrialReadinessKeys.DISPLAY_READY, isReady);
}

export function isInputReady(): boolean {
  return trialReadinessState.get(TrialReadinessKeys.INPUT_READY) === true;
}

export function setInputReady(value: unknown): void {
  const isReady = Boolean(value);
  trialReadinessState.set(TrialReadinessKeys.INPUT_READY, isReady);
  Session.set(TrialReadinessKeys.INPUT_READY, isReady);
}

export function isEnterKeyLocked(): boolean {
  return trialReadinessState.get(TrialReadinessKeys.ENTER_KEY_LOCK) === true;
}

export function setEnterKeyLock(value: unknown): void {
  trialReadinessState.set(TrialReadinessKeys.ENTER_KEY_LOCK, Boolean(value));
}

export function getPausedLocks(): number {
  return Number(trialReadinessState.get(TrialReadinessKeys.PAUSED_LOCKS) || 0);
}

export function setPausedLocks(value: number): void {
  trialReadinessState.set(TrialReadinessKeys.PAUSED_LOCKS, value);
}

export function incrementPausedLocks(delta = 1): void {
  setPausedLocks(getPausedLocks() + delta);
}

export function decrementPausedLocks(delta = 1): void {
  setPausedLocks(Math.max(0, getPausedLocks() - delta));
}

export function resetTrialReadinessState(): void {
  setDisplayReady(false);
  setInputReady(false);
  setEnterKeyLock(false);
  setPausedLocks(0);
}
