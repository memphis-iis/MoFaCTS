import { expect } from 'chai';
import {
  createVideoMachineBridge,
  getCheckpointResetIndex,
  getRewindCheckpointTimes,
  type VideoCheckpoints,
  type VideoPlayerBridge,
} from './videoMachineBridge';

function createBridgeHarness(options: {
  checkpoints?: VideoCheckpoints | null;
  rewind?: boolean;
  stateMatches?: boolean;
  videoPlayer?: VideoPlayerBridge | null;
} = {}) {
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const retries: Array<() => void> = [];
  const resumeCalls: string[] = [];
  const resetCalls: number[] = [];
  const rewindCalls: number[] = [];
  const actionCalls: string[] = [];

  const player = options.videoPlayer === undefined
    ? {
        getCurrentTime: () => 25,
        logAction: (action: string) => actionCalls.push(action),
        resetCheckpointTo: (index: number) => resetCalls.push(index),
        resumeAfterQuestion: () => resumeCalls.push('resume'),
        rewindTo: (time: number) => rewindCalls.push(time),
      }
    : options.videoPlayer;

  const bridge = createVideoMachineBridge({
    getCurrentState: () => 'test-state',
    getRewindOnIncorrectEnabled: () => options.rewind !== false,
    getVideoCheckpoints: () => options.checkpoints === undefined
      ? {
          times: [10, 20, 30],
          questions: [1, 2, 3],
          rewindCheckpoints: [0, 20],
        }
      : options.checkpoints,
    getVideoPlayer: () => player,
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
    scheduleRetry: (callback) => {
      retries.push(callback);
    },
    stateMatches: () => options.stateMatches !== false,
    waitForDomUpdate: async () => undefined,
  });

  return {
    actionCalls,
    bridge,
    logs,
    resetCalls,
    resumeCalls,
    retries,
    rewindCalls,
  };
}

describe('video machine bridge', function() {
  it('normalizes rewind checkpoint times and reset index', function() {
    expect(getRewindCheckpointTimes({ times: [30, '10'], rewindCheckpoints: [20, 0] }))
      .to.deep.equal([0, 20]);
    expect(getCheckpointResetIndex([10, 20, 30], 20.1)).to.equal(2);
    expect(() => getRewindCheckpointTimes({ rewindCheckpoints: ['bad'] })).to.throw(/invalid/);
    expect(() => getCheckpointResetIndex([10, 'bad'], 0)).to.throw(/invalid/);
  });

  it('resumes video only when machine and player are ready', async function() {
    const harness = createBridgeHarness();

    harness.bridge.requestResume('test');
    await Promise.resolve();

    expect(harness.resumeCalls).to.deep.equal(['resume']);
    expect(harness.bridge.hasPendingResume()).to.equal(false);
  });

  it('keeps resume pending and schedules retry outside videoWaiting', async function() {
    const harness = createBridgeHarness({ stateMatches: false });

    harness.bridge.requestResume('test');
    await Promise.resolve();

    expect(harness.resumeCalls).to.deep.equal([]);
    expect(harness.bridge.hasPendingResume()).to.equal(true);
    expect(harness.retries).to.have.length(1);
  });

  it('leaves the video position unchanged for correct answers', function() {
    const harness = createBridgeHarness();

    harness.bridge.handleVideoAnswer({ isCorrect: true, checkpointIndex: 1 });

    expect(harness.rewindCalls).to.deep.equal([]);
    expect(harness.resetCalls).to.deep.equal([]);
    expect(harness.actionCalls).to.deep.equal([]);
  });

  it('rewinds to the previous checkpoint for incorrect answers', function() {
    const harness = createBridgeHarness();

    harness.bridge.handleVideoAnswer({ isCorrect: false, checkpointIndex: 2 });

    expect(harness.resetCalls).to.deep.equal([2]);
    expect(harness.rewindCalls).to.deep.equal([20.1]);
    expect(harness.actionCalls).to.deep.equal(['rewind_to_checkpoint']);
  });

  it('fails clearly when rewind invariants are missing', function() {
    expect(() => createBridgeHarness().bridge.handleVideoAnswer({
      isCorrect: false,
      checkpointIndex: undefined,
    })).to.throw(/missing checkpoint index/);

    expect(() => createBridgeHarness({ checkpoints: null }).bridge.handleVideoAnswer({
      isCorrect: false,
      checkpointIndex: 1,
    })).to.throw(/not initialized/);

    expect(() => createBridgeHarness({ videoPlayer: null }).bridge.handleVideoAnswer({
      isCorrect: false,
      checkpointIndex: 1,
    })).to.throw(/player missing/);
  });
});
