import { expect } from 'chai';
import {
  AUDIO_INPUT_SENSITIVITY_DEFAULT,
  normalizeAudioInputSensitivity,
  normalizeAudioSettings,
  parsePublishedAudioSettings,
  promptControlsVisible,
  promptFeedbackEnabled,
  promptModeFromToggles,
  promptQuestionEnabled,
  rangeProgress,
} from './audioSettingsState';

describe('audioSettingsState', function() {
  it('normalizes unresolved fields into the authored audio defaults', function() {
    const settings = normalizeAudioSettings({ audioPromptMode: 'unexpected' });
    expect(settings.audioPromptMode).to.equal('silent');
    expect(settings.audioInputSensitivity).to.equal(AUDIO_INPUT_SENSITIVITY_DEFAULT);
    expect(settings.audioPromptVoice).to.equal('en-US-Standard-A');
  });

  it('rejects incomplete publication data instead of presenting fallback settings', function() {
    expect(() => parsePublishedAudioSettings({ audioPromptMode: 'silent' }))
      .to.throw('missing audioPromptQuestionVolume');
    expect(parsePublishedAudioSettings({
      audioPromptMode: 'feedback',
      audioPromptQuestionVolume: 0,
      audioPromptQuestionSpeakingRate: 1,
      audioPromptVoice: 'en-US-Standard-A',
      audioPromptFeedbackVolume: 0,
      audioPromptFeedbackSpeakingRate: 1,
      audioPromptFeedbackVoice: 'en-US-Standard-A',
      audioInputMode: false,
      audioInputSensitivity: 60,
    }).audioPromptMode).to.equal('feedback');
  });

  it('clamps the speech sensitivity to the supported range', function() {
    expect(normalizeAudioInputSensitivity(5)).to.equal(20);
    expect(normalizeAudioInputSensitivity(92)).to.equal(80);
    expect(normalizeAudioInputSensitivity('not-a-number')).to.equal(60);
  });

  it('derives prompt mode and conditional groups from one form state', function() {
    expect(promptModeFromToggles(false, false)).to.equal('silent');
    expect(promptModeFromToggles(true, false)).to.equal('question');
    expect(promptModeFromToggles(false, true)).to.equal('feedback');
    expect(promptModeFromToggles(true, true)).to.equal('all');

    const settings = normalizeAudioSettings({
      audioPromptMode: 'all',
      audioInputMode: true,
    });
    expect(promptQuestionEnabled(settings)).to.equal(true);
    expect(promptFeedbackEnabled(settings)).to.equal(true);
    expect(promptControlsVisible(settings)).to.equal(true);
  });

  it('maps bounded values to declarative range geometry', function() {
    expect(rangeProgress(-6, -6, 6)).to.equal(0);
    expect(rangeProgress(0, -6, 6)).to.equal(50);
    expect(rangeProgress(6, -6, 6)).to.equal(100);
  });
});
