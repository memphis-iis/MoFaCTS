import { expect } from 'chai';
import { buildSpeechRecognitionPhraseHints, normalizeSpeechToken } from './speechRecognitionService';

describe('speechRecognitionService phrase hints', function() {
  it('adds a dropped-final-th hint while preserving the canonical target', function() {
    const hints = buildSpeechRecognitionPhraseHints(['growth']);

    expect(hints).to.deep.equal(['growth', 'grow']);
  });

  it('does not add duplicate hints for repeated targets', function() {
    const hints = buildSpeechRecognitionPhraseHints(['growth', 'growth']);

    expect(hints).to.deep.equal(['growth', 'grow']);
  });

  it('normalizes vowel accents for speech grammar matching', function() {
    expect(normalizeSpeechToken('Qué')).to.equal('que');
    expect(normalizeSpeechToken('Él')).to.equal('el');
    expect(normalizeSpeechToken('que')).to.equal('que');
    expect(normalizeSpeechToken('año')).to.equal('año');
  });
});
