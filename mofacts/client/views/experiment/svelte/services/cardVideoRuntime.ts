import {
  resolveVideoPlaybackPolicyForUnit,
  type VideoTdfUnitLike,
} from './videoCardInit';
import type { VideoCheckpoints } from './videoMachineBridge';

interface StateMatcher {
  matches?: (path: string) => boolean;
}

export interface CardVideoRuntimeSnapshot {
  readonly canAcceptCheckpoint: boolean;
  readonly checkpointGateState: string;
  readonly preventScrubbingEnabled: boolean;
  readonly questionIndices: unknown[];
  readonly questionTimes: unknown[];
  readonly repeatQuestionsSinceCheckpointEnabled: boolean;
  readonly resumeCheckpointIndex: unknown;
  readonly resumeStartTime: unknown;
  readonly rewindOnIncorrectEnabled: boolean;
  readonly videoResumeAnchor: Record<string, unknown> | null;
}

function normalizeResumeAnchor(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

export function buildCardVideoRuntimeSnapshot(params: {
  readonly currentState: unknown;
  readonly currentTdfUnit: VideoTdfUnitLike | null | undefined;
  readonly getVideoResumeAnchor: () => unknown;
  readonly state: StateMatcher | null | undefined;
  readonly videoCheckpoints: VideoCheckpoints | null | undefined;
}): CardVideoRuntimeSnapshot {
  const videoResumeAnchor = normalizeResumeAnchor(params.getVideoResumeAnchor());
  const videoPlaybackPolicy = resolveVideoPlaybackPolicyForUnit(params.currentTdfUnit);

  return {
    canAcceptCheckpoint: Boolean(params.state?.matches?.('videoWaiting')),
    checkpointGateState: JSON.stringify(params.currentState),
    preventScrubbingEnabled: videoPlaybackPolicy.preventScrubbing,
    questionIndices: Array.isArray(params.videoCheckpoints?.questions)
      ? params.videoCheckpoints.questions
      : [],
    questionTimes: Array.isArray(params.videoCheckpoints?.times)
      ? params.videoCheckpoints.times
      : [],
    repeatQuestionsSinceCheckpointEnabled: videoPlaybackPolicy.repeatQuestionsSinceCheckpoint,
    resumeCheckpointIndex: videoResumeAnchor?.resumeCheckpointIndex,
    resumeStartTime: videoResumeAnchor?.resumeStartTime,
    rewindOnIncorrectEnabled: videoPlaybackPolicy.rewindOnIncorrect,
    videoResumeAnchor,
  };
}

export function createCompletedVideoQuestionsStore() {
  let completedVideoQuestions = new Set<number>();

  return {
    add(questionIndex: number): void {
      completedVideoQuestions.add(questionIndex);
    },
    get(): ReadonlySet<number> {
      return completedVideoQuestions;
    },
    reset(): void {
      completedVideoQuestions = new Set();
    },
  };
}
