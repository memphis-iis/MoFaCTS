import { assert } from 'chai';
import { resolveSpeechRecognitionLanguage, SpeechRecognitionConfigurationError } from './speechRecognitionConfig';

describe('speech recognition language defaults', () => {
  it('uses English without requiring a lesson or authored language field', () => {
    for (const settings of [undefined, null, {}, { speechRecognitionLanguage: null },
      { speechRecognitionLanguage: '' }, { speechRecognitionLanguage: '  ' },
      { speechRecognitionLanguage: [] }, { speechRecognitionLanguage: ['', ' '] }]) {
      assert.strictEqual(resolveSpeechRecognitionLanguage(settings), 'en-US');
    }
  });

  it('preserves explicit supported languages and the first nonblank authored selection', () => {
    assert.strictEqual(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: ' es-ES ' }), 'es-ES');
    assert.strictEqual(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: 'en-GB' }), 'en-GB');
    assert.strictEqual(resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: [' ', 'es-ES', 'en-US'] }), 'es-ES');
  });

  it('rejects explicitly malformed languages instead of silently replacing them', () => {
    for (const value of [7, true, {}, 'es', 'unsupported-language', ['unsupported-language', 'en-US'], ['en-US', 7]]) {
      assert.throws(() => resolveSpeechRecognitionLanguage({ speechRecognitionLanguage: value }), SpeechRecognitionConfigurationError);
    }
  });
});
