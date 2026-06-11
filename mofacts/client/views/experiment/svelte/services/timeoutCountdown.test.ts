import { expect } from 'chai';
import {
  buildDisplayTimeoutMessage,
  createTimeoutCountdownController,
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
    let intervalCallback: (() => void) | null = null;
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
});
