import { expect } from 'chai';
import {
  firstNonEmptyString,
  getStimIncorrectResponses,
  normalizeButtonOptions,
  normalizeDisplayAttribution,
  resolveCardPayloadDeliverySettings,
  resolveStimMediaSource,
} from './cardPayloadBuilder';

describe('card payload builder helpers', function() {
  it('uses the first non-empty string candidate', function() {
    expect(firstNonEmptyString('', '  ', 'image.png', 'other.png')).to.equal('image.png');
    expect(firstNonEmptyString(null, undefined)).to.equal('');
  });

  it('resolves media source from display before legacy stimulus fields', function() {
    expect(resolveStimMediaSource({
      display: { imgSrc: 'display.png' },
      imageStimulus: 'legacy.png',
    }, 'image')).to.equal('display.png');
    expect(resolveStimMediaSource({
      audioStimulus: 'legacy.mp3',
    }, 'audio')).to.equal('legacy.mp3');
  });

  it('normalizes button options and incorrect responses', function() {
    expect(normalizeButtonOptions('alpha, beta ,, gamma')).to.deep.equal(['alpha', 'beta', 'gamma']);
    expect(normalizeButtonOptions(['a', 'b'])).to.deep.equal(['a', 'b']);
    expect(getStimIncorrectResponses({
      response: { incorrectResponses: 'x, y' },
    })).to.deep.equal(['x', 'y']);
  });

  it('keeps only populated attribution fields', function() {
    expect(normalizeDisplayAttribution(
      { creatorName: ' ', sourceName: 'Source' },
      { licenseUrl: 'https://license.test' },
    )).to.deep.equal({
      sourceName: 'Source',
      licenseUrl: 'https://license.test',
    });
    expect(normalizeDisplayAttribution({ creatorName: ' ' })).to.equal(undefined);
  });

  it('uses the session surface adapter to preserve active video delivery settings', function() {
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { displayQuestionNumber: true },
      existingDeliverySettings: { videoUrl: '/video.mp4' },
      sessionIsVideoSession: true,
    })).to.deep.equal({
      displayQuestionNumber: true,
      isVideoSession: true,
      videoUrl: '/video.mp4',
    });
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { isVideoSession: true, videoUrl: '/tdf-video.mp4' },
      existingDeliverySettings: { videoUrl: '/store-video.mp4' },
    })).to.deep.equal({
      isVideoSession: true,
      videoUrl: '/tdf-video.mp4',
    });
    expect(resolveCardPayloadDeliverySettings({
      baseDeliverySettings: { displayQuestionNumber: true },
      existingDeliverySettings: { videoUrl: '/video.mp4' },
      sessionIsVideoSession: false,
    })).to.deep.equal({
      displayQuestionNumber: true,
    });
  });
});
