import { expect } from 'chai';
import { resolveVideoPlaybackPolicy } from './videoCardInit';

describe('video card init', function() {
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
});
