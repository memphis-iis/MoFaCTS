export type TimeoutMode = 'question' | 'feedback' | 'none';

export interface TimeoutCountdownSnapshot {
  modeState: TimeoutMode;
  progress: number;
  remainingTime: number;
  start: number | null;
  duration: number;
}

export interface DisplayTimeoutSnapshot {
  minSeconds: number;
  maxSeconds: number;
  hasDisplayTimeout: boolean;
  startMs: number;
  elapsedSeconds: number;
  canContinue: boolean;
  footerMessage: string;
  scopeKey: string;
  shouldAutoAdvance: boolean;
}

interface TimeoutCountdownControllerOptions {
  now?: () => number;
  setIntervalFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  onUpdate?: (snapshot: TimeoutCountdownSnapshot) => void;
}

interface DisplayTimeoutControllerOptions {
  now?: () => number;
  setIntervalFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  onTick?: () => void;
}

interface DisplayTimeoutDeliverySettings {
  displayMinSeconds?: unknown;
  displayMaxSeconds?: unknown;
}

interface StateMatcher {
  matches?: (path: string) => boolean;
}

interface TimeoutCountdownContext {
  timestamps?: {
    timeoutStart?: unknown;
    trialStart?: unknown;
    feedbackStart?: unknown;
  };
  timeoutResetCounter?: unknown;
  [key: string]: unknown;
}

export interface TimeoutCountdownSyncControllerOptions {
  readonly countdown: ReturnType<typeof createTimeoutCountdownController>;
  readonly getMainTimeoutMs: (params: TimeoutCountdownContext) => number;
  readonly getFeedbackTimeoutMs: (params: TimeoutCountdownContext) => number;
  readonly now?: () => number;
}

