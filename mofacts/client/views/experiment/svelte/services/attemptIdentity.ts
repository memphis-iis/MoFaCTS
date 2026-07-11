import { Session } from 'meteor/session';

const CURRENT_ATTEMPT_ID_KEY = 'currentLearningAttemptId';

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function beginLearningAttempt(tdfName: unknown, startedAt = Date.now()): string {
  const existing = nonBlankString(Session.get(CURRENT_ATTEMPT_ID_KEY));
  if (existing) {
    return existing;
  }
  const normalizedTdfName = nonBlankString(tdfName);
  if (!normalizedTdfName) {
    throw new Error('[Learning Attempt] Cannot begin attempt without currentTdfName');
  }
  const attemptId = `${new Date(startedAt).toISOString()} ${normalizedTdfName}`;
  Session.set(CURRENT_ATTEMPT_ID_KEY, attemptId);
  return attemptId;
}

export function requireCurrentLearningAttemptId(): string {
  const attemptId = nonBlankString(Session.get(CURRENT_ATTEMPT_ID_KEY));
  if (!attemptId) {
    throw new Error('[Learning Attempt] currentLearningAttemptId is not initialized');
  }
  return attemptId;
}

export function clearCurrentLearningAttemptId(): void {
  Session.set(CURRENT_ATTEMPT_ID_KEY, undefined);
}
