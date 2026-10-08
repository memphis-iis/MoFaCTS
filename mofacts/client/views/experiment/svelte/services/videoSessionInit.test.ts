import { expect } from 'chai';
import { resolveVideoPlaybackPolicy, resolveVideoPlaybackPolicyForUnit } from './videoSessionInit';

describe('video session init', function() {
  it('normalizes video playback policy flags from authored session values', function() {
    expect(resolveVideoPlaybackPolicy({
      preventScrubbing: 'true',
      rewindOnIncorrect: true,
    })).to.deep.equal({
      preventScrubbing: true,
      preventPause: false,
      preventRewind: false,
      rewindOnIncorrect: true,
    });

    expect(resolveVideoPlaybackPolicy({
      preventScrubbing: 'false',
      rewindOnIncorrect: undefined,
    })).to.deep.equal({
      preventScrubbing: false,
      preventPause: false,
      preventRewind: false,
      rewindOnIncorrect: false,
    });

    expect(resolveVideoPlaybackPolicy(null)).to.deep.equal({
      preventScrubbing: false,
      preventPause: false,
      preventRewind: false,
      rewindOnIncorrect: false,
    });
  });

  it('normalizes the independent participant restrictions', function() {
    expect(resolveVideoPlaybackPolicy({preventPause: 'true', preventRewind: 1})).to.include({
      preventPause: true, preventRewind: true, preventScrubbing: false,
    });
  });

  it('resolves playback policy from the TDF unit boundary', function() {
    expect(resolveVideoPlaybackPolicyForUnit({
      videosession: {
        preventScrubbing: true,
        rewindOnIncorrect: 0,
      },
    })).to.deep.equal({
      preventScrubbing: true,
      preventPause: false,
      preventRewind: false,
      rewindOnIncorrect: false,
    });

    expect(resolveVideoPlaybackPolicyForUnit({})).to.deep.equal({
      preventScrubbing: false,
      preventPause: false,
      preventRewind: false,
      rewindOnIncorrect: false,
    });
  });
});
