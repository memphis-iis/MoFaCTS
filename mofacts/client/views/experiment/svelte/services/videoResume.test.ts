import { expect } from 'chai';

import { resolveVideoResumeAnchor } from './videoResume';

describe('videoResume', function() {
  const checkpointTimes = [10, 20, 30];

  it('resumes from the last completed checkpoint time and next unanswered checkpoint index', function() {
    expect(resolveVideoResumeAnchor(checkpointTimes, 1)).to.deep.equal({
      resumeStartTime: 10,
      resumeCheckpointIndex: 1,
    });
    expect(resolveVideoResumeAnchor(checkpointTimes, 2)).to.deep.equal({
      resumeStartTime: 20,
      resumeCheckpointIndex: 2,
    });
  });

  it('returns null when no checkpoints are completed yet', function() {
    expect(resolveVideoResumeAnchor(checkpointTimes, 0)).to.equal(null);
  });

  it('resumes from the last checkpoint when all questions are already completed', function() {
    expect(resolveVideoResumeAnchor(checkpointTimes, 3)).to.deep.equal({
      resumeStartTime: 30,
      resumeCheckpointIndex: 3,
    });
  });

  it('fails on invalid checkpoint times', function() {
    expect(() => resolveVideoResumeAnchor([10, 'bad', 30], 1)).to.throw(/invalid/);
  });
});
