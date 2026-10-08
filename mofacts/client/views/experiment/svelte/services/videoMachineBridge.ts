export interface VideoCheckpoints {
  readonly times?: unknown[];
  readonly questions?: unknown[];
  readonly rewindCheckpoints?: unknown[];
}

export interface VideoPlayerBridge {
  readonly getCurrentTime?: () => number;
  readonly logAction?: (action: string) => void;
  readonly resetCheckpointTo?: (index: number) => void;
  readonly resumeAfterQuestion?: () => void;
  readonly rewindTo?: (time: number) => void;
}

export interface VideoMachineBridgeDependencies {
  readonly getCurrentState: () => unknown;
  readonly getRewindOnIncorrectEnabled: () => boolean;
  readonly getVideoCheckpoints: () => VideoCheckpoints | null | undefined;
  readonly getVideoPlayer: () => VideoPlayerBridge | null | undefined;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly scheduleRetry: (callback: () => void, delayMs: number) => void;
  readonly stateMatches: (path: string) => boolean;
  readonly waitForDomUpdate: () => Promise<void>;
}


export interface VideoMachineBridge {
  readonly flushPendingResume: (reason: string) => Promise<void>;
  readonly handleVideoAnswer: (detail: { isCorrect?: unknown; checkpointIndex?: unknown }) => void;
  readonly hasPendingResume: () => boolean;
  readonly requestResume: (reason: string) => void;
}

export function getRewindCheckpointTimes(checkpoints: VideoCheckpoints | null | undefined): number[] {
  const source = Array.isArray(checkpoints?.rewindCheckpoints)
    ? checkpoints.rewindCheckpoints
    : checkpoints?.times;

  if (!Array.isArray(source)) {
    throw new Error('[ContentSurface] Video checkpoints missing rewind times');
  }

  return source
    .map((time, index) => {
      const parsed = Number(time);
      if (!Number.isFinite(parsed)) {
        throw new Error(`[ContentSurface] Video rewind checkpoint time at index ${index} is invalid`);
      }
      return parsed;
    })
    .sort((a, b) => a - b);
}

export function getCheckpointResetIndex(questionTimes: unknown[] | null | undefined, rewindTime: number): number {
  if (!Array.isArray(questionTimes)) {
    throw new Error('[ContentSurface] Video checkpoints missing question times');
  }
  const normalizedTimes = questionTimes.map((time, index) => {
    const parsed = Number(time);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[ContentSurface] Video question time at index ${index} is invalid`);
    }
    return parsed;
  });
  const nextCheckpointIndex = normalizedTimes.findIndex((time) => time >= (rewindTime - 0.001));
  return nextCheckpointIndex >= 0 ? nextCheckpointIndex : normalizedTimes.length;
}

export function createVideoMachineBridge(deps: VideoMachineBridgeDependencies): VideoMachineBridge {
  let pendingResume = false;
  let flushingResume = false;

  async function flushPendingResume(reason: string): Promise<void> {
    if (flushingResume || !pendingResume) {
      return;
    }

    flushingResume = true;
    await deps.waitForDomUpdate();
    flushingResume = false;

    if (!pendingResume) {
      return;
    }
    if (!deps.stateMatches('videoWaiting')) {
      deps.log(1, '[ContentSurface] Machine video resume command is pending outside videoWaiting', {
        reason,
        state: deps.getCurrentState(),
      });
      deps.scheduleRetry(() => {
        void flushPendingResume('retry-state');
      }, 50);
      return;
    }

    const videoPlayer = deps.getVideoPlayer();
    if (!videoPlayer || typeof videoPlayer.resumeAfterQuestion !== 'function') {
      deps.log(1, '[ContentSurface] Machine video resume command is pending before player is ready', {
        reason,
        hasVideoPlayer: !!videoPlayer,
      });
      deps.scheduleRetry(() => {
        void flushPendingResume('retry-player');
      }, 50);
      return;
    }

    pendingResume = false;
    videoPlayer.resumeAfterQuestion();
  }

  function handleVideoAnswer(detail: { isCorrect?: unknown; checkpointIndex?: unknown }): void {
    const { isCorrect, checkpointIndex } = detail || {};
    const videoCheckpoints = deps.getVideoCheckpoints();
    const videoPlayer = deps.getVideoPlayer();

    deps.log(2, '[VIDEO-REWIND-DEBUG] videoAnswerHandler received:', {
      isCorrect,
      checkpointIndex,
      rewindOnIncorrectEnabled: deps.getRewindOnIncorrectEnabled(),
      hasVideoCheckpoints: !!videoCheckpoints,
      hasVideoPlayer: !!videoPlayer,
      videoCheckpointsTimes: videoCheckpoints?.times,
      videoCheckpointsRewind: videoCheckpoints?.rewindCheckpoints,
    });

    if (isCorrect) {
      return;
    }

    if (!deps.getRewindOnIncorrectEnabled()) {
      deps.log(1, '[VIDEO-REWIND-DEBUG] rewindOnIncorrect disabled, skipping rewind');
      return;
    }
    if (!Number.isFinite(checkpointIndex)) {
      throw new Error('[ContentSurface] Video answer missing checkpoint index');
    }
    const numericCheckpointIndex = Number(checkpointIndex);
    if (!videoCheckpoints || !Array.isArray(videoCheckpoints.times)) {
      throw new Error('[ContentSurface] Video checkpoints not initialized');
    }
    if (!videoPlayer) {
      throw new Error('[ContentSurface] Video player missing for rewind');
    }

    const currentTime = videoPlayer.getCurrentTime?.() ?? 0;
    const currentQuestionTime = Number(videoCheckpoints.times[numericCheckpointIndex]);
    if (!Number.isFinite(currentQuestionTime)) {
      throw new Error('[ContentSurface] Video checkpoint time is invalid for rewind');
    }

    const checkpointTimes = [0, ...getRewindCheckpointTimes(videoCheckpoints)]
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b);
    let previousCheckpointTime = 0;
    for (const time of checkpointTimes) {
      if (time < (currentQuestionTime - 0.001)) {
        previousCheckpointTime = time;
      } else {
        break;
      }
    }

    const rewindTime = Math.max(0, previousCheckpointTime + 0.1);
    const rewindIndex = getCheckpointResetIndex(videoCheckpoints.times, rewindTime);
    deps.log(2, '[VIDEO-REWIND-DEBUG] Rewind calculation:', {
      currentTime,
      currentQuestionTime,
      previousCheckpointTime,
      rewindTime,
      rewindIndex,
      checkpointTimes,
    });

    if (typeof videoPlayer.resetCheckpointTo === 'function') {
      deps.log(2, '[VIDEO-REWIND-DEBUG] Calling resetCheckpointTo:', rewindIndex);
      videoPlayer.resetCheckpointTo(rewindIndex);
    } else {
      deps.log(1, '[VIDEO-REWIND-DEBUG] resetCheckpointTo is not a function');
    }
    if (typeof videoPlayer.rewindTo === 'function') {
      deps.log(2, '[VIDEO-REWIND-DEBUG] Calling rewindTo:', rewindTime);
      videoPlayer.rewindTo(rewindTime);
    } else {
      deps.log(1, '[VIDEO-REWIND-DEBUG] rewindTo is not a function');
    }
    if (typeof videoPlayer.logAction === 'function') {
      videoPlayer.logAction('rewind_to_checkpoint');
    }
  }

  return {
    flushPendingResume,
    handleVideoAnswer,
    hasPendingResume: () => pendingResume,
    requestResume: (reason) => {
      pendingResume = true;
      void flushPendingResume(reason);
    },
  };
}
