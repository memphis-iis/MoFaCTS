export type CardMachineSnapshot = {
  value: unknown;
  context: Record<string, unknown>;
  matches: (state: string) => boolean;
};

export type CardMachineActor = {
  getSnapshot?: () => CardMachineSnapshot;
  send?: (event: unknown) => void;
  start?: () => void;
  stop?: () => void;
  subscribe?: (handler: (snapshot: CardMachineSnapshot) => void) => { unsubscribe: () => void };
};

export type CardMachineRuntimeController = {
  getActor: () => CardMachineActor | null;
  start: () => void;
  stop: () => void;
};

export function getInitialCardMachineSnapshot(): CardMachineSnapshot {
  return {
    value: 'idle',
    context: {},
    matches: (state) => state === 'idle',
  };
}

export function getCardMachineSnapshot(
  actor: CardMachineActor | null,
  log: (level: number, message: string, details?: unknown) => void,
): CardMachineSnapshot {
  if (!actor || typeof actor.getSnapshot !== 'function') {
    return getInitialCardMachineSnapshot();
  }

  try {
    return actor.getSnapshot();
  } catch (error) {
    log(1, '[CardScreen] Failed to read actor snapshot, using initial state', error);
    return getInitialCardMachineSnapshot();
  }
}

export function createCardMachineRuntimeController({
  machine,
  createActor,
  setState,
  sendStartEvent,
  startEvent,
  log,
}: {
  machine: unknown;
  createActor: (machine: unknown) => CardMachineActor;
  setState: (snapshot: CardMachineSnapshot) => void;
  sendStartEvent: (event: unknown) => void;
  startEvent: unknown;
  log: (level: number, message: string, details?: unknown) => void;
}): CardMachineRuntimeController {
  let actor: CardMachineActor | null = null;
  let subscription: { unsubscribe: () => void } | null = null;
  let startDispatched = false;

  function start(): void {
    if (!actor) {
      actor = createActor(machine);
      startDispatched = false;
    }

    setState(getCardMachineSnapshot(actor, log));

    if (!subscription && typeof actor.subscribe === 'function') {
      subscription = actor.subscribe((snapshot) => {
        setState(snapshot);
        if (!startDispatched && snapshot?.matches?.('idle.ready')) {
          startDispatched = true;
          sendStartEvent(startEvent);
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
