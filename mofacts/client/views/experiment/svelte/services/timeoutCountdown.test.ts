import { expect } from 'chai';
import {
  buildDisplayTimeoutMessage,
  buildDisplayTimeoutSnapshot,
  createTimeoutCountdownController,
  createDisplayTimeoutController,
  createTimeoutCountdownSyncController,
  getDisplayTimeoutValue,
  getFeedbackTimeoutStartMs,
  getQuestionTimeoutStartMs,
  resolveDisplayTimeoutStartMs,
  resolveTimeoutMode,
  type TimeoutCountdownSnapshot,
} from './timeoutCountdown';

function stateMatching(paths: string[]) {
  return {
    matches: (path: string) => paths.includes(path),
  };
}

describe('timeout countdown service', function() {
  it('resolves the active timeout mode from machine state and preserves freeze mode', function() {
    expect(resolveTimeoutMode({
      state: stateMatching(['presenting.awaiting']),
      isOutgoingFreezeState: false,
      currentModeState: 'none',
    })).to.equal('question');
    expect(resolveTimeoutMode({
      state: stateMatching(['feedback.waiting']),
      isOutgoingFreezeState: false,
      currentModeState: 'none',
    })).to.equal('feedback');
    expect(resolveTimeoutMode({
      state: stateMatching(['transition.logging']),
      isOutgoingFreezeState: true,
      currentModeState: 'question',
    })).to.equal('question');
    expect(resolveTimeoutMode({
      state: stateMatching(['transition.logging']),
      isOutgoingFreezeState: false,
      currentModeState: 'question',
    })).to.equal('none');
  });

  it('normalizes display timeout values and messages', function() {
    expect(getDisplayTimeoutValue('3')).to.equal(3);
    expect(getDisplayTimeoutValue('bad')).to.equal(0);
    expect(resolveDisplayTimeoutStartMs({
      currentUnitStartTime: 1200,
      displayTimeoutMountMs: 5000,
    })).to.equal(1200);
    expect(resolveDisplayTimeoutStartMs({
      currentUnitStartTime: 0,
      displayTimeoutMountMs: 5000,
    })).to.equal(5000);
    expect(buildDisplayTimeoutMessage(5, 10, 2)).to.equal('You can continue in 3s');
    expect(buildDisplayTimeoutMessage(0, 10, 4)).to.equal('Time remaining: 6s');
    expect(buildDisplayTimeoutMessage(0, 10, 10)).to.equal('Continuing...');
    expect(buildDisplayTimeoutMessage(5, 0, 7)).to.equal('You can continue whenever you want');
  });

  it('builds display timeout snapshots with continue and auto-advance gates', function() {
    expect(buildDisplayTimeoutSnapshot({
      deliverySettings: {
        displayMinSeconds: 5,
        displayMaxSeconds: 10,
      },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 2,
      displayTimeoutMountMs: 2000,
      displayTimeoutNowMs: 7000,
      autoAdvanced: false,
      continuingToNextUnit: false,
      testMode: false,
    })).to.deep.include({
      minSeconds: 5,
      maxSeconds: 10,
      hasDisplayTimeout: true,
      startMs: 1000,
      elapsedSeconds: 6,
      canContinue: true,
      footerMessage: 'Time remaining: 4s',
      scopeKey: 'tdf-a:2:1000',
      shouldAutoAdvance: false,
    });

    expect(buildDisplayTimeoutSnapshot({
      deliverySettings: {
        displayMaxSeconds: 10,
      },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 2,
      displayTimeoutMountMs: 2000,
      displayTimeoutNowMs: 11000,
      autoAdvanced: false,
      continuingToNextUnit: false,
      testMode: false,
    }).shouldAutoAdvance).to.equal(true);

    expect(buildDisplayTimeoutSnapshot({
      deliverySettings: {
        displayMaxSeconds: 10,
      },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 2,
      displayTimeoutMountMs: 2000,
      displayTimeoutNowMs: 11000,
      autoAdvanced: true,
      continuingToNextUnit: false,
      testMode: false,
    }).shouldAutoAdvance).to.equal(false);
  });

  it('uses explicit timeout start timestamps before trial or current time', function() {
    expect(getQuestionTimeoutStartMs({
      timestamps: { timeoutStart: 1000, trialStart: 500 },
    }, () => 9000)).to.equal(1000);
    expect(getQuestionTimeoutStartMs({
      timestamps: { trialStart: 500 },
    }, () => 9000)).to.equal(500);
    expect(getQuestionTimeoutStartMs({}, () => 9000)).to.equal(9000);
    expect(getFeedbackTimeoutStartMs({
      timestamps: { feedbackStart: 1200, trialStart: 500 },
    }, () => 9000)).to.equal(1200);
    expect(getFeedbackTimeoutStartMs({
      timestamps: { trialStart: 500 },
    }, () => 9000)).to.equal(500);
  });

  it('owns countdown interval state and publishes progress updates', function() {
    let now = 1000;
    let intervalCallback: (() => void) | null = () => {
      throw new Error('Expected display timeout interval callback to be registered');
    };
    const intervalHandle = {} as ReturnType<typeof setInterval>;
    const cleared: unknown[] = [];
    const updates: TimeoutCountdownSnapshot[] = [];
    function runInterval() {
      if (!intervalCallback) {
        throw new Error('Expected countdown interval callback to be registered');
      }
      intervalCallback();
    }
    const controller = createTimeoutCountdownController({
      now: () => now,
      setIntervalFn: (callback) => {
        intervalCallback = callback;
        return intervalHandle;
      },
      clearIntervalFn: (handle) => {
        cleared.push(handle);
      },
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    controller.start(4000, 'question', 1000);
    expect(updates[updates.length - 1]).to.include({
      modeState: 'question',
      progress: 0,
      remainingTime: 4,
      start: 1000,
      duration: 4000,
    });

    now = 3000;
    runInterval();
    expect(updates[updates.length - 1]).to.include({
      progress: 50,
      remainingTime: 2,
    });

    now = 5000;
    runInterval();
    expect(updates[updates.length - 1]).to.include({
      progress: 100,
      remainingTime: 0,
    });
    expect(cleared).to.deep.equal([intervalHandle]);

    controller.clear();
    expect(updates[updates.length - 1]).to.include({
      modeState: 'none',
      progress: 0,
      remainingTime: 0,
      start: null,
      duration: 0,
    });
  });

  it('syncs question countdown restarts only when mode inputs change', function() {
    let now = 1000;
    let intervalCallback: (() => void) | null = null;
    const starts: TimeoutCountdownSnapshot[] = [];
    const countdown = createTimeoutCountdownController({
      now: () => now,
      setIntervalFn: (callback) => {
        intervalCallback = callback;
        return {} as ReturnType<typeof setInterval>;
      },
      onUpdate: (snapshot) => starts.push(snapshot),
    });
    const syncController = createTimeoutCountdownSyncController({
      countdown,
      getMainTimeoutMs: () => 4000,
      getFeedbackTimeoutMs: () => 0,
      now: () => now,
    });
    const state = stateMatching(['presenting.awaiting']);
    const context = {
      timestamps: { timeoutStart: 900 },
      timeoutResetCounter: 1,
    };

    expect(syncController.sync({
      testMode: false,
      state,
      context,
      deliverySettings: {},
      isOutgoingFreezeState: false,
    })).to.equal('question');
    expect(countdown.getSnapshot()).to.include({
      modeState: 'question',
      start: 900,
      duration: 4000,
    });
    const startCount = starts.length;

    syncController.sync({
      testMode: false,
      state,
      context,
      deliverySettings: {},
      isOutgoingFreezeState: false,
    });
    expect(starts.length).to.equal(startCount);

    syncController.sync({
      testMode: false,
      state,
      context: {
        ...context,
        timeoutResetCounter: 2,
      },
      deliverySettings: {},
      isOutgoingFreezeState: false,
    });
    expect(starts.length).to.be.greaterThan(startCount);
    expect(intervalCallback).to.be.a('function');
  });

  it('preserves ready-prompt feedback start time while settings are stable', function() {
    let now = 5000;
    const countdown = createTimeoutCountdownController({
      now: () => now,
      setIntervalFn: () => ({} as ReturnType<typeof setInterval>),
    });
    const syncController = createTimeoutCountdownSyncController({
      countdown,
      getMainTimeoutMs: () => 0,
      getFeedbackTimeoutMs: () => 0,
      now: () => now,
    });
    const params = {
      testMode: false,
      state: stateMatching(['presenting.readyPrompt']),
      context: {},
      deliverySettings: { readyPromptStringDisplayTime: '3000' },
      isOutgoingFreezeState: false,
    };

    syncController.sync(params);
    expect(countdown.getSnapshot()).to.include({
      modeState: 'feedback',
      start: 5000,
      duration: 3000,
    });

    now = 7000;
    syncController.sync(params);
    expect(countdown.getSnapshot()).to.include({
      modeState: 'feedback',
      start: 5000,
      duration: 3000,
    });
  });

  it('owns display timeout clock state and resets auto-advance by scope', function() {
    let now = 1000;
    let intervalCallback: () => void = () => {
      throw new Error('Expected display timeout interval callback to be registered');
    };
    const intervalHandle = {} as ReturnType<typeof setInterval>;
    const cleared: unknown[] = [];
    let ticks = 0;
    const controller = createDisplayTimeoutController({
      now: () => now,
      setIntervalFn: (callback) => {
        intervalCallback = callback;
        return intervalHandle;
      },
      clearIntervalFn: (handle) => {
        cleared.push(handle);
      },
      onTick: () => {
        ticks += 1;
      },
    });

    controller.startClock();
    expect(ticks).to.equal(1);
    now = 7000;
    intervalCallback();
    expect(ticks).to.equal(2);
    expect(controller.buildSnapshot({
      deliverySettings: { displayMaxSeconds: 5 },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 1,
      continuingToNextUnit: false,
      testMode: false,
    }).shouldAutoAdvance).to.equal(true);

    controller.markAutoAdvanced();
    expect(controller.buildSnapshot({
      deliverySettings: { displayMaxSeconds: 5 },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 1,
      continuingToNextUnit: false,
      testMode: false,
    }).shouldAutoAdvance).to.equal(false);

    expect(controller.buildSnapshot({
      deliverySettings: { displayMaxSeconds: 5 },
      currentUnitStartTime: 1000,
      currentTdfId: 'tdf-a',
      currentUnitNumber: 2,
      continuingToNextUnit: false,
      testMode: false,
    }).shouldAutoAdvance).to.equal(true);

    controller.stopClock();
    expect(cleared).to.deep.equal([intervalHandle]);
  });
});
