import { expect } from 'chai';
import { resolveVideoPlaybackPolicy, resolveVideoPlaybackPolicyForUnit } from './videoSessionInit';

describe('video session init', function() {
  it('normalizes video playback policy flags from authored session values', function() {
    expect(resolveVideoPlaybackPolicy({
      preventScrubbing: 'true',
      repeatQuestionsSinceCheckpoint: 1,
      rewindOnIncorrect: true,
    })).to.deep.equal({
      preventScrubbing: true,
      repeatQuestionsSinceCheckpoint: true,
      rewindOnIncorrect: true,
    });

    expect(resolveVideoPlaybackPolicy({
      preventScrubbing: 'false',
      repeatQuestionsSinceCheckpoint: 0,
      rewindOnIncorrect: undefined,
    })).to.deep.equal({
      preventScrubbing: false,
      repeatQuestionsSinceCheckpoint: false,
      rewindOnIncorrect: false,
    });

    expect(resolveVideoPlaybackPolicy(null)).to.deep.equal({
      preventScrubbing: false,
      repeatQuestionsSinceCheckpoint: false,
      rewindOnIncorrect: false,
    });
  });

  it('resolves playback policy from the TDF unit boundary', function() {
    expect(resolveVideoPlaybackPolicyForUnit({
      videosession: {
        preventScrubbing: true,
        repeatQuestionsSinceCheckpoint: '1',
        rewindOnIncorrect: 0,
      },
    })).to.deep.equal({
      preventScrubbing: true,
      repeatQuestionsSinceCheckpoint: true,
      rewindOnIncorrect: false,
    });

    expect(resolveVideoPlaybackPolicyForUnit({})).to.deep.equal({
      preventScrubbing: false,
      repeatQuestionsSinceCheckpoint: false,
      rewindOnIncorrect: false,
    });
  });
});
