import { Session } from 'meteor/session';

export type PracticeLaunchMode = 'normal' | 'blocks';

const PRACTICE_LAUNCH_MODE_KEY = 'practiceLaunchMode';

export function getPracticeLaunchMode(): PracticeLaunchMode {
  return Session.get(PRACTICE_LAUNCH_MODE_KEY) === 'blocks' ? 'blocks' : 'normal';
}

export function setPracticeLaunchMode(mode: PracticeLaunchMode): void {
  Session.set(PRACTICE_LAUNCH_MODE_KEY, mode);
}

export function clearPracticeLaunchMode(): void {
  Session.set(PRACTICE_LAUNCH_MODE_KEY, 'normal');
}
