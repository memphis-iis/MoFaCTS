import type { VideoMachineBridge } from './videoMachineBridge';
import type { VideoSessionBridge } from './videoSessionBridge';
import type { VideoSessionRuntimeController } from './videoSessionRuntime';

type DetailEvent<T = unknown> = {
  detail?: T;
  preventDefault?: () => void;
};

export interface VideoEventRuntimeOptions {
  readonly getVideoPlayer: () => unknown;
  readonly machineBridge: VideoMachineBridge;
  readonly send: (event: { type: 'VIDEO_CONTINUE' }) => void;
  readonly sessionBridge: VideoSessionBridge;
  readonly sessionRuntime: VideoSessionRuntimeController;
  readonly stateMatches: (path: string) => boolean;
}

export function createVideoEventRuntime(options: VideoEventRuntimeOptions) {
  return {
    syncPendingResume(reason = 'reactive-ready'): void {
      if (
        options.machineBridge.hasPendingResume() &&
        options.getVideoPlayer() &&
        options.stateMatches('videoWaiting')
      ) {
        void options.machineBridge.flushPendingResume(reason);
      }
    },
    handleCheckpoint(event: DetailEvent<Record<string, unknown>>): void {
      options.sessionBridge.handleCheckpoint(event.detail || {});
    },
    handleEnded(): void {
      options.sessionBridge.handleEnded();
    },
    handleReady(showVideoInstructionOverlay: boolean): void {
      options.sessionRuntime.handleVideoReady(showVideoInstructionOverlay);
    },
    handleInstructionContinue(event?: DetailEvent | null): void {
      options.sessionRuntime.handleInstructionContinue(event);
    },
    handleContinue(): void {
      options.send({ type: 'VIDEO_CONTINUE' });
    },
  };
}
