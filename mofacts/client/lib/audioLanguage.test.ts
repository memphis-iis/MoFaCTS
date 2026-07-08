import { expect } from 'chai';
import {
  canResolveExplicitTtsLanguageCode,
  inferTtsLanguageFromVoice,
  resolveExplicitTtsLanguageCode,
} from './audioLanguage';

describe('audioLanguage', function() {
  it('uses configured text-to-speech language before voice inference', function() {
    expect(resolveExplicitTtsLanguageCode({
      configuredLanguage: 'es-ES',
      requestedVoice: 'en-US-Standard-A',
      contextLabel: 'TTS test',
    })).to.equal('es-ES');
  });

  it('infers language from explicit voice locale when no language is configured', function() {
    expect(inferTtsLanguageFromVoice('fr-FR-Neural2-A')).to.equal('fr-FR');
    expect(resolveExplicitTtsLanguageCode({
      configuredLanguage: '',
      requestedVoice: 'fr-FR-Neural2-A',
      contextLabel: 'TTS test',
    })).to.equal('fr-FR');
  });

  it('fails clearly instead of substituting English when language and voice are missing', function() {
    expect(canResolveExplicitTtsLanguageCode({
      configuredLanguage: '',
      requestedVoice: '',
      contextLabel: 'TTS test',
    })).to.equal(false);
    expect(() => resolveExplicitTtsLanguageCode({
      configuredLanguage: '',
      requestedVoice: '',
      contextLabel: 'TTS test',
    })).to.throw('TTS test requires an explicit text-to-speech language or voice locale.');
  });
});
