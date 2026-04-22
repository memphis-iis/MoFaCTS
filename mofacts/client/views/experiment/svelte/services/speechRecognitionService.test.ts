import { expect } from 'chai';
import { buildSpeechRecognitionPhraseHints } from './speechRecognitionService';

describe('speechRecognitionService phrase hints', function() {
  it('adds a dropped-final-th hint while preserving the canonical target', function() {
    const hints = buildSpeechRecognitionPhraseHints(['growth']);

    expect(hints).to.deep.equal(['growth', 'grow']);
  });

  it('does not add duplicate hints for repeated targets', function() {
    const hints = buildSpeechRecognitionPhraseHints(['growth', 'growth']);

    expect(hints).to.deep.equal(['growth', 'grow']);
  });
});
