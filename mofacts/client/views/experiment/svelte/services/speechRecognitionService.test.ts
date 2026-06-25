import { expect } from 'chai';
import {
  resolveSpeechFilterCloseResponses,
  resolveSpeechIgnoreOutOfGrammarResponses,
  resolveSpeechRecognitionLanguage
} from '../../../../lib/speechRecognitionConfig';
import {
  buildSpeechRecognitionPhraseHints,
  expandSpeechRecognitionGrammarAnswer,
  extractSpeechNumberSignature,
  normalizeSpeechGrammarLookupToken,
  normalizeSpeechToken,
  speechNumbersAreCompatible
} from './speechRecognitionService';

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

  it('normalizes punctuation separators for speech grammar lookup', function() {
    expect(normalizeSpeechGrammarLookupToken('Hwa-Rang 2')).to.equal('hwa rang 2');
    expect(normalizeSpeechGrammarLookupToken('Hwa Rang two')).to.equal('hwa rang two');
  });

  it('keeps digit identity available for speech matching', function() {
    expect(normalizeSpeechToken('Chang Mu 3')).to.equal('chang mu 3');
    expect(extractSpeechNumberSignature('Chang Mu 3')).to.deep.equal(['3']);
    expect(extractSpeechNumberSignature('Chang Mu three')).to.deep.equal(['3']);
    expect(extractSpeechNumberSignature('Chang Mu twenty one')).to.deep.equal(['21']);
  });

  it('rejects phonetic speech matches with mismatched target numbers', function() {
    expect(speechNumbersAreCompatible('chang moo three', 'chang mu 3')).to.equal(true);
    expect(speechNumbersAreCompatible('chang moo 7', 'chang mu 3')).to.equal(false);
    expect(speechNumbersAreCompatible('chang moo', 'chang mu 3')).to.equal(false);
    expect(speechNumbersAreCompatible('chang moo', 'chang mu')).to.equal(true);
  });

  it('expands answer alternatives for speech grammar', function() {
    expect(expandSpeechRecognitionGrammarAnswer('Choong Moo two|Choong Moo 2'))
      .to.deep.equal(['choong moo two', 'choong moo 2']);
  });

  it('expands hyphenated answer alternatives for speech grammar', function() {
    expect(expandSpeechRecognitionGrammarAnswer('Hwa-Rang two|Hwa-Rang 2'))
      .to.deep.equal(['hwa-rang two', 'hwa-rang 2']);
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

  it('defaults close speech-response filtering to enabled', function() {
    expect(resolveSpeechFilterCloseResponses({})).to.equal(true);
    expect(resolveSpeechFilterCloseResponses(null)).to.equal(true);
  });

  it('honors explicit close speech-response filtering values', function() {
    expect(resolveSpeechFilterCloseResponses({ srfilterclose: 'true' })).to.equal(true);
    expect(resolveSpeechFilterCloseResponses({ srfilterclose: 'false' })).to.equal(false);
  });

  it('fails clearly on invalid close speech-response filtering values', function() {
    expect(() => resolveSpeechFilterCloseResponses({ srfilterclose: 'sometimes' }))
      .to.throw('Invalid setspec.srfilterclose value "sometimes" for SR');
  });

  it('keeps the existing speech language default', function() {
    expect(resolveSpeechRecognitionLanguage({})).to.equal('en-US');
  });
});
