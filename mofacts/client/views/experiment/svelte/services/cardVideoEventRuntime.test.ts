import { expect } from 'chai';
import { createCardVideoEventRuntime } from './cardVideoEventRuntime';
import type { VideoMachineBridge } from './videoMachineBridge';
import type { VideoSessionBridge } from './videoSessionBridge';
import type { VideoSessionRuntimeController } from './videoSessionRuntime';

function createHarness(options: {
  pendingResume?: boolean;
  player?: unknown;
  videoWaiting?: boolean;
} = {}) {
  const calls: string[] = [];
  const checkpoints: unknown[] = [];
  const sent: unknown[] = [];
  const machineBridge: VideoMachineBridge = {
    flushPendingResume: async (reason) => {
      calls.push(`flush:${reason}`);
    },
    handleVideoAnswer: () => undefined,
    hasPendingResume: () => options.pendingResume === true,
    requestResume: () => undefined,
  };
  const sessionBridge: VideoSessionBridge = {
    handleCheckpoint: (detail) => {
      checkpoints.push(detail);
      return true;
    },
    handleEnded: () => {
      calls.push('ended');
    },
    prepareReadyPlayer: () => true,
  };
  const sessionRuntime: VideoSessionRuntimeController = {
    handleInstructionContinue: () => {
      calls.push('instruction-continue');
      return true;
    },
    handleVideoReady: (showOverlay) => {
      calls.push(`ready:${showOverlay}`);
    },
    markInstructionsContinued: () => undefined,
  };
  const runtime = createCardVideoEventRuntime({
    getVideoPlayer: () => options.player,
    machineBridge,
    send: (event) => {
      sent.push(event);
    },
    sessionBridge,
    sessionRuntime,
    stateMatches: (path) => path === 'videoWaiting' && options.videoWaiting === true,
  });

  return {
    calls,
    checkpoints,
    runtime,
    sent,
  };
}

describe('card video event runtime', function() {
  it('flushes pending resume only when the player and state are ready', function() {
    createHarness({ pendingResume: true, player: {}, videoWaiting: false }).runtime.syncPendingResume();
    createHarness({ pendingResume: true, player: null, videoWaiting: true }).runtime.syncPendingResume();

    const ready = createHarness({ pendingResume: true, player: {}, videoWaiting: true });
    ready.runtime.syncPendingResume();

    expect(ready.calls).to.deep.equal(['flush:reactive-ready']);
  });

  it('delegates video surface events to the owned bridges', function() {
    const harness = createHarness();

    harness.runtime.handleCheckpoint({ detail: { index: 1 } });
    harness.runtime.handleEnded();
    harness.runtime.handleReady(true);
    harness.runtime.handleInstructionContinue({ preventDefault: () => undefined });
    harness.runtime.handleContinue();

    expect(harness.checkpoints).to.deep.equal([{ index: 1 }]);
    expect(harness.calls).to.deep.equal([
      'ended',
      'ready:true',
      'instruction-continue',
    ]);
    expect(harness.sent).to.deep.equal([{ type: 'VIDEO_CONTINUE' }]);
  });
});
