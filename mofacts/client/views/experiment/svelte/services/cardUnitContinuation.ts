export interface CardUnitContinuationSnapshot {
  readonly continuing: boolean;
}

export interface CardUnitContinuationControllerOptions {
  readonly continueUnit: (reason: string) => Promise<void>;
  readonly isTestMode: () => boolean;
  readonly log?: (level: number, ...args: unknown[]) => void;
  readonly onUpdate?: (snapshot: CardUnitContinuationSnapshot) => void;
}

export async function continueToNextRuntimeUnit(reason: string): Promise<void> {
  const { unitIsFinished } = await import('./unitProgression');
  await unitIsFinished(reason);
}

function cloneSnapshot(snapshot: CardUnitContinuationSnapshot): CardUnitContinuationSnapshot {
  return { ...snapshot };
}

export function createCardUnitContinuationController(
  options: CardUnitContinuationControllerOptions,
) {
  const log = options.log || (() => undefined);
  const onUpdate = options.onUpdate || (() => undefined);
  let snapshot: CardUnitContinuationSnapshot = {
    continuing: false,
  };

  function publish() {
    onUpdate(cloneSnapshot(snapshot));
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    async forceAdvanceToNextUnit(reason: string): Promise<boolean> {
      if (options.isTestMode() || snapshot.continuing) {
        return false;
      }

      snapshot = {
        continuing: true,
      };
      publish();

      try {
        await options.continueUnit(reason);
        return true;
      } catch (error) {
        snapshot = {
          continuing: false,
        };
        publish();
        log(1, '[CardScreen] Failed to continue to next unit:', error);
        return false;
      }
    },
  };
}
