import type { VideoCheckpoints } from './videoMachineBridge';

export type VideoSessionEvent =
  | { type: 'VIDEO_CHECKPOINT'; checkpointIndex: number; questionIndex: number }
  | { type: 'VIDEO_ENDED' };

export interface VideoSessionPlayer {
  recoverRejectedCheckpoint?: () => void;
  getPlayer?: () => {
    muted?: boolean;
    volume?: number;
  } | null;
}

export interface VideoSessionBridgeDependencies {
  readonly getCurrentState: () => unknown;
  readonly getVideoCheckpoints: () => VideoCheckpoints | null | undefined;
  readonly getVideoPlayer: () => VideoSessionPlayer | null | undefined;
  readonly isTestMode: () => boolean;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly send: (event: VideoSessionEvent) => void;
  readonly setSessionValue: (key: 'engineIndices' | 'videoResumeAnchor', value: unknown) => void;
  readonly stateMatches: (path: string) => boolean;
}

export interface VideoSessionBridge {
  readonly handleCheckpoint: (detail: { index?: unknown; questionIndex?: unknown }) => boolean;
  readonly handleEnded: () => void;
  readonly prepareReadyPlayer: (showVideoInstructionOverlay: boolean) => boolean;
}

export function createVideoSessionBridge(deps: VideoSessionBridgeDependencies): VideoSessionBridge {
  function handleCheckpoint(detail: { index?: unknown; questionIndex?: unknown }): boolean {
    const { index, questionIndex } = detail || {};
    if (!deps.stateMatches('videoWaiting')) {
      deps.log(1, '[CardScreen] Rejected video checkpoint outside videoWaiting', {
        state: deps.getCurrentState(),
        index,
        questionIndex,
      });
      const videoPlayer = deps.getVideoPlayer();
      if (videoPlayer && typeof videoPlayer.recoverRejectedCheckpoint === 'function') {
        videoPlayer.recoverRejectedCheckpoint();
      }
      return false;
    }
    if (!Number.isFinite(questionIndex)) {
      throw new Error('[CardScreen] Video checkpoint missing question index');
    }
    const videoCheckpoints = deps.getVideoCheckpoints();
    const checkpointTime = Number(videoCheckpoints?.times?.[index as number]);
    if (!Number.isFinite(checkpointTime)) {
      throw new Error('[CardScreen] Video checkpoint missing checkpoint time');
    }

    deps.setSessionValue('engineIndices', { clusterIndex: questionIndex, stimIndex: 0 });
    if (!deps.isTestMode()) {
      deps.setSessionValue('videoResumeAnchor', {
        resumeStartTime: checkpointTime,
        resumeCheckpointIndex: index,
      });
    }
    deps.send({
      type: 'VIDEO_CHECKPOINT',
      checkpointIndex: index as number,
      questionIndex: questionIndex as number,
    });
    return true;
  }

  function handleEnded(): void {
    deps.setSessionValue('engineIndices', undefined);
    deps.send({ type: 'VIDEO_ENDED' });
  }

  function prepareReadyPlayer(showVideoInstructionOverlay: boolean): boolean {
    if (!deps.stateMatches('videoWaiting') || showVideoInstructionOverlay) {
      return false;
    }
    const videoPlayer = deps.getVideoPlayer();
    if (!videoPlayer) {
      return false;
    }
    const player = typeof videoPlayer.getPlayer === 'function'
      ? videoPlayer.getPlayer()
      : null;
    if (!player) {
      return false;
    }
    player.muted = false;
    const currentVolume = Number(player.volume);
    player.volume = Number.isFinite(currentVolume) && currentVolume > 0
      ? currentVolume
      : 1;
    return true;
  }

  return {
    handleCheckpoint,
    handleEnded,
    prepareReadyPlayer,
  };
}
