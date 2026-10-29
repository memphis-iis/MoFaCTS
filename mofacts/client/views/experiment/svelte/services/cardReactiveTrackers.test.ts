import { expect } from 'chai';
import {
  createCardReactiveTrackers,
  type ReactiveComputation,
} from './cardReactiveTrackers';

describe('card reactive trackers', function() {
  it('propagates late resume anchors independently of checkpoint changes', function() {
    const callbacks: Array<() => void> = [];
    const stopped: number[] = [];
    const performanceValues: unknown[] = [];
    const users: unknown[] = [];
    const videoCheckpoints: unknown[] = [];
    const anchors: unknown[] = [];
    let anchor: unknown = null;
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
      getVideoResumeAnchor: () => anchor,
      setVideoResumeAnchor: value => anchors.push(value),
      getVideoCheckpoints: () => checkpoints,
      setPerformanceData: (value) => performanceValues.push(value),
      setUser: (value) => users.push(value),
      setVideoCheckpoints: (value) => videoCheckpoints.push(value),
    });

    trackers.start();

    expect(callbacks).to.have.length(4);
    expect(performanceValues).to.deep.equal([{ correct: 1 }]);
    expect(users).to.deep.equal([{ _id: 'u1' }]);
    expect(videoCheckpoints).to.deep.equal([{ times: [1] }]);

    performance = { correct: 2 };
    user = { _id: 'u2' };
    checkpoints = { times: [2] };
    callbacks[0]!();
    callbacks[1]!();
    callbacks[2]!();

    expect(performanceValues).to.deep.equal([{ correct: 1 }, { correct: 2 }]);
    expect(users).to.deep.equal([{ _id: 'u1' }, { _id: 'u2' }]);
    expect(videoCheckpoints).to.deep.equal([{ times: [1] }, { times: [2] }]);

    anchor = { resumeStartTime: 10.1, resumeCheckpointIndex: 3 };
    callbacks[3]!();
    expect(anchors).to.deep.equal([null, anchor]);
    trackers.stop();
    expect(stopped).to.deep.equal([0, 1, 2, 3]);
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
      getVideoResumeAnchor: () => ({ resumeStartTime: 10, resumeCheckpointIndex: 2 }),
      setVideoResumeAnchor: () => undefined,
      getVideoCheckpoints: () => null,
      setPerformanceData: () => undefined,
      setUser: () => undefined,
      setVideoCheckpoints: () => undefined,
    });

    trackers.start();
    trackers.start();

    expect(stopped).to.deep.equal([0, 1, 2, 3]);
  });
});
