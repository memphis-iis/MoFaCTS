import { expect } from 'chai';
import { DEFAULT_AUDIO_SETTINGS } from '../views/audioSettingsState';
import { hasExperimentTag, resolveExperimentAudioSettings, resolveLessonAudioPromptMode } from './lessonAudioSettings';

describe('experiment audio settings', function() {
  it('recognizes the exact Experiment tag regardless of case and surrounding whitespace', function() {
    expect(hasExperimentTag({ tags: ['Spanish', ' Experiment '] })).to.equal(true);
    expect(hasExperimentTag({ tags: ['experiment'] })).to.equal(true);
    expect(hasExperimentTag({ tags: ['Experimental'] })).to.equal(false);
    expect(hasExperimentTag({ tags: 'Experiment' })).to.equal(false);
    expect(hasExperimentTag(undefined)).to.equal(false);
  });

  it('uses authored values and established audio defaults without needing a profile', function() {
    expect(resolveExperimentAudioSettings({})).to.deep.equal(DEFAULT_AUDIO_SETTINGS);
    const settings = resolveExperimentAudioSettings({
      audioInputEnabled: 'true', audioInputSensitivity: '35', audioPromptMode: 'all',
      audioPromptQuestionSpeakingRate: '0.75', audioPromptFeedbackVolume: -3,
    });
    expect(settings.audioInputMode).to.equal(true);
    expect(settings.audioInputSensitivity).to.equal(35);
    expect(settings.audioPromptMode).to.equal('all');
    expect(settings.audioPromptQuestionSpeakingRate).to.equal(0.75);
    expect(settings.audioPromptFeedbackVolume).to.equal(-3);
  });

  it('uses experiment unit TTS settings even when personal audio is off, and honors silent post-tests', function() {
    const condition = { tags: ['Experiment'], audioPromptMode: 'silent' };
    expect(resolveLessonAudioPromptMode({ audioPromptMode: 'all' }, condition, 'silent')).to.equal('all');
    expect(resolveLessonAudioPromptMode({ audioPromptMode: 'silent' }, { ...condition, audioPromptMode: 'all' }, 'all')).to.equal('silent');
    expect(resolveLessonAudioPromptMode({}, condition, 'all')).to.equal('silent');
  });

  it('preserves the personal TTS gate for ordinary lessons', function() {
    expect(resolveLessonAudioPromptMode({ audioPromptMode: 'all' }, {}, 'silent')).to.equal('silent');
    expect(resolveLessonAudioPromptMode({}, { audioPromptMode: 'all' }, 'feedback')).to.equal('feedback');
  });
});
