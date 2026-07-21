import { expect } from 'chai';
import { resolvePracticeTtsIndicatorState } from './practiceAudioIndicators';

describe('practice audio indicators', () => {
  it('hides headphones for a silent lesson even when the user audio mode is enabled', () => {
    expect(resolvePracticeTtsIndicatorState({
      lessonPromptMode: 'silent',
      runtimePromptMode: 'question',
      keyAvailable: true,
    })).to.deep.equal({
      visible: false,
      active: false,
      runtimePromptModeEnabled: true,
      keyAvailable: true,
    });
  });

  it('shows headphones for every enabled lesson audio mode', () => {
    for (const lessonPromptMode of ['question', 'feedback', 'all']) {
      expect(resolvePracticeTtsIndicatorState({
        lessonPromptMode,
        runtimePromptMode: lessonPromptMode,
        keyAvailable: true,
      }).visible).to.equal(true);
    }
  });

  it('shows configured-but-inactive headphones when runtime audio or its key is unavailable', () => {
    expect(resolvePracticeTtsIndicatorState({
      lessonPromptMode: 'feedback',
      runtimePromptMode: 'silent',
      keyAvailable: true,
    })).to.include({ visible: true, active: false });

    expect(resolvePracticeTtsIndicatorState({
      lessonPromptMode: 'feedback',
      runtimePromptMode: 'feedback',
      keyAvailable: false,
    })).to.include({ visible: true, active: false });
  });
});
