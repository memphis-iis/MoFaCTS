import type { CardLaunchOrchestrationDeps } from './cardLaunchOrchestration';
import type { ContentRuntimeMachineSnapshot } from './contentRuntimeMachineRuntime';
import type { CardRuntimeLifecycleController } from './cardRuntimeLifecycle';

export interface ContentSurfaceLifecycleRuntimeOptions {
  readonly applyTestPerformance: () => void;
  readonly cleanupAudioRecorder: () => void;
  readonly clearDisplayTimeoutClock: () => void;
  readonly clearLearningProgressViewport: () => void;
  readonly clearTimeoutCountdown: () => void;
  readonly completeCleanup: () => void;
  readonly launch: (deps: CardLaunchOrchestrationDeps) => Promise<{ status: string }>;
  readonly launchDeps: CardLaunchOrchestrationDeps;
  readonly lifecycle: CardRuntimeLifecycleController;
  readonly normalizeTestSnapshot: (snapshot: unknown) => ContentRuntimeMachineSnapshot;
  readonly setInitializedForRender: (value: boolean) => void;
  readonly setSessionUnitModeVersion: (updater: (current: number) => number) => void;
  readonly setState: (snapshot: ContentRuntimeMachineSnapshot) => void;
  readonly startDisplayTimeoutClock: () => void;
  readonly stopStimDisplayTypeMapVersionSync: (reason: string) => void;
  readonly testMode: () => boolean;
  readonly testPerformance: () => unknown;
  readonly testSnapshot: () => unknown;
  readonly waitForDomUpdate: () => Promise<void>;
}

export function createContentSurfaceLifecycleRuntime(options: ContentSurfaceLifecycleRuntimeOptions) {
  async function prepareRender(): Promise<void> {
    options.setSessionUnitModeVersion((current) => current + 1);
    options.setInitializedForRender(true);
    await options.waitForDomUpdate();
  }

  return {
    mount(): void {
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
          prepareRender,
        });
        if (launchResult.status !== 'ready') {
          return;
        }

        options.lifecycle.startReadyRuntime();
      })();
    },
    unmount(): void {
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
