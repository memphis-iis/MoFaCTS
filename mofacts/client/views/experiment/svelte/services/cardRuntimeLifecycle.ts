export type Startable = {
  start: () => void;
};

export type Stoppable = {
  stop: () => void;
};

export type CardRuntimeLifecycleController = {
  startReadyRuntime: () => void;
  stop: () => void;
};

export function createCardRuntimeLifecycleController({
  startRuntimeWindowEvents,
  machineRuntime,
  createReactiveTrackers,
}: {
  startRuntimeWindowEvents: () => Stoppable | null;
  machineRuntime: Startable & Stoppable;
  createReactiveTrackers: () => (Startable & Stoppable);
}): CardRuntimeLifecycleController {
  let runtimeWindowEvents: Stoppable | null = null;
  let reactiveTrackers: (Startable & Stoppable) | null = null;

  function stop(): void {
    if (runtimeWindowEvents) {
      runtimeWindowEvents.stop();
      runtimeWindowEvents = null;
    }

    machineRuntime.stop();

    if (reactiveTrackers) {
      reactiveTrackers.stop();
      reactiveTrackers = null;
    }
  }

  function startReadyRuntime(): void {
    stop();
    runtimeWindowEvents = startRuntimeWindowEvents();
    machineRuntime.start();
    reactiveTrackers = createReactiveTrackers();
    reactiveTrackers.start();
  }

  return {
    startReadyRuntime,
    stop,
  };
}
