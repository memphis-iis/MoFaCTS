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
};

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
}: {
  machine: unknown;
  createActor: (machine: unknown) => ContentRuntimeMachineActor;
  setState: (snapshot: ContentRuntimeMachineSnapshot) => void;
  sendStartEvent: (event: unknown) => void;
  getStartEvent: () => unknown;
  log: (level: number, message: string, details?: unknown) => void;
}): ContentRuntimeMachineRuntimeController {
  let actor: ContentRuntimeMachineActor | null = null;
  let subscription: { unsubscribe: () => void } | null = null;
  let startDispatched = false;

  function start(): void {
    if (!actor) {
      actor = createActor(machine);
      startDispatched = false;
    }

    setState(getContentRuntimeMachineSnapshot(actor, log));

    if (!subscription && typeof actor.subscribe === 'function') {
      subscription = actor.subscribe((snapshot) => {
        setState(snapshot);
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

  return {
    getActor: () => actor,
    start,
    stop,
  };
}
