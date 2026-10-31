export type ContentRuntimeMachineSnapshot = {
  value: unknown;
  context: Record<string, unknown>;
  matches: (state: string) => boolean;
};

export type ContentRuntimeMachineActor = {
  getSnapshot?: () => ContentRuntimeMachineSnapshot;
  send?: (event: unknown) => void;
  start?: () => void;
  stop?: () => void;
  subscribe?: (handler: (snapshot: ContentRuntimeMachineSnapshot) => void) => { unsubscribe: () => void };
};

export type ContentRuntimeMachineRuntimeController = {
  getActor: () => ContentRuntimeMachineActor | null;
  start: () => void;
  stop: () => void;
  prepareToLeave: () => Promise<void>;
};

let activeRuntime: ContentRuntimeMachineRuntimeController | null = null;

export function registerActiveContentRuntimeForNavigation(runtime: ContentRuntimeMachineRuntimeController): () => void {
  if (activeRuntime && activeRuntime !== runtime) {
    throw new Error('Another learner runtime already owns practice navigation');
  }
  activeRuntime = runtime;
  return () => { if (activeRuntime === runtime) activeRuntime = null; };
}

/** Other surfaces have their own runtime; only the mounted shared machine registers here. */
export async function prepareActiveContentRuntimeForNavigation(): Promise<void> {
  await activeRuntime?.prepareToLeave();
}

export function getInitialContentRuntimeMachineSnapshot(): ContentRuntimeMachineSnapshot {
  return {
    value: 'idle',
    context: {},
    matches: (state) => state === 'idle',
  };
}

export function getContentRuntimeMachineSnapshot(
  actor: ContentRuntimeMachineActor | null,
  log: (level: number, message: string, details?: unknown) => void,
): ContentRuntimeMachineSnapshot {
  if (!actor || typeof actor.getSnapshot !== 'function') {
    return getInitialContentRuntimeMachineSnapshot();
  }

  try {
    return actor.getSnapshot();
  } catch (error) {
    log(1, '[ContentSurface] Failed to read actor snapshot, using initial state', error);
    return getInitialContentRuntimeMachineSnapshot();
  }
}

export function createContentRuntimeMachineRuntimeController({
  machine,
  createActor,
  setState,
  sendStartEvent,
  getStartEvent,
  log,
  onRuntimeError,
}: {
  machine: unknown;
  createActor: (machine: unknown) => ContentRuntimeMachineActor;
  setState: (snapshot: ContentRuntimeMachineSnapshot) => void;
  sendStartEvent: (event: unknown) => void;
  getStartEvent: () => unknown;
  log: (level: number, message: string, details?: unknown) => void;
  onRuntimeError?: () => void;
}): ContentRuntimeMachineRuntimeController {
  let actor: ContentRuntimeMachineActor | null = null;
  let subscription: { unsubscribe: () => void } | null = null;
  let startDispatched = false;
  let leaving: Promise<void> | null = null;
  let cancelLeave: (() => void) | null = null;
  let leaveFailure: Error | null = null;

  function prepareToLeave(): Promise<void> {
    if (leaving) return leaving;
    if (leaveFailure) return Promise.reject(leaveFailure);
    if (!actor) return Promise.resolve();
    if (!actor.getSnapshot || !actor.subscribe || !actor.send) {
      return Promise.reject(new Error('Active learner runtime cannot acknowledge its pending trial'));
    }
    const initial = actor.getSnapshot();
    if (initial.matches('navigationReady') || initial.matches('error')) return Promise.resolve();
    const currentActor = actor;
    leaving = new Promise<void>((resolve, reject) => {
      let leaveSubscription: { unsubscribe: () => void } | undefined;
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        leaveSubscription?.unsubscribe();
        cancelLeave = null;
        if (error) {
          leaveFailure = error;
          reject(error);
        } else resolve();
      };
      cancelLeave = () => finish(new Error('Learner runtime stopped before its trial was saved'));
      const check = (snapshot: ContentRuntimeMachineSnapshot) => {
        if (snapshot.matches('error')) {
          finish(new Error('The accepted trial could not be saved'));
        } else if (snapshot.matches('navigationReady')) {
          // History, resume state and engine update have all completed; no next trial starts.
          finish();
        }
      };
      leaveSubscription = currentActor.subscribe!(check);
      if (finished) leaveSubscription.unsubscribe();
      else {
        currentActor.send!({ type: 'LEAVE_REQUESTED' });
        check(currentActor.getSnapshot!());
      }
    }).finally(() => { leaving = null; });
    return leaving;
  }

  function start(): void {
    if (!actor) {
      actor = createActor(machine);
      startDispatched = false;
    }

    setState(getContentRuntimeMachineSnapshot(actor, log));

    if (!subscription && typeof actor.subscribe === 'function') {
      subscription = actor.subscribe((snapshot) => {
        setState(snapshot);
        if (snapshot.matches('error')) onRuntimeError?.();
        if (!startDispatched && snapshot?.matches?.('idle.ready')) {
          startDispatched = true;
          sendStartEvent(getStartEvent());
        }
      });
    }

    if (typeof actor.start === 'function') {
      actor.start();
    }
  }

  function stop(): void {
    cancelLeave?.();
    leaveFailure = null;
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
    subscription = null;

    if (actor && typeof actor.stop === 'function') {
      actor.stop();
    }
    actor = null;
    startDispatched = false;
  }

  const controller = {
    getActor: () => actor,
    start,
    stop,
    prepareToLeave,
  };
  return controller;
}
