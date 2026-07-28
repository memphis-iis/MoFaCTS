import { expect } from 'chai';
import {
  audioPromptModeAllows,
  resolveUnitAudioPromptMode,
  isAudioPromptModeEnabled,
  normalizeAudioPromptMode,
} from './audioPromptMode';

describe('audioPromptMode', function() {
  it('uses an explicit unit mode and otherwise inherits the active lesson mode', function() {
    expect(resolveUnitAudioPromptMode({ audioPromptMode: 'feedback' }, 'question')).to.equal('feedback');
    expect(resolveUnitAudioPromptMode({}, 'question')).to.equal('question');
    expect(resolveUnitAudioPromptMode({ audioPromptMode: 'silent' }, 'all')).to.equal('silent');
    expect(resolveUnitAudioPromptMode({ audioPromptMode: 'all' }, 'silent', false)).to.equal('silent');
  });
  it('normalizes unknown prompt modes to silent', function() {
    expect(normalizeAudioPromptMode('feedback')).to.equal('feedback');
    expect(normalizeAudioPromptMode(' FEEDBACK ')).to.equal('feedback');
    expect(normalizeAudioPromptMode('sometimes')).to.equal('silent');
    expect(normalizeAudioPromptMode(undefined)).to.equal('silent');
  });

  it('applies source-specific generated speech rules', function() {
    expect(audioPromptModeAllows('silent', 'question')).to.equal(false);
    expect(audioPromptModeAllows('silent', 'feedback')).to.equal(false);
    expect(audioPromptModeAllows('question', 'question')).to.equal(true);
    expect(audioPromptModeAllows('question', 'feedback')).to.equal(false);
    expect(audioPromptModeAllows('feedback', 'question')).to.equal(false);
    expect(audioPromptModeAllows('feedback', 'feedback')).to.equal(true);
    expect(audioPromptModeAllows('all', 'question')).to.equal(true);
    expect(audioPromptModeAllows('all', 'feedback')).to.equal(true);
  });

  it('derives whether any generated spoken audio is enabled', function() {
    expect(isAudioPromptModeEnabled('silent')).to.equal(false);
    expect(isAudioPromptModeEnabled('question')).to.equal(true);
    expect(isAudioPromptModeEnabled('feedback')).to.equal(true);
    expect(isAudioPromptModeEnabled('all')).to.equal(true);
  });
});

