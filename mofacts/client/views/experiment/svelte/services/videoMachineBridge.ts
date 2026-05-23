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
  readonly addCompletedVideoQuestion: (questionIndex: number) => void;
  readonly getCompletedVideoQuestions: () => ReadonlySet<number>;
  readonly getCurrentState: () => unknown;
  readonly getRepeatQuestionsSinceCheckpointEnabled: () => boolean;
  readonly getRewindOnIncorrectEnabled: () => boolean;
  readonly getVideoCheckpoints: () => VideoCheckpoints | null | undefined;
  readonly getVideoPlayer: () => VideoPlayerBridge | null | undefined;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly scheduleRetry: (callback: () => void, delayMs: number) => void;
  readonly setQuestionsToRepeat: (questions: RepeatedVideoQuestion[]) => void;
  readonly stateMatches: (path: string) => boolean;
  readonly waitForDomUpdate: () => Promise<void>;
}

export interface RepeatedVideoQuestion {
  readonly index: number;
  readonly time: number;
  readonly question: number;
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
    throw new Error('[CardScreen] Video checkpoints missing rewind times');
  }

  return source
    .map((time, index) => {
      const parsed = Number(time);
      if (!Number.isFinite(parsed)) {
        throw new Error(`[CardScreen] Video rewind checkpoint time at index ${index} is invalid`);
      }
      return parsed;
    })
    .sort((a, b) => a - b);
}

export function getCheckpointResetIndex(questionTimes: unknown[] | null | undefined, rewindTime: number): number {
  if (!Array.isArray(questionTimes)) {
    throw new Error('[CardScreen] Video checkpoints missing question times');
  }
  const normalizedTimes = questionTimes.map((time, index) => {
    const parsed = Number(time);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[CardScreen] Video question time at index ${index} is invalid`);
    }
    return parsed;
  });
  const nextCheckpointIndex = normalizedTimes.findIndex((time) => time >= (rewindTime - 0.001));
  return nextCheckpointIndex >= 0 ? nextCheckpointIndex : normalizedTimes.length;
}

export function buildQuestionsToRepeat(params: {
  readonly checkpoints: VideoCheckpoints | null | undefined;
  readonly completedVideoQuestions: ReadonlySet<number>;
  readonly checkpointTime: number;
  readonly currentTime: number;
}): RepeatedVideoQuestion[] {
  if (!Array.isArray(params.checkpoints?.times)) {
    return [];
  }

  const questionsToRepeat: RepeatedVideoQuestion[] = [];
  const times = params.checkpoints.times;
  const questions = params.checkpoints.questions || [];

  for (let i = 0; i < times.length; i++) {
    const time = Number(times[i]);
    if (!Number.isFinite(time)) continue;
    if (time >= params.checkpointTime && time <= params.currentTime) {
      const questionIndex = Number(questions[i]);
      if (!Number.isFinite(questionIndex)) continue;
      if (!params.completedVideoQuestions.has(questionIndex)) {
        questionsToRepeat.push({
          index: i,
          time,
          question: questionIndex,
        });
      }
    }
  }

  return questionsToRepeat;
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
      deps.log(1, '[CardScreen] Machine video resume command is pending outside videoWaiting', {
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
      deps.log(1, '[CardScreen] Machine video resume command is pending before player is ready', {
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

    const questionIndex = Number.isFinite(checkpointIndex)
      ? videoCheckpoints?.questions?.[checkpointIndex as number]
      : undefined;
    if (isCorrect && Number.isFinite(questionIndex)) {
      deps.addCompletedVideoQuestion(questionIndex as number);
      deps.log(2, '[VIDEO-REWIND-DEBUG] Correct answer, marking completed:', questionIndex);
      return;
    }

    if (!deps.getRewindOnIncorrectEnabled()) {
      deps.log(1, '[VIDEO-REWIND-DEBUG] rewindOnIncorrect disabled, skipping rewind');
      return;
    }
    if (!Number.isFinite(checkpointIndex)) {
      throw new Error('[CardScreen] Video answer missing checkpoint index');
    }
    const numericCheckpointIndex = Number(checkpointIndex);
    if (!videoCheckpoints || !Array.isArray(videoCheckpoints.times)) {
      throw new Error('[CardScreen] Video checkpoints not initialized');
    }
    if (!videoPlayer) {
      throw new Error('[CardScreen] Video player missing for rewind');
    }

    const currentTime = videoPlayer.getCurrentTime?.() ?? 0;
    const currentQuestionTime = Number(videoCheckpoints.times[numericCheckpointIndex]);
    if (!Number.isFinite(currentQuestionTime)) {
      throw new Error('[CardScreen] Video checkpoint time is invalid for rewind');
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

    if (deps.getRepeatQuestionsSinceCheckpointEnabled()) {
      deps.setQuestionsToRepeat(buildQuestionsToRepeat({
        checkpoints: videoCheckpoints,
        completedVideoQuestions: deps.getCompletedVideoQuestions(),
        checkpointTime: rewindTime,
        currentTime,
      }));
    }

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
