import { expect } from 'chai';
import { createContentSurfaceLifecycleRuntime } from './contentSurfaceLifecycleRuntime';
import type { ContentLaunchOrchestrationDeps } from './contentLaunchOrchestration';
import type { ContentRuntimeMachineSnapshot } from './contentRuntimeMachineRuntime';

function machineSnapshot(value: unknown): ContentRuntimeMachineSnapshot {
  return {
    value,
    context: {},
    matches: (state) => state === value,
  };
}

async function flushLaunchLifecycle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

function launchDeps(events: string[]): ContentLaunchOrchestrationDeps {
  return {
    initializeContent: async () => undefined,
    waitForContentReadiness: async () => true,
    getReadinessDependencies: () => ({
      getCurrentTdfUnit: () => ({}),
      getDeliverySettings: () => ({}),
      getVideoCheckpoints: () => null,
    }),
    buildReadinessDiagnostic: () => ({
      hasCurrentTdfUnit: true,
      hasDeliverySettings: true,
      hasVideoReadiness: true,
      isVideoUnit: false,
      currentTdfId: null,
      currentRootTdfId: null,
      currentStimuliSetId: null,
      currentUnitNumber: null,
      currentUnitName: null,
      currentContentLanguage: null,
      deliveryParamKeys: [],
    }),
    buildInitializeFailureDiagnostic: (error) => ({
      error,
      currentTdfName: null,
      currentTdfId: null,
      currentRootTdfId: null,
      currentStimuliSetId: null,
      currentUnitNumber: null,
      currentUnitName: null,
      clusterlist: null,
      stimuliCount: null,
    }),
    setFailureDiagnostic: () => undefined,
    log: () => undefined,
    routeInitializationFailure: () => undefined,
    setLaunchLoadingMessage: () => undefined,
    loadingContentMessage: 'Loading content...',
    markLaunchLoadingTiming: () => undefined,
    prepareRender: async () => {
      events.push('old-prepare-render');
    },
  };
}

function createHarness(overrides: Partial<{
  launchStatus: string;
  testMode: boolean;
  testPerformance: unknown;
  shouldStartReadyRuntime: boolean;
}> = {}) {
  const events: string[] = [];
  let sessionUnitModeVersion = 0;
  const options = {
    applyTestPerformance: () => events.push('apply-test-performance'),
    cleanupAudioRecorder: () => events.push('cleanup-audio'),
    clearDisplayTimeoutClock: () => events.push('display-clock:stop'),
    clearLearningProgressViewport: () => events.push('learning-progress:close'),
    clearTimeoutCountdown: () => events.push('timeout:stop'),
    completeCleanup: () => events.push('complete-cleanup'),
    failLaunch: (failure: unknown) => events.push(`launch:failed:${JSON.stringify(failure)}`),
    launch: async (deps: ContentLaunchOrchestrationDeps) => {
      events.push('launch');
      await deps.prepareRender();
      return { status: overrides.launchStatus || 'ready' };
    },
    launchDeps: launchDeps(events),
    lifecycle: {
      startReadyRuntime: () => events.push('runtime:start'),
      stop: () => events.push('runtime:stop'),
    },
    normalizeTestSnapshot: () => machineSnapshot('test'),
    setInitializedForRender: (value: boolean) => events.push(`initialized:${value}`),
    setSessionUnitModeVersion: (updater: (current: number) => number) => {
      sessionUnitModeVersion = updater(sessionUnitModeVersion);
      events.push(`mode-version:${sessionUnitModeVersion}`);
    },
    setState: (snapshot: ContentRuntimeMachineSnapshot) => events.push(`state:${String(snapshot.value)}`),
    shouldStartReadyRuntime: () => overrides.shouldStartReadyRuntime !== false,
    startDisplayTimeoutClock: () => events.push('display-clock:start'),
    stopStimDisplayTypeMapVersionSync: (reason: string) => events.push(`stim-sync:stop:${reason}`),
    testMode: () => overrides.testMode === true,
    testPerformance: () => overrides.testPerformance,
    testSnapshot: () => ({ value: 'fixture' }),
    waitForDomUpdate: async () => {
      events.push('tick');
    },
  };

  return {
    controller: createContentSurfaceLifecycleRuntime(options),
    events,
  };
}

describe('content surface lifecycle runtime', function() {
  it('seeds static tester state without launching the runtime', function() {
    const { controller, events } = createHarness({
      testMode: true,
      testPerformance: { totalTime: 1000 },
    });

    controller.mount();

    expect(events).to.deep.equal([
      'display-clock:start',
      'state:test',
      'apply-test-performance',
    ]);
  });

  it('launches, prepares render, and starts ready runtime', async function() {
    const { controller, events } = createHarness();

    controller.mount();
    await flushLaunchLifecycle();

    expect(events).to.deep.equal([
      'display-clock:start',
      'launch',
      'old-prepare-render',
      'mode-version:1',
      'initialized:true',
      'tick',
      'runtime:start',
    ]);
  });

  it('prepares a surface that owns its runtime without starting the shared machine', async function() {
    const harness = createHarness({ shouldStartReadyRuntime: false });

    harness.controller.mount();
    await flushLaunchLifecycle();

    expect(harness.events).to.include('initialized:true');
    expect(harness.events).not.to.include('runtime:start');
  });

  it('does not start runtime when launch does not reach ready', async function() {
    const { controller, events } = createHarness({ launchStatus: 'redirected' });

    controller.mount();
    await flushLaunchLifecycle();

    expect(events).to.deep.equal([
      'display-clock:start',
      'launch',
      'old-prepare-render',
      'mode-version:1',
      'initialized:true',
      'tick',
    ]);
  });

  it('projects an orchestration failure into the owning launch coordinator', async function() {
    const { controller, events } = createHarness({ launchStatus: 'failed' });

    controller.mount();
    await flushLaunchLifecycle();

    expect(events).to.include('launch:failed:{"status":"failed"}');
    expect(events).not.to.include('runtime:start');
  });

  it('stops runtime and non-test cleanup on unmount', function() {
    const { controller, events } = createHarness();

    controller.unmount();

    expect(events).to.deep.equal([
      'runtime:stop',
      'timeout:stop',
      'display-clock:stop',
      'stim-sync:stop:svelte card destroy',
      'complete-cleanup',
      'cleanup-audio',
      'learning-progress:close',
    ]);
  });

  it('skips destructive cleanup in test mode on unmount', function() {
    const { controller, events } = createHarness({ testMode: true });

    controller.unmount();

    expect(events).to.deep.equal([
      'runtime:stop',
      'timeout:stop',
      'display-clock:stop',
      'learning-progress:close',
    ]);
  });
});
