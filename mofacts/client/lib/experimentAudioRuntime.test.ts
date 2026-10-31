import { expect } from 'chai';
import { applyExperimentAudioSettings } from './experimentAudioRuntime';
import { getAudioInputSensitivity, getAudioPromptMode, getAudioPromptVoice, resetAudioState, setAudioPromptMode } from './state/audioState';

describe('experiment condition audio activation', function() {
  beforeEach(resetAudioState);
  afterEach(resetAudioState);

  it('replaces root audio with the selected condition and restores it on re-entry', function() {
    applyExperimentAudioSettings({ tags: ['Experiment'] });
    expect(getAudioPromptMode()).to.equal('silent');
    applyExperimentAudioSettings({ tags: ['Experiment'], audioPromptMode: 'all', audioInputSensitivity: 35, audioPromptVoice: 'es-ES-Standard-A' });
    expect(getAudioPromptMode()).to.equal('all');
    expect(getAudioInputSensitivity()).to.equal(35);
    expect(getAudioPromptVoice()).to.equal('es-ES-Standard-A');
    resetAudioState();
    applyExperimentAudioSettings({ tags: ['Experiment'], audioPromptMode: 'all' });
    expect(getAudioPromptMode()).to.equal('all');
    expect(getAudioInputSensitivity()).to.equal(60);
  });

  it('leaves an ordinary lesson audio preference unchanged', function() {
    setAudioPromptMode('feedback');
    applyExperimentAudioSettings({ audioPromptMode: 'all' });
    expect(getAudioPromptMode()).to.equal('feedback');
  });
});
