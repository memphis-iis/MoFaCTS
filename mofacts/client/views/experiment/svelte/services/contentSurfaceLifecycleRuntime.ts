import type { ContentLaunchOrchestrationDeps } from './contentLaunchOrchestration';
import type { ContentRuntimeMachineSnapshot } from './contentRuntimeMachineRuntime';
import type { CardRuntimeLifecycleController } from './cardRuntimeLifecycle';

export interface ContentSurfaceLifecycleRuntimeOptions {
  readonly applyTestPerformance: () => void;
  readonly cleanupAudioRecorder: () => void;
  readonly clearDisplayTimeoutClock: () => void;
  readonly clearLearningProgressViewport: () => void;
  readonly clearTimeoutCountdown: () => void;
  readonly completeCleanup: () => void;
  readonly failLaunch: (failure: unknown) => void;
  readonly launch: (deps: ContentLaunchOrchestrationDeps, isCurrent: () => boolean) => Promise<{ status: string }>;
  readonly launchDeps: ContentLaunchOrchestrationDeps;
  readonly lifecycle: CardRuntimeLifecycleController;
  readonly normalizeTestSnapshot: (snapshot: unknown) => ContentRuntimeMachineSnapshot;
  readonly setInitializedForRender: (value: boolean) => void;
  readonly setSessionUnitModeVersion: (updater: (current: number) => number) => void;
  readonly setState: (snapshot: ContentRuntimeMachineSnapshot) => void;
  readonly shouldStartReadyRuntime: () => boolean;
  readonly startDisplayTimeoutClock: () => void;
  readonly stopStimDisplayTypeMapVersionSync: (reason: string) => void;
  readonly testMode: () => boolean;
  readonly testPerformance: () => unknown;
  readonly testSnapshot: () => unknown;
  readonly waitForDomUpdate: () => Promise<void>;
}

export function createContentSurfaceLifecycleRuntime(options: ContentSurfaceLifecycleRuntimeOptions) {
  let generation = 0;
  async function prepareRender(isCurrent: () => boolean): Promise<void> {
    if (!isCurrent()) return;
    await options.launchDeps.prepareRender();
    if (!isCurrent()) return;
    options.setSessionUnitModeVersion((current) => current + 1);
    options.setInitializedForRender(true);
    await options.waitForDomUpdate();
  }

  return {
    mount(): void {
      const currentGeneration = ++generation;
      const isCurrent = () => currentGeneration === generation;
      options.startDisplayTimeoutClock();

      if (options.testMode()) {
        options.setState(options.normalizeTestSnapshot(options.testSnapshot()));
        if (options.testPerformance()) {
          options.applyTestPerformance();
        }
        return;
      }

      void (async () => {
        const launchResult = await options.launch({
          ...options.launchDeps,
          prepareRender: () => prepareRender(isCurrent),
        }, isCurrent);
        if (!isCurrent()) return;
        if (launchResult.status === 'failed') {
          options.failLaunch(launchResult);
          return;
        }
        if (launchResult.status !== 'ready') {
          return;
        }

        if (options.shouldStartReadyRuntime()) {
          options.lifecycle.startReadyRuntime();
        }
      })();
    },
    unmount(): void {
      // Revoke this screen's pending launch before any cleanup changes shared state.
      generation++;
      options.lifecycle.stop();
      options.clearTimeoutCountdown();
      options.clearDisplayTimeoutClock();
      if (!options.testMode()) {
        options.stopStimDisplayTypeMapVersionSync('svelte card destroy');
        options.completeCleanup();
        options.cleanupAudioRecorder();
      }
      options.clearLearningProgressViewport();
    },
  };
}
