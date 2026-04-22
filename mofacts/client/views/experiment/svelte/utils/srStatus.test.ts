import { expect } from 'chai';
import { deriveSrStatus } from './srStatus';

describe('deriveSrStatus()', function() {
  it('returns idle when SR is unavailable', function() {
    expect(deriveSrStatus({
      isSrEnabled: false,
      isReady: true,
      isRecording: true,
      isProcessing: true,
      isVoiceValidating: true,
    })).to.equal('idle');
  });

  it('returns ready only while the SR ready substate is active', function() {
    expect(deriveSrStatus({
      isSrEnabled: true,
      isReady: true,
      isRecording: false,
      isProcessing: false,
      isVoiceValidating: false,
    })).to.equal('ready');
  });

  it('returns recording while speech is being captured', function() {
    expect(deriveSrStatus({
      isSrEnabled: true,
      isReady: false,
      isRecording: true,
      isProcessing: false,
      isVoiceValidating: false,
    })).to.equal('recording');
  });

  it('returns processing while the SR processing substate is active', function() {
    expect(deriveSrStatus({
      isSrEnabled: true,
      isReady: false,
      isRecording: false,
      isProcessing: true,
      isVoiceValidating: false,
    })).to.equal('processing');
  });

  it('stays in processing while a voice answer is validating into feedback', function() {
    expect(deriveSrStatus({
      isSrEnabled: true,
      isReady: false,
      isRecording: false,
      isProcessing: false,
      isVoiceValidating: true,
    })).to.equal('processing');
  });

  it('returns idle outside SR-specific substates', function() {
    expect(deriveSrStatus({
      isSrEnabled: true,
      isReady: false,
      isRecording: false,
      isProcessing: false,
      isVoiceValidating: false,
    })).to.equal('idle');
  });
});
