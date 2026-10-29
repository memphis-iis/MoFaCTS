import { expect } from 'chai';
import { Session } from 'meteor/session';
import { TARGET_UI_LOCALES } from '../../../../../common/lib/interfaceLocales';
import { UI_LOCALE_SESSION_KEY } from '../../../../lib/interfaceLocaleState';
import {
  resolveSpeechRecognitionLanguage,
  resolveSpeechFilterCloseResponses,
  resolveSpeechIgnoreOutOfGrammarResponses,
  SpeechRecognitionConfigurationError,
} from '../../../../lib/speechRecognitionConfig';
import {
  buildSpeechRecognitionPhraseHints,
  expandSpeechRecognitionGrammarAnswer,
  extractSpeechNumberSignature,
  normalizeSpeechGrammarLookupToken,
  normalizeSpeechToken,
  speechNumbersAreCompatible,
  summarizeSpeechAdaptation,
  speechRecognitionService,
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

describe('speech recognition diagnostics', function() {
  it('reports adaptation counts and boosts without authored targets or phrase hints', function() {
    const target = 'Private current answer';
    const hint = 'Private phrase hint';
    const summary = summarizeSpeechAdaptation({
      phraseSets: [
        { boost: 20, phrases: [{ value: target }] },
        { boost: 5, phrases: [{ value: hint }, { value: 'Private background answer' }] },
      ],
    }, target);

    expect(summary.totalPhraseSets).to.equal(2);
    expect(summary.totalPhrases).to.equal(3);
    expect(summary.targetPhraseSetIndexes).to.deep.equal([0]);
    expect(summary.targetPhraseSetBoosts).to.deep.equal([20]);
    expect(summary.phraseSets).to.deep.equal([
      { index: 0, boost: 20, phraseCount: 1, containsCurrentAnswer: true },
      { index: 1, boost: 5, phraseCount: 2, containsCurrentAnswer: false },
    ]);
    expect(summary).not.to.have.property('currentAnswer');
    expect(JSON.stringify(summary)).not.to.contain('Private');
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

  it('uses explicit speech-language strings and first-nonblank repeated authored values', function() {
    expect(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: ' es-ES ' }))
      .to.equal('es-ES');
    expect(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: [' ', 'es-ES', 'en-US'] }))
      .to.equal('es-ES');
  });

  it('rejects missing or blank speech-language configuration', function() {
    for (const setSpec of [undefined, null, {}, { speechRecognitionLanguage: null },
      { speechRecognitionLanguage: '' }, { speechRecognitionLanguage: '  ' },
      { speechRecognitionLanguage: [] }, { speechRecognitionLanguage: ['', ' '] }]) {
      expect(() => resolveSpeechRecognitionLanguage(setSpec)).to.throw(SpeechRecognitionConfigurationError);
    }
  });

  it('rejects malformed and unsupported values without selecting a later valid language', function() {
    for (const value of [7, true, {}, 'es', 'unsupported-language', ['unsupported-language', 'es-ES'], ['es-ES', 7]]) {
      expect(() => resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: value }))
        .to.throw(SpeechRecognitionConfigurationError);
    }
  });

  it('keeps speech language independent of every target UI locale', function() {
    const previous = Session.get(UI_LOCALE_SESSION_KEY);
    try {
      for (const locale of TARGET_UI_LOCALES) {
        Session.set(UI_LOCALE_SESSION_KEY, locale);
        expect(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: 'es-ES' }), locale).to.equal('es-ES');
        expect(() => resolveSpeechRecognitionLanguage({}), locale).to.throw(SpeechRecognitionConfigurationError);
      }
    } finally { Session.set(UI_LOCALE_SESSION_KEY, previous); }
  });

  it('reports missing live SR language as a hard configuration error before recording starts', function() {
    const previous = Session.get('currentTdfFile');
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    let cleanup: (() => void) | undefined;
    try {
      Session.set('currentTdfFile', { tdfs: { tutor: { setspec: { audioInputEnabled: true } } } });
      cleanup = speechRecognitionService({})(event => events.push(event), () => undefined);
      expect(events).to.have.length(1);
      expect(events[0]).to.include({ type: 'ERROR', source: 'speechRecognitionConfiguration' });
      expect(events[0]?.error).to.contain('explicit setspec.speechRecognitionLanguage');
    } finally {
      cleanup?.();
      Session.set('currentTdfFile', previous);
    }
  });
});