export interface TimeoutCountdownSyncParams {
  readonly testMode: boolean;
  readonly testTimeout?: Partial<Pick<TimeoutCountdownSnapshot, 'modeState' | 'progress' | 'remainingTime'>> & {
    readonly mode?: TimeoutMode;
  };
  readonly state: StateMatcher | null | undefined;
  readonly context: TimeoutCountdownContext;
  readonly deliverySettings: Record<string, unknown>;
  readonly isOutgoingFreezeState: boolean;
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

export function buildDisplayTimeoutScopeKey(params: {
  currentTdfId: unknown;
  currentUnitNumber: unknown;
  displayTimeoutStartMs: number;
}): string {
  return [
    params.currentTdfId || '',
    params.currentUnitNumber ?? '',
    params.displayTimeoutStartMs,
  ].join(':');
}

export function buildDisplayTimeoutSnapshot(params: {
  deliverySettings: DisplayTimeoutDeliverySettings | null | undefined;
  currentUnitStartTime: unknown;
  currentTdfId: unknown;
  currentUnitNumber: unknown;
  displayTimeoutMountMs: number;
  displayTimeoutNowMs: number;
  autoAdvanced: boolean;
  continuingToNextUnit: boolean;
  testMode: boolean;
}): DisplayTimeoutSnapshot {
  const minSeconds = getDisplayTimeoutValue(params.deliverySettings?.displayMinSeconds ?? 0);
  const maxSeconds = getDisplayTimeoutValue(params.deliverySettings?.displayMaxSeconds ?? 0);
  const hasDisplayTimeout = minSeconds > 0 || maxSeconds > 0;
  const startMs = resolveDisplayTimeoutStartMs({
    currentUnitStartTime: params.currentUnitStartTime,
    displayTimeoutMountMs: params.displayTimeoutMountMs,
  });
  const elapsedSeconds = hasDisplayTimeout
    ? Math.max(0, Math.floor((params.displayTimeoutNowMs - startMs) / 1000))
    : 0;
  const scopeKey = buildDisplayTimeoutScopeKey({
    currentTdfId: params.currentTdfId,
    currentUnitNumber: params.currentUnitNumber,
    displayTimeoutStartMs: startMs,
  });

  return {
    minSeconds,
    maxSeconds,
    hasDisplayTimeout,
    startMs,
    elapsedSeconds,
    canContinue: !hasDisplayTimeout || minSeconds <= 0 || elapsedSeconds >= minSeconds,
    footerMessage: buildDisplayTimeoutMessage(minSeconds, maxSeconds, elapsedSeconds),
    scopeKey,
    shouldAutoAdvance: !params.testMode &&
      hasDisplayTimeout &&
      maxSeconds > 0 &&
      elapsedSeconds >= maxSeconds &&
      !params.autoAdvanced &&
      !params.continuingToNextUnit,
  };
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

export function createTimeoutCountdownSyncController(options: TimeoutCountdownSyncControllerOptions) {
  const now = options.now || Date.now;
  let lastTimeoutResetCounter = 0;

  function resolveMode(params: {
    readonly state: StateMatcher | null | undefined;
    readonly isOutgoingFreezeState: boolean;
    readonly testMode: boolean;
    readonly testTimeout?: TimeoutCountdownSyncParams['testTimeout'];
  }): TimeoutMode {
    if (params.testMode && params.testTimeout?.mode) {
      return params.testTimeout.mode;
    }
    return resolveTimeoutMode({
      state: params.state,
      isOutgoingFreezeState: params.isOutgoingFreezeState,
      currentModeState: options.countdown.getSnapshot().modeState,
    });
  }

  function sync(params: TimeoutCountdownSyncParams): TimeoutMode {
    const mode = resolveMode({
      state: params.state,
      isOutgoingFreezeState: params.isOutgoingFreezeState,
      testMode: params.testMode,
      testTimeout: params.testTimeout,
    });

    if (params.testMode) {
      const testSnapshot: Partial<Pick<TimeoutCountdownSnapshot, 'modeState' | 'progress' | 'remainingTime'>> = {
        modeState: mode,
      };
      if (params.testTimeout && Number.isFinite(params.testTimeout.progress)) {
        testSnapshot.progress = Number(params.testTimeout.progress);
      }
      if (params.testTimeout && Number.isFinite(params.testTimeout.remainingTime)) {
        testSnapshot.remainingTime = Number(params.testTimeout.remainingTime);
      }
      options.countdown.applyTestSnapshot(testSnapshot);
      return mode;
    }

    const snapshot = options.countdown.getSnapshot();
    if (mode === 'question') {
      const duration = options.getMainTimeoutMs({
        ...params.context,
        deliverySettings: params.deliverySettings,
      });
      const resetCounter = Number.isFinite(Number(params.context.timeoutResetCounter))
        ? Number(params.context.timeoutResetCounter)
        : 0;
      const startTimestamp = getQuestionTimeoutStartMs(params.context, now);
      if (
        snapshot.modeState !== mode ||
        snapshot.duration !== duration ||
        resetCounter !== lastTimeoutResetCounter ||
        snapshot.start !== startTimestamp
      ) {
        lastTimeoutResetCounter = resetCounter;
        options.countdown.start(duration, mode, startTimestamp);
      }
      return mode;
    }

    if (mode === 'feedback') {
      let duration: number;
      let startTimestamp: number;
      if (params.state?.matches?.('presenting.readyPrompt')) {
        duration = parseInt(String(params.deliverySettings.readyPromptStringDisplayTime), 10) || 0;
        startTimestamp = snapshot.modeState === mode && snapshot.duration === duration && snapshot.start
          ? snapshot.start
          : now();
      } else {
        duration = options.getFeedbackTimeoutMs({
          ...params.context,
          deliverySettings: params.deliverySettings,
        });
        startTimestamp = getFeedbackTimeoutStartMs(params.context, now);
      }
      if (snapshot.modeState !== mode || snapshot.duration !== duration || snapshot.start !== startTimestamp) {
        options.countdown.start(duration, mode, startTimestamp);
      }
      return mode;
    }

    if (snapshot.modeState !== 'none') {
      options.countdown.clear();
    }
    return mode;
  }

  return {
    resolveMode,
    sync,
    stopInterval: options.countdown.stopInterval,
  };
}

export function createDisplayTimeoutController(options: DisplayTimeoutControllerOptions = {}) {
  const now = options.now || Date.now;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const onTick = options.onTick || (() => undefined);
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let mountMs = now();
  let nowMs = mountMs;
  let autoAdvanced = false;
  let lastScopeKey = '';

  function stopClock() {
    if (intervalHandle) {
      clearIntervalFn(intervalHandle);
      intervalHandle = null;
    }
  }

  function publishTick() {
    onTick();
  }

  return {
    startClock() {
      stopClock();
      mountMs = now();
      nowMs = mountMs;
      autoAdvanced = false;
      lastScopeKey = '';
      publishTick();
      intervalHandle = setIntervalFn(() => {
        nowMs = now();
        publishTick();
      }, 250);
    },
    stopClock,
    buildSnapshot(params: {
      deliverySettings: DisplayTimeoutDeliverySettings | null | undefined;
      currentUnitStartTime: unknown;
      currentTdfId: unknown;
      currentUnitNumber: unknown;
      continuingToNextUnit: boolean;
      testMode: boolean;
    }): DisplayTimeoutSnapshot {
      const snapshotParams = {
        ...params,
        displayTimeoutMountMs: mountMs,
        displayTimeoutNowMs: nowMs,
        autoAdvanced,
      };
      const snapshot = buildDisplayTimeoutSnapshot(snapshotParams);
      if (snapshot.scopeKey !== lastScopeKey) {
        lastScopeKey = snapshot.scopeKey;
        autoAdvanced = false;
        return buildDisplayTimeoutSnapshot({
          ...snapshotParams,
          autoAdvanced,
        });
      }
      return snapshot;
    },
    markAutoAdvanced() {
      autoAdvanced = true;
    },
  };
}
