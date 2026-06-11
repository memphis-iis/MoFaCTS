export type TimeoutMode = 'question' | 'feedback' | 'none';

export interface TimeoutCountdownSnapshot {
  modeState: TimeoutMode;
  progress: number;
  remainingTime: number;
  start: number | null;
  duration: number;
}

interface TimeoutCountdownControllerOptions {
  now?: () => number;
  setIntervalFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  onUpdate?: (snapshot: TimeoutCountdownSnapshot) => void;
}

interface StateMatcher {
  matches?: (path: string) => boolean;
}

function cloneSnapshot(snapshot: TimeoutCountdownSnapshot): TimeoutCountdownSnapshot {
  return { ...snapshot };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function resolveTimeoutMode(params: {
  state: StateMatcher | null | undefined;
  isOutgoingFreezeState: boolean;
  currentModeState: TimeoutMode;
}): TimeoutMode {
  const { state, isOutgoingFreezeState, currentModeState } = params;
  if (isOutgoingFreezeState && currentModeState !== 'none') {
    return currentModeState;
  }
  if (state?.matches?.('presenting.awaiting')) {
    return 'question';
  }
  if (state?.matches?.('presenting.readyPrompt')) {
    return 'feedback';
  }
  if (state?.matches?.('feedback.waiting') || state?.matches?.('study.waiting')) {
    return 'feedback';
  }
  return 'none';
}

export function getDisplayTimeoutValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveDisplayTimeoutStartMs(params: {
  currentUnitStartTime: unknown;
  displayTimeoutMountMs: number;
}): number {
  const unitStart = Number(params.currentUnitStartTime);
  return Number.isFinite(unitStart) && unitStart > 0 ? unitStart : params.displayTimeoutMountMs;
}

export function buildDisplayTimeoutMessage(
  minSecs: number,
  maxSecs: number,
  elapsedSecs: number
): string {
  if (minSecs > 0 && elapsedSecs < minSecs) {
    return `You can continue in ${Math.max(0, minSecs - elapsedSecs)}s`;
  }
  if (maxSecs > 0) {
    const remaining = Math.max(0, maxSecs - elapsedSecs);
    return remaining > 0 ? `Time remaining: ${remaining}s` : 'Continuing...';
  }
  if (minSecs > 0) {
    return 'You can continue whenever you want';
  }
  return '';
}

export function getQuestionTimeoutStartMs(
  context: { timestamps?: { timeoutStart?: unknown; trialStart?: unknown } } | null | undefined,
  now: () => number = Date.now
): number {
  const timeoutStart = Number(context?.timestamps?.timeoutStart);
  if (Number.isFinite(timeoutStart) && timeoutStart > 0) {
    return timeoutStart;
  }
  const trialStart = Number(context?.timestamps?.trialStart);
  return Number.isFinite(trialStart) && trialStart > 0 ? trialStart : now();
}

export function getFeedbackTimeoutStartMs(
  context: { timestamps?: { feedbackStart?: unknown; trialStart?: unknown } } | null | undefined,
  now: () => number = Date.now
): number {
  const feedbackStart = Number(context?.timestamps?.feedbackStart);
  if (Number.isFinite(feedbackStart) && feedbackStart > 0) {
    return feedbackStart;
  }
  const trialStart = Number(context?.timestamps?.trialStart);
  return Number.isFinite(trialStart) && trialStart > 0 ? trialStart : now();
}

export function createTimeoutCountdownController(options: TimeoutCountdownControllerOptions = {}) {
  const now = options.now || Date.now;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const onUpdate = options.onUpdate || (() => undefined);
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let snapshot: TimeoutCountdownSnapshot = {
    modeState: 'none',
    progress: 0,
    remainingTime: 0,
    start: null,
    duration: 0,
  };

  function publish() {
    onUpdate(cloneSnapshot(snapshot));
  }

  function stopInterval() {
    if (intervalHandle) {
      clearIntervalFn(intervalHandle);
      intervalHandle = null;
    }
  }

  function updateCountdown() {
    if (!snapshot.start || !snapshot.duration) {
      snapshot = {
        ...snapshot,
        progress: 0,
        remainingTime: 0,
      };
      publish();
      return;
    }

    const elapsed = now() - snapshot.start;
    const remaining = Math.max(0, snapshot.duration - elapsed);
    snapshot = {
      ...snapshot,
      progress: Math.min(100, (elapsed / snapshot.duration) * 100),
      remainingTime: Math.ceil(remaining / 1000),
    };

    if (remaining <= 0) {
      stopInterval();
    }
    publish();
  }

  function clear() {
    stopInterval();
    snapshot = {
      modeState: 'none',
      progress: 0,
      remainingTime: 0,
      start: null,
      duration: 0,
    };
    publish();
  }

  return {
    applyTestSnapshot(params: Partial<Pick<TimeoutCountdownSnapshot, 'modeState' | 'progress' | 'remainingTime'>>) {
      stopInterval();
      snapshot = {
        ...snapshot,
        modeState: params.modeState || 'none',
        progress: Number.isFinite(params.progress) ? Number(params.progress) : 0,
        remainingTime: Number.isFinite(params.remainingTime) ? Number(params.remainingTime) : 0,
      };
      publish();
    },
    clear,
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    start(duration: number, mode: TimeoutMode, startTimestamp: unknown = now()) {
      if (!duration || duration <= 0) {
        clear();
        return;
      }

      stopInterval();
      snapshot = {
        modeState: mode,
        progress: 0,
        remainingTime: 0,
        start: isPositiveFiniteNumber(startTimestamp) ? Number(startTimestamp) : now(),
        duration,
      };
      updateCountdown();
      intervalHandle = setIntervalFn(updateCountdown, 100);
    },
    stopInterval,
  };
}
