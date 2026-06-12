export interface VideoInstructionPlayer {
  play?: () => void | Promise<unknown>;
}

export interface VideoSessionRuntimeControllerDependencies {
  readonly getCurrentUnitNumber: () => unknown;
  readonly getVideoInstructionsShownAt: () => number;
  readonly getVideoPlayer: () => VideoInstructionPlayer | null | undefined;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly now: () => number;
  readonly persistInstructionState: (params: { currentUnitNumber: number }) => Promise<unknown>;
  readonly prepareReadyPlayer: (showVideoInstructionOverlay: boolean) => void;
  readonly recordInstructionContinue: (shownAt: number) => Promise<unknown>;
  readonly setSessionValue: (key: 'curUnitInstructionsSeen' | 'fromInstructions', value: unknown) => void;
  readonly setVideoInstructionDismissed: (value: boolean) => void;
  readonly setVideoInstructionStartBlocked: (value: boolean) => void;
  readonly setVideoPlayerReady: (value: boolean) => void;
  readonly flushPendingResume: (reason: string) => void | Promise<unknown>;
}

export interface VideoSessionRuntimeController {
  readonly handleInstructionContinue: (event?: PreventableEvent | null) => boolean;
  readonly handleVideoReady: (showVideoInstructionOverlay: boolean) => void;
  readonly markInstructionsContinued: () => void;
}

interface PreventableEvent {
  preventDefault?: () => void;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as Promise<unknown>).then === 'function');
}

function resolveUnitNumber(value: unknown): number {
  const unitNumber = Number(value);
  return Number.isFinite(unitNumber) ? unitNumber : 0;
}

function errorMessage(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

export function createVideoSessionRuntimeController(
  deps: VideoSessionRuntimeControllerDependencies
): VideoSessionRuntimeController {
  function markInstructionsContinued() {
    deps.setVideoInstructionDismissed(true);
    deps.setVideoInstructionStartBlocked(false);
    deps.setSessionValue('curUnitInstructionsSeen', true);
    deps.setSessionValue('fromInstructions', true);

    const currentUnitNumber = resolveUnitNumber(deps.getCurrentUnitNumber());
    void deps.recordInstructionContinue(deps.getVideoInstructionsShownAt() || deps.now()).catch((error) => {
      deps.log(1, '[CardScreen] Failed to record video instructions continue:', error);
    });
    void deps.persistInstructionState({ currentUnitNumber }).catch((error) => {
      deps.log(1, '[CardScreen] Failed to persist video instructions state:', error);
    });
  }

  function handleVideoReady(showVideoInstructionOverlay: boolean) {
    deps.setVideoPlayerReady(true);
    void deps.flushPendingResume('video-ready');
    deps.prepareReadyPlayer(showVideoInstructionOverlay);
  }

  function handleInstructionContinue(event?: PreventableEvent | null): boolean {
    event?.preventDefault?.();

    const videoPlayer = deps.getVideoPlayer();
    if (!videoPlayer || typeof videoPlayer.play !== 'function') {
      deps.setVideoInstructionStartBlocked(true);
      deps.log(1, '[CardScreen] Video instructions continue clicked before player was ready');
      return false;
    }

    deps.setVideoInstructionStartBlocked(false);
    let playResult: void | Promise<unknown>;
    try {
      playResult = videoPlayer.play();
    } catch (error) {
      deps.setVideoInstructionStartBlocked(true);
      deps.log(1, '[CardScreen] Video start from instructions threw:', errorMessage(error));
      return false;
    }

    if (isPromiseLike(playResult)) {
      playResult
        .then(() => {
          markInstructionsContinued();
        })
        .catch((error) => {
          deps.setVideoInstructionStartBlocked(true);
          deps.log(1, '[CardScreen] Video start from instructions was blocked:', errorMessage(error));
        });
      return true;
    }

    markInstructionsContinued();
    return true;
  }

  return {
    handleInstructionContinue,
    handleVideoReady,
    markInstructionsContinued,
  };
}
