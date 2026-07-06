import { ReactiveDict } from 'meteor/reactive-dict';
import { Session } from 'meteor/session';
import type { EJSONableProperty } from 'meteor/ejson';

const activeTrialDisplayRuntimeState = new ReactiveDict('activeTrialDisplayRuntimeState');

const ActiveTrialDisplayKeys = Object.freeze({
  CURRENT_ANSWER: 'currentAnswer',
  ALTERNATE_DISPLAY_INDEX: 'alternateDisplayIndex',
  ORIGINAL_QUESTION: 'originalQuestion',
  CURRENT_DISPLAY: 'currentDisplay',
  BUTTON_TRIAL: 'buttonTrial',
  BUTTON_LIST: 'buttonList',
});

function setRuntimeValue(key: string, value: unknown): void {
  activeTrialDisplayRuntimeState.set(key, value as EJSONableProperty | undefined);
}

export function setCurrentAnswer(value: unknown): void {
  setRuntimeValue(ActiveTrialDisplayKeys.CURRENT_ANSWER, value);
  Session.set(ActiveTrialDisplayKeys.CURRENT_ANSWER, value || '');
}

export function getCurrentAnswer(): unknown {
  const value = activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.CURRENT_ANSWER);
  return value === undefined ? Session.get(ActiveTrialDisplayKeys.CURRENT_ANSWER) : value;
}

export function setAlternateDisplayIndex(value: number | undefined): void {
  setRuntimeValue(ActiveTrialDisplayKeys.ALTERNATE_DISPLAY_INDEX, value);
  Session.set(ActiveTrialDisplayKeys.ALTERNATE_DISPLAY_INDEX, value);
}

export function getAlternateDisplayIndex(): number | undefined {
  const value = activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.ALTERNATE_DISPLAY_INDEX);
  const resolved = value === undefined
    ? Session.get(ActiveTrialDisplayKeys.ALTERNATE_DISPLAY_INDEX)
    : value;
  return typeof resolved === 'number' ? resolved : undefined;
}

export function setOriginalQuestion(value: unknown): void {
  setRuntimeValue(ActiveTrialDisplayKeys.ORIGINAL_QUESTION, value);
}

export function getOriginalQuestion(): unknown {
  return activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.ORIGINAL_QUESTION);
}

export function setCurrentDisplay(value: Record<string, unknown> | undefined): void {
  setRuntimeValue(ActiveTrialDisplayKeys.CURRENT_DISPLAY, value);
}

export function getCurrentDisplay(): Record<string, unknown> | undefined {
  const value = activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.CURRENT_DISPLAY);
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined;
}

export function isButtonTrial(): boolean {
  return activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.BUTTON_TRIAL) === true;
}

export function setButtonTrial(value: unknown): void {
  setRuntimeValue(ActiveTrialDisplayKeys.BUTTON_TRIAL, Boolean(value));
}

export function getButtonList(): unknown[] {
  return (activeTrialDisplayRuntimeState.get(ActiveTrialDisplayKeys.BUTTON_LIST) as unknown[] | undefined) || [];
}

export function setButtonList(value: unknown[] | null | undefined): void {
  setRuntimeValue(ActiveTrialDisplayKeys.BUTTON_LIST, Array.isArray(value) ? value : []);
}

export function resetActiveTrialDisplayRuntimeState(): void {
  setCurrentAnswer(undefined);
  setAlternateDisplayIndex(undefined);
  setOriginalQuestion(undefined);
  setCurrentDisplay(undefined);
  setButtonTrial(false);
  setButtonList([]);
}
