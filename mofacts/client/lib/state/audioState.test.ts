import { expect } from 'chai';
import {
  getTtsWarmedUp,
  setTtsWarmedUp,
  getSrWarmedUp,
  setSrWarmedUp,
  getAudioInputSensitivity,
  setAudioInputSensitivity,
  getAudioPromptSpeakingRate,
  setAudioPromptSpeakingRate,
  getAudioPromptVoice,
  setAudioPromptVoice,
  resetAudioState
} from './audioState';

describe('audioState', function() {
  beforeEach(function() {
    resetAudioState();
  });

  afterEach(function() {
    resetAudioState();
  });

  it('starts with warmup defaults after reset', function() {
    expect(getTtsWarmedUp()).to.equal(false);
    expect(getSrWarmedUp()).to.equal(false);
  });

  it('stores and reads key runtime audio settings', function() {
    setAudioInputSensitivity(65);
    setAudioPromptSpeakingRate(1.2);
    setAudioPromptVoice('en-US-Standard-B');

    expect(getAudioInputSensitivity()).to.equal(65);
    expect(getAudioPromptSpeakingRate()).to.equal(1.2);
    expect(getAudioPromptVoice()).to.equal('en-US-Standard-B');
  });

  it('clears non-default values on reset', function() {
    setTtsWarmedUp(true);
    setSrWarmedUp(true);
    setAudioInputSensitivity(70);

    resetAudioState();

    expect(getTtsWarmedUp()).to.equal(false);
    expect(getSrWarmedUp()).to.equal(false);
    expect(getAudioInputSensitivity()).to.equal(undefined);
  });
});

