import { expect } from 'chai';
import { GOOGLE_STT_LANGUAGE_CODES, GOOGLE_TTS_LANGUAGE_CODES } from '../fieldRegistrySectionCore';
import {
  TARGET_UI_LOCALES,
  canonicalizeUiLocale,
  getPlatformLocaleReviewStatus,
  getPrimarySpeechRecognitionLanguageCode,
  getPrimaryTtsLanguageCode,
  getTextDirectionForLocale,
  isPlatformLocaleProductionEnabled,
  resolvePlatformPromptTtsLanguage,
} from './interfaceLocales';

describe('interface locale source of truth', function() {
  it('defines the ten initial target UI locales', function() {
    expect(TARGET_UI_LOCALES).to.deep.equal([
      'en',
      'zh-Hans',
      'hi',
      'es',
      'ar',
      'fr',
      'bn',
      'pt',
      'id',
      'ur',
    ]);
  });

  it('maps each target UI locale to the invariant primary TTS code', function() {
    expect(getPrimaryTtsLanguageCode('en')).to.equal('en-US');
    expect(getPrimaryTtsLanguageCode('zh-Hans')).to.equal('cmn-CN');
    expect(getPrimaryTtsLanguageCode('hi')).to.equal('hi-IN');
    expect(getPrimaryTtsLanguageCode('es')).to.equal('es-ES');
    expect(getPrimaryTtsLanguageCode('ar')).to.equal('ar-XA');
    expect(getPrimaryTtsLanguageCode('fr')).to.equal('fr-FR');
    expect(getPrimaryTtsLanguageCode('bn')).to.equal('bn-IN');
    expect(getPrimaryTtsLanguageCode('pt')).to.equal('pt-BR');
    expect(getPrimaryTtsLanguageCode('id')).to.equal('id-ID');
    expect(getPrimaryTtsLanguageCode('ur')).to.equal('ur-IN');
  });

  it('keeps every primary TTS code in the provider language-code registry', function() {
    const providerCodes = new Set<string>(GOOGLE_TTS_LANGUAGE_CODES);

    for (const locale of TARGET_UI_LOCALES) {
      expect(providerCodes.has(getPrimaryTtsLanguageCode(locale)), locale).to.equal(true);
    }
  });

  it('keeps every primary speech-recognition code in the provider language-code registry', function() {
    const providerCodes = new Set<string>(GOOGLE_STT_LANGUAGE_CODES);

    for (const locale of TARGET_UI_LOCALES) {
      expect(providerCodes.has(getPrimarySpeechRecognitionLanguageCode(locale)), locale).to.equal(true);
    }
  });

  it('tracks locale review and production enablement status explicitly', function() {
    expect(getPlatformLocaleReviewStatus('en')).to.equal('enabled');
    expect(isPlatformLocaleProductionEnabled('en')).to.equal(true);

    for (const locale of TARGET_UI_LOCALES.filter((value) => value !== 'en')) {
      expect(getPlatformLocaleReviewStatus(locale)).to.equal('draft');
      expect(isPlatformLocaleProductionEnabled(locale)).to.equal(false);
    }
  });

  it('canonicalizes only explicit locale aliases', function() {
    expect(canonicalizeUiLocale('en-US')).to.equal('en');
    expect(canonicalizeUiLocale('zh-CN')).to.equal('zh-Hans');
    expect(canonicalizeUiLocale('pt-PT')).to.equal('pt');
    expect(canonicalizeUiLocale('de-DE')).to.equal(null);
    expect(canonicalizeUiLocale('')).to.equal(null);
  });

  it('marks Arabic and Urdu as right-to-left', function() {
    expect(getTextDirectionForLocale('ar')).to.equal('rtl');
    expect(getTextDirectionForLocale('ur')).to.equal('rtl');
    expect(getTextDirectionForLocale('hi')).to.equal('ltr');
  });

  it('resolves platform prompt TTS from UI locale without language substitution', function() {
    expect(resolvePlatformPromptTtsLanguage({ uiLocale: 'fr' })).to.deep.equal({
      status: 'ok',
      languageCode: 'fr-FR',
    });
    expect(resolvePlatformPromptTtsLanguage({ uiLocale: 'de-DE' }).status).to.equal('unsupported-locale');
  });

  it('requires explicit reviewed TTS override permission', function() {
    expect(resolvePlatformPromptTtsLanguage({
      uiLocale: 'es',
      voiceLocaleOverride: 'es-US',
      allowedVoiceLocaleOverrides: ['es-US'],
    })).to.deep.equal({
      status: 'ok',
      languageCode: 'es-US',
    });

    expect(resolvePlatformPromptTtsLanguage({
      uiLocale: 'es',
      voiceLocaleOverride: 'es-US',
      allowedVoiceLocaleOverrides: [],
    }).status).to.equal('disallowed-override');
  });

  it('reports missing voices clearly instead of substituting another language', function() {
    expect(resolvePlatformPromptTtsLanguage({
      uiLocale: 'ar',
      availableVoiceLocales: ['en-US'],
    })).to.deep.include({
      status: 'missing-voice',
      languageCode: 'ar-XA',
    });
  });
});
