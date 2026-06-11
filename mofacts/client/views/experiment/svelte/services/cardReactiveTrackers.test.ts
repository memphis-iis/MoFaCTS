import { expect } from 'chai';
import {
  createCardReactiveTrackers,
  type ReactiveComputation,
} from './cardReactiveTrackers';

describe('card reactive trackers', function() {
  it('starts performance, user, and video checkpoint autoruns', function() {
    const callbacks: Array<() => void> = [];
    const stopped: number[] = [];
    const performanceValues: unknown[] = [];
    const users: unknown[] = [];
    const videoCheckpoints: unknown[] = [];
    let resetCount = 0;
    let performance = { correct: 1 };
    let user = { _id: 'u1' };
    let checkpoints = { times: [1] };

    const trackers = createCardReactiveTrackers({
      autorun: (callback): ReactiveComputation => {
        const index = callbacks.length;
        callbacks.push(callback);
        callback();
        return {
          stop: () => stopped.push(index),
        };
      },
      getPerformance: () => performance,
      getUser: () => user,
      getVideoCheckpoints: () => checkpoints,
      setPerformanceData: (value) => performanceValues.push(value),
      setUser: (value) => users.push(value),
      setVideoCheckpoints: (value) => videoCheckpoints.push(value),
      resetCompletedVideoQuestions: () => {
        resetCount += 1;
      },
    });

    trackers.start();

    expect(callbacks).to.have.length(3);
    expect(performanceValues).to.deep.equal([{ correct: 1 }]);
    expect(users).to.deep.equal([{ _id: 'u1' }]);
    expect(videoCheckpoints).to.deep.equal([{ times: [1] }]);
    expect(resetCount).to.equal(1);

    performance = { correct: 2 };
    user = { _id: 'u2' };
    checkpoints = { times: [2] };
    callbacks[0]!();
    callbacks[1]!();
    callbacks[2]!();

    expect(performanceValues).to.deep.equal([{ correct: 1 }, { correct: 2 }]);
    expect(users).to.deep.equal([{ _id: 'u1' }, { _id: 'u2' }]);
    expect(videoCheckpoints).to.deep.equal([{ times: [1] }, { times: [2] }]);
    expect(resetCount).to.equal(2);

    trackers.stop();
    expect(stopped).to.deep.equal([0, 1, 2]);
  });

  it('stops existing computations before restarting', function() {
    const stopped: number[] = [];
    let nextIndex = 0;
    const trackers = createCardReactiveTrackers({
      autorun: (callback): ReactiveComputation => {
        callback();
        const index = nextIndex;
        nextIndex += 1;
        return {
          stop: () => stopped.push(index),
        };
      },
      getPerformance: () => null,
      getUser: () => null,
      getVideoCheckpoints: () => null,
      setPerformanceData: () => undefined,
      setUser: () => undefined,
      setVideoCheckpoints: () => undefined,
      resetCompletedVideoQuestions: () => undefined,
    });

    trackers.start();
    trackers.start();

    expect(stopped).to.deep.equal([0, 1, 2]);
  });
});
