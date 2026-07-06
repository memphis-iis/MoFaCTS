import { expect } from 'chai';
import {
  buildVideoRuntimeSnapshot,
  createCompletedVideoQuestionsStore,
} from './videoRuntimeSnapshot';

function stateMatching(paths: string[]) {
  return {
    matches: (path: string) => paths.includes(path),
  };
}

describe('video runtime snapshot service', function() {
  it('builds video session props from checkpoints, resume anchor, and playback policy', function() {
    const snapshot = buildVideoRuntimeSnapshot({
      currentState: { videoWaiting: true },
      currentTdfUnit: {
        videosession: {
          preventScrubbing: 'true',
          repeatQuestionsSinceCheckpoint: 1,
          rewindOnIncorrect: true,
        },
      },
      getVideoResumeAnchor: () => ({
        resumeStartTime: 12,
        resumeCheckpointIndex: 2,
      }),
      state: stateMatching(['videoWaiting']),
      videoCheckpoints: {
        times: [5, 10],
        questions: [1, 2],
      },
    });

    expect(snapshot).to.deep.include({
      canAcceptCheckpoint: true,
      checkpointGateState: '{"videoWaiting":true}',
      preventScrubbingEnabled: true,
      repeatQuestionsSinceCheckpointEnabled: true,
      resumeCheckpointIndex: 2,
      resumeStartTime: 12,
      rewindOnIncorrectEnabled: true,
    });
    expect(snapshot.questionTimes).to.deep.equal([5, 10]);
    expect(snapshot.questionIndices).to.deep.equal([1, 2]);
  });

  it('normalizes missing checkpoints and resume anchors for non-video states', function() {
    const snapshot = buildVideoRuntimeSnapshot({
      currentState: 'idle',
      currentTdfUnit: {},
      getVideoResumeAnchor: () => null,
      state: stateMatching([]),
      videoCheckpoints: null,
    });

    expect(snapshot).to.deep.include({
      canAcceptCheckpoint: false,
      checkpointGateState: '"idle"',
      preventScrubbingEnabled: false,
      repeatQuestionsSinceCheckpointEnabled: false,
      resumeCheckpointIndex: undefined,
      resumeStartTime: undefined,
      rewindOnIncorrectEnabled: false,
      videoResumeAnchor: null,
    });
    expect(snapshot.questionTimes).to.deep.equal([]);
    expect(snapshot.questionIndices).to.deep.equal([]);
  });

  it('tracks completed video questions behind an explicit store', function() {
    const store = createCompletedVideoQuestionsStore();

    store.add(2);
    store.add(3);
    expect([...store.get()]).to.deep.equal([2, 3]);

    store.reset();
    expect([...store.get()]).to.deep.equal([]);
  });
});
