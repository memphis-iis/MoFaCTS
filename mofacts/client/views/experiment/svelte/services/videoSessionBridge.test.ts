import { expect } from 'chai';
import {
  createVideoSessionBridge,
  type VideoSessionEvent,
} from './videoSessionBridge';

function createHarness(options: {
  stateMatches?: boolean;
  testMode?: boolean;
  videoPlayer?: {
    recovered?: boolean;
    player?: { muted?: boolean; volume?: number } | null;
  } | null;
} = {}) {
  const events: VideoSessionEvent[] = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const sessionValues = new Map<string, unknown>();
  const playerState = options.videoPlayer === undefined
    ? { recovered: false, player: { muted: true, volume: 0 } }
    : options.videoPlayer;
  const bridge = createVideoSessionBridge({
    getCurrentState: () => 'test-state',
    getVideoCheckpoints: () => ({ times: [10, 20], questions: [1, 2] }),
    getVideoPlayer: () => playerState
      ? {
          recoverRejectedCheckpoint: () => {
            playerState.recovered = true;
          },
          getPlayer: () => playerState.player || null,
        }
      : null,
    isTestMode: () => options.testMode === true,
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
    send: (event) => {
      events.push(event);
    },
    setSessionValue: (key, value) => {
      sessionValues.set(key, value);
    },
    stateMatches: () => options.stateMatches !== false,
  });

  return {
    bridge,
    events,
    logs,
    playerState,
    sessionValues,
  };
}

describe('video session bridge', function() {
  it('accepts checkpoints, updates engine indices, stores resume anchors, and sends machine event', function() {
    const harness = createHarness();

    expect(harness.bridge.handleCheckpoint({ index: 1, questionIndex: 2 })).to.equal(true);

    expect(harness.sessionValues.get('engineIndices')).to.deep.equal({
      clusterIndex: 2,
      stimIndex: 0,
    });
    expect(harness.sessionValues.get('videoResumeAnchor')).to.deep.equal({
      resumeStartTime: 20,
      resumeCheckpointIndex: 1,
    });
    expect(harness.events).to.deep.equal([{
      type: 'VIDEO_CHECKPOINT',
      checkpointIndex: 1,
      questionIndex: 2,
    }]);
  });

  it('does not persist resume anchors in test mode', function() {
    const harness = createHarness({ testMode: true });

    harness.bridge.handleCheckpoint({ index: 0, questionIndex: 1 });

    expect(harness.sessionValues.has('videoResumeAnchor')).to.equal(false);
    expect(harness.events).to.deep.equal([{
      type: 'VIDEO_CHECKPOINT',
      checkpointIndex: 0,
      questionIndex: 1,
    }]);
  });

  it('rejects checkpoints outside videoWaiting and asks the player to recover', function() {
    const harness = createHarness({ stateMatches: false });

    expect(harness.bridge.handleCheckpoint({ index: 1, questionIndex: 2 })).to.equal(false);

    expect(harness.events).to.deep.equal([]);
    expect(harness.playerState?.recovered).to.equal(true);
    expect(harness.logs[0]?.message).to.equal('[ContentSurface] Rejected video checkpoint outside videoWaiting');
  });

  it('fails clearly when accepted checkpoint data is incomplete', function() {
    expect(() => createHarness().bridge.handleCheckpoint({ index: 0 }))
      .to.throw(/missing question index/);
    expect(() => createHarness().bridge.handleCheckpoint({ index: 9, questionIndex: 1 }))
      .to.throw(/missing checkpoint time/);
  });

  it('clears engine indices and sends ended event', function() {
    const harness = createHarness();

    harness.bridge.handleEnded();

    expect(harness.sessionValues.get('engineIndices')).to.equal(undefined);
    expect(harness.events).to.deep.equal([{ type: 'VIDEO_ENDED' }]);
  });

  it('unmutes and normalizes ready players only when video playback can start', function() {
    const harness = createHarness();

    expect(harness.bridge.prepareReadyPlayer(false)).to.equal(true);
    expect(harness.playerState?.player).to.deep.equal({
      muted: false,
      volume: 1,
    });

    expect(createHarness({ stateMatches: false }).bridge.prepareReadyPlayer(false)).to.equal(false);
    expect(createHarness().bridge.prepareReadyPlayer(true)).to.equal(false);
    expect(createHarness({ videoPlayer: null }).bridge.prepareReadyPlayer(false)).to.equal(false);
  });
});
