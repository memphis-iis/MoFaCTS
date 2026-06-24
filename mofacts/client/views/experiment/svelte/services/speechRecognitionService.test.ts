import { expect } from 'chai';
import {
  resolveSpeechIgnoreOutOfGrammarResponses,
  resolveSpeechRecognitionLanguage
} from '../../../../lib/speechRecognitionConfig';
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

describe('speechRecognitionConfig', function() {
  it('defaults missing out-of-grammar filtering to enabled', function() {
    expect(resolveSpeechIgnoreOutOfGrammarResponses({})).to.equal(true);
    expect(resolveSpeechIgnoreOutOfGrammarResponses(null)).to.equal(true);
  });

  it('honors explicit out-of-grammar filtering values', function() {
    expect(resolveSpeechIgnoreOutOfGrammarResponses({ speechIgnoreOutOfGrammarResponses: 'true' })).to.equal(true);
    expect(resolveSpeechIgnoreOutOfGrammarResponses({ speechIgnoreOutOfGrammarResponses: 'false' })).to.equal(false);
  });

  it('keeps the existing speech language default', function() {
    expect(resolveSpeechRecognitionLanguage({})).to.equal('en-US');
  });
});
