import { expect } from 'chai';
import {
  TARGET_UI_LOCALES,
  getPrimaryTtsLanguageCode,
} from '../../../../../common/lib/interfaceLocales';
import { resetAudioState, setAudioPromptMode } from '../../../../lib/state/audioState';
import {
  estimateSpeechSynthesisCompletionTimeoutMs,
  isAppleMobileSpeechSynthesisEnvironment,
  resolveAuthoredContentTtsLanguageCode,
  resolveTtsLanguageForSpeak,
  shouldPlayAudioPrompt,
  ttsPlaybackService,
} from './ttsService';

describe('ttsService Apple mobile recovery helpers', function() {
  afterEach(function() {
    resetAudioState();
  });

  it('targets iPhone Safari user agents for the recovery path', function() {
    const isTargeted = isAppleMobileSpeechSynthesisEnvironment(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5
    );

    expect(isTargeted).to.equal(true);
  });

  it('does not target Android Chrome user agents', function() {
    const isTargeted = isAppleMobileSpeechSynthesisEnvironment(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      5
    );

    expect(isTargeted).to.equal(false);
  });

  it('keeps a minimum cleanup timeout for short utterances', function() {
    expect(estimateSpeechSynthesisCompletionTimeoutMs('France', 1)).to.equal(2500);
  });

  it('extends cleanup timeout for longer prompts and slower rates', function() {
    const fastTimeout = estimateSpeechSynthesisCompletionTimeoutMs('The capital city is Buenos Aires.', 1);
    const slowTimeout = estimateSpeechSynthesisCompletionTimeoutMs('The capital city is Buenos Aires.', 0.5);

    expect(slowTimeout).to.be.greaterThan(fastTimeout);
    expect(fastTimeout).to.be.greaterThan(2500);
  });

  it('preserves authored content TTS language resolution', function() {
    expect(resolveAuthoredContentTtsLanguageCode({ textToSpeechLanguage: 'es-ES' }, '')).to.equal('es-ES');
    expect(resolveAuthoredContentTtsLanguageCode(null, 'fr-FR-Neural2-A')).to.equal('fr-FR');
    expect(() => resolveAuthoredContentTtsLanguageCode(null, ''))
      .to.throw('Authored content TTS requires an explicit text-to-speech language or voice locale.');
  });

  it('resolves platform prompt TTS from UI locale instead of authored content settings', function() {
    expect(resolveTtsLanguageForSpeak({
      setspec: { textToSpeechLanguage: 'en-US' },
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'hi',
    })).to.deep.equal({
      status: 'ok',
      languageCode: 'hi-IN',
    });
  });

  it('resolves platform prompt TTS to the primary TTS code for every target UI locale', function() {
    for (const locale of TARGET_UI_LOCALES) {
      expect(resolveTtsLanguageForSpeak({
        setspec: { textToSpeechLanguage: 'en-US' },
        requestedVoice: '',
        languageSource: 'platform-prompt',
        uiLocale: locale,
      }), locale).to.deep.equal({
        status: 'ok',
        languageCode: getPrimaryTtsLanguageCode(locale),
      });
    }
  });

  it('keeps authored-content TTS separate from platform-prompt UI locale TTS', function() {
    expect(resolveTtsLanguageForSpeak({
      setspec: { textToSpeechLanguage: 'en-US' },
      requestedVoice: '',
      languageSource: 'authored-content',
      uiLocale: 'es',
    })).to.deep.equal({
      status: 'ok',
      languageCode: 'en-US',
    });

    expect(resolveTtsLanguageForSpeak({
      setspec: { textToSpeechLanguage: 'zh-CN' },
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'en',
    })).to.deep.equal({
      status: 'ok',
      languageCode: 'en-US',
    });
  });

  it('reports unsupported platform prompt locales without substituting English', function() {
    expect(resolveTtsLanguageForSpeak({
      setspec: { textToSpeechLanguage: 'en-US' },
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'de-DE',
    }).status).to.equal('unsupported-locale');
  });

  it('reports missing platform prompt voices without substituting another language', function() {
    expect(resolveTtsLanguageForSpeak({
      setspec: null,
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'ar',
      availableVoiceLocales: ['en-US'],
    })).to.deep.include({
      status: 'missing-voice',
      languageCode: 'ar-XA',
    });
  });

  it('requires explicit reviewed platform prompt TTS voice overrides', function() {
    expect(resolveTtsLanguageForSpeak({
      setspec: null,
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'pt',
      voiceLocaleOverride: 'pt-PT',
      allowedVoiceLocaleOverrides: ['pt-PT'],
    })).to.deep.equal({
      status: 'ok',
      languageCode: 'pt-PT',
    });

    expect(resolveTtsLanguageForSpeak({
      setspec: null,
      requestedVoice: '',
      languageSource: 'platform-prompt',
      uiLocale: 'pt',
      voiceLocaleOverride: 'pt-PT',
      allowedVoiceLocaleOverrides: [],
    }).status).to.equal('disallowed-override');
  });

  it('returns audio-unavailable errors while leaving visual text available', async function() {
    setAudioPromptMode('feedback');

    const result = await ttsPlaybackService({}, {
      text: 'Continue',
      languageSource: 'platform-prompt',
      uiLocale: 'de-DE',
    });

    expect(result).to.deep.equal({
      status: 'error',
      error: 'Unsupported UI locale "de-DE"',
      textAvailable: true,
    });
  });

  it('does not play generated feedback speech when spoken audio mode is silent', async function() {
    setAudioPromptMode('silent');

    const result = await ttsPlaybackService({}, {
      text: 'Incorrect. The correct answer is red.',
      isQuestion: false,
    });

    expect(result).to.deep.equal({
      status: 'completed',
    });
  });

  it('applies spoken audio mode by generated speech source', function() {
    setAudioPromptMode('silent');
    expect(shouldPlayAudioPrompt('question')).to.equal(false);
    expect(shouldPlayAudioPrompt('feedback')).to.equal(false);

    setAudioPromptMode('question');
    expect(shouldPlayAudioPrompt('question')).to.equal(true);
    expect(shouldPlayAudioPrompt('feedback')).to.equal(false);

    setAudioPromptMode('feedback');
    expect(shouldPlayAudioPrompt('question')).to.equal(false);
    expect(shouldPlayAudioPrompt('feedback')).to.equal(true);

    setAudioPromptMode('all');
    expect(shouldPlayAudioPrompt('question')).to.equal(true);
    expect(shouldPlayAudioPrompt('feedback')).to.equal(true);
  });

  it('plays recorded content audio even when spoken audio mode is silent', async function() {
    setAudioPromptMode('silent');
    const OriginalAudio = globalThis.Audio;
    let playCalls = 0;

    class MockAudio {
      onended: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;
      currentTime = 0;
      preload = '';
      constructor(public src: string) {}
      pause() {}
      play() {
        playCalls++;
        setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      writable: true,
      value: MockAudio,
    });
    try {
      const result = await ttsPlaybackService({}, {
        audioSrc: '/media/prompt.mp3',
        isQuestion: true,
      });

      expect(result).to.deep.equal({ status: 'completed' });
      expect(playCalls).to.equal(1);
    } finally {
      Object.defineProperty(globalThis, 'Audio', {
        configurable: true,
        writable: true,
        value: OriginalAudio,
      });
    }
  });
});
