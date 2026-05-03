import { Session } from 'meteor/session';
import { clientConsole } from './clientLogger';

type LaunchLoadingSource =
  | 'learningDashboard'
  | 'instructions'
  | 'card'
  | 'audio'
  | string;

const ACTIVE_KEY = 'launchLoadingActive';
const SOURCE_KEY = 'launchLoadingSource';
const STARTED_AT_KEY = 'launchLoadingStartedAt';
const LAST_MESSAGE_KEY = 'launchLoadingLastMessage';

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function startLaunchLoading(message = 'Preparing lesson...', source: LaunchLoadingSource = 'unknown'): void {
  const startedAt = nowMs();
  Session.set(ACTIVE_KEY, true);
  Session.set(SOURCE_KEY, source);
  Session.set(STARTED_AT_KEY, startedAt);
  Session.set(LAST_MESSAGE_KEY, message);
  Session.set('appLoading', true);
  Session.set('appLoadingMessage', message);
  clientConsole(2, '[LaunchLoading]', {
    event: 'start',
    source,
    message,
    atMs: startedAt,
  });
}

export function setLaunchLoadingMessage(message: string): void {
  if (!Session.get(ACTIVE_KEY)) {
    return;
  }
  if (Session.get(LAST_MESSAGE_KEY) === message) {
    return;
  }
  Session.set(LAST_MESSAGE_KEY, message);
  Session.set('appLoadingMessage', message);
  clientConsole(2, '[LaunchLoading]', {
    event: 'message',
    message,
    elapsedMs: getLaunchLoadingElapsedMs(),
  });
}

export function finishLaunchLoading(reason = 'complete'): void {
  if (!Session.get(ACTIVE_KEY)) {
    return;
  }
  clientConsole(2, '[LaunchLoading]', {
    event: 'finish',
    source: Session.get(SOURCE_KEY),
    reason,
    elapsedMs: getLaunchLoadingElapsedMs(),
  });
  Session.set(ACTIVE_KEY, false);
  Session.set(SOURCE_KEY, null);
  Session.set(STARTED_AT_KEY, null);
  Session.set(LAST_MESSAGE_KEY, null);
  Session.set('appLoading', false);
}

export function isLaunchLoadingActive(): boolean {
  return Session.get(ACTIVE_KEY) === true;
}

export function markLaunchLoadingTiming(label: string, detail: Record<string, unknown> = {}): void {
  clientConsole(2, '[LaunchLoading][Timing]', {
    label,
    elapsedMs: getLaunchLoadingElapsedMs(),
    ...detail,
  });
}

function getLaunchLoadingElapsedMs(): number | null {
  const startedAt = Session.get(STARTED_AT_KEY);
  return typeof startedAt === 'number'
    ? Math.round(nowMs() - startedAt)
    : null;
}
