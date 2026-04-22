import { expect } from 'chai';
import {
  estimateSpeechSynthesisCompletionTimeoutMs,
  isAppleMobileSpeechSynthesisEnvironment,
} from './ttsService';

describe('ttsService Apple mobile recovery helpers', function() {
  it('targets iPhone Safari user agents for the recovery path', function() {
    const isTargeted = isAppleMobileSpeechSynthesisEnvironment(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5
    );

    expect(isTargeted).to.equal(true);
  });

  it('does not target Android Chrome user agents', function() {
    const isTargeted = isAppleMobileSpeechSynthesisEnvironment(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      5
    );

    expect(isTargeted).to.equal(false);
  });

  it('keeps a minimum cleanup timeout for short utterances', function() {
    expect(estimateSpeechSynthesisCompletionTimeoutMs('France', 1)).to.equal(2500);
  });

  it('extends cleanup timeout for longer prompts and slower rates', function() {
    const fastTimeout = estimateSpeechSynthesisCompletionTimeoutMs('The capital city is Buenos Aires.', 1);
    const slowTimeout = estimateSpeechSynthesisCompletionTimeoutMs('The capital city is Buenos Aires.', 0.5);

    expect(slowTimeout).to.be.greaterThan(fastTimeout);
    expect(fastTimeout).to.be.greaterThan(2500);
  });
});
