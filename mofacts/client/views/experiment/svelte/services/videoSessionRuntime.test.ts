import { expect } from 'chai';
import { createVideoSessionRuntimeController } from './videoSessionRuntime';

function createHarness(options: {
  currentUnitNumber?: unknown;
  player?: { play?: () => void | Promise<unknown> } | null;
  shownAt?: number;
} = {}) {
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const sessionValues = new Map<string, unknown>();
  const persisted: Array<{ currentUnitNumber: number }> = [];
  const recorded: number[] = [];
  const flushed: string[] = [];
  const prepared: boolean[] = [];
  let dismissed = false;
  let startBlocked = false;
  let playerReady = false;
  let preventDefaultCalled = false;

  const controller = createVideoSessionRuntimeController({
    getCurrentUnitNumber: () => options.currentUnitNumber ?? 3,
    getVideoInstructionsShownAt: () => options.shownAt ?? 1200,
    getVideoPlayer: () => options.player,
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
    now: () => 9000,
    persistInstructionState: async (params) => {
      persisted.push(params);
    },
    prepareReadyPlayer: (showOverlay) => {
      prepared.push(showOverlay);
    },
    recordInstructionContinue: async (shownAt) => {
      recorded.push(shownAt);
    },
    setSessionValue: (key, value) => {
      sessionValues.set(key, value);
    },
    setVideoInstructionDismissed: (value) => {
      dismissed = value;
    },
    setVideoInstructionStartBlocked: (value) => {
      startBlocked = value;
    },
    setVideoPlayerReady: (value) => {
      playerReady = value;
    },
    flushPendingResume: (reason) => {
      flushed.push(reason);
    },
  });

  return {
    controller,
    get dismissed() {
      return dismissed;
    },
    flushed,
    get playerReady() {
      return playerReady;
    },
    logs,
    persisted,
    prepared,
    preventableEvent: {
      preventDefault: () => {
        preventDefaultCalled = true;
      },
    },
    get preventDefaultCalled() {
      return preventDefaultCalled;
    },
    recorded,
    sessionValues,
    get startBlocked() {
      return startBlocked;
    },
  };
}

describe('video session runtime controller', function() {
  it('blocks instruction continue when the player is not ready', function() {
    const harness = createHarness({ player: null });

    expect(harness.controller.handleInstructionContinue(harness.preventableEvent)).to.equal(false);

    expect(harness.preventDefaultCalled).to.equal(true);
    expect(harness.startBlocked).to.equal(true);
    expect(harness.dismissed).to.equal(false);
    expect(harness.logs[0]?.message).to.equal('[ContentSurface] Video instructions continue clicked before player was ready');
  });

  it('marks instructions continued after synchronous play starts', async function() {
    const harness = createHarness({
      player: {
        play: () => undefined,
      },
    });

    expect(harness.controller.handleInstructionContinue()).to.equal(true);
    await Promise.resolve();

    expect(harness.dismissed).to.equal(true);
    expect(harness.startBlocked).to.equal(false);
    expect(harness.sessionValues.get('curUnitInstructionsSeen')).to.equal(true);
    expect(harness.sessionValues.get('fromInstructions')).to.equal(true);
    expect(harness.recorded).to.deep.equal([1200]);
    expect(harness.persisted).to.deep.equal([{ currentUnitNumber: 3 }]);
  });

  it('marks instructions continued after asynchronous play resolves', async function() {
    const harness = createHarness({
      currentUnitNumber: 'bad',
      shownAt: 0,
      player: {
        play: async () => undefined,
      },
    });

    expect(harness.controller.handleInstructionContinue()).to.equal(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.dismissed).to.equal(true);
    expect(harness.recorded).to.deep.equal([9000]);
    expect(harness.persisted).to.deep.equal([{ currentUnitNumber: 0 }]);
  });

  it('marks start blocked when play throws or rejects', async function() {
    const throwingHarness = createHarness({
      player: {
        play: () => {
          throw new Error('boom');
        },
      },
    });

    expect(throwingHarness.controller.handleInstructionContinue()).to.equal(false);
    expect(throwingHarness.startBlocked).to.equal(true);
    expect(throwingHarness.logs[0]?.message).to.equal('[ContentSurface] Video start from instructions threw:');
    expect(throwingHarness.logs[0]?.details).to.equal('boom');

    const rejectingHarness = createHarness({
      player: {
        play: () => Promise.reject(new Error('blocked')),
      },
    });

    expect(rejectingHarness.controller.handleInstructionContinue()).to.equal(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(rejectingHarness.startBlocked).to.equal(true);
    expect(rejectingHarness.dismissed).to.equal(false);
    expect(rejectingHarness.logs[0]?.message).to.equal('[ContentSurface] Video start from instructions was blocked:');
    expect(rejectingHarness.logs[0]?.details).to.equal('blocked');
  });

  it('handles ready-player side effects together', function() {
    const harness = createHarness();

    harness.controller.handleVideoReady(true);

    expect(harness.playerReady).to.equal(true);
    expect(harness.flushed).to.deep.equal(['video-ready']);
    expect(harness.prepared).to.deep.equal([true]);
  });
});
