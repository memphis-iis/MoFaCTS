import { expect } from 'chai';
import {
  classifySrInitFailure,
  evaluateSrAvailability,
  resolveSpeechApiKeyAvailability,
} from './audioAvailability';

describe('audioAvailability', function() {
  it('returns available when user pref, TDF audio input, and key availability are satisfied', function() {
    const result = evaluateSrAvailability({
      user: { audioSettings: { audioInputMode: true } },
      tdfFile: { tdfs: { tutor: { setspec: { audioInputEnabled: 'true', speechAPIKey: 'tdf-key', speechRecognitionLanguage: 'es-ES' } } } },
      sessionSpeechApiKey: null,
    });
    expect(result.status).to.equal('available');
    expect(result.detail).to.equal('ok');
  });

  it('blocks when the TDF does not explicitly enable speech recognition', function() {
    const result = evaluateSrAvailability({
      user: { audioSettings: { audioInputMode: true } },
      tdfFile: { tdfs: { tutor: { setspec: { speechAPIKey: 'tdf-key' } } } },
      sessionSpeechApiKey: null,
    });
    expect(result.status).to.equal('blocked');
    expect(result.detail).to.equal('tdf_audio_disabled');
  });

  it('allows speech input without a TDF speech language when key availability is satisfied', function() {
    const result = evaluateSrAvailability({
      user: { audioSettings: { audioInputMode: true } },
      tdfFile: { tdfs: { tutor: { setspec: { audioInputEnabled: 'true', speechAPIKey: 'tdf-key' } } } },
      sessionSpeechApiKey: '',
    });
    expect(result.status).to.equal('available');
    expect(result.detail).to.equal('ok');
  });

  it('blocks on missing key while user audio and speech language are enabled', function() {
    const result = evaluateSrAvailability({
      user: { audioSettings: { audioInputMode: true } },
      tdfFile: { tdfs: { tutor: { setspec: { audioInputEnabled: 'true', speechRecognitionLanguage: 'es-ES' } } } },
      sessionSpeechApiKey: '',
    });
    expect(result.status).to.equal('blocked');
    expect(result.detail).to.equal('missing_key');
  });

  it('supports key resolution from tdf, user, or session', function() {
    expect(resolveSpeechApiKeyAvailability({
      user: { speechAPIKey: '' },
      tdfFile: { tdfs: { tutor: { setspec: { speechAPIKey: 'tdf-key' } } } },
      sessionSpeechApiKey: '',
    })).to.equal(true);
    expect(resolveSpeechApiKeyAvailability({
      user: { speechAPIKey: 'user-key' },
      tdfFile: { tdfs: { tutor: { setspec: {} } } },
      sessionSpeechApiKey: '',
    })).to.equal(true);
    expect(resolveSpeechApiKeyAvailability({
      user: { speechAPIKey: '' },
      tdfFile: { tdfs: { tutor: { setspec: {} } } },
      sessionSpeechApiKey: 'session-key',
    })).to.equal(true);
  });

  it('classifies explicit permission denial as hard failure', function() {
    const error = new Error('Permission denied by browser');
    error.name = 'NotAllowedError';
    const result = classifySrInitFailure({
      error,
      secureContext: true,
      hasAnySpeechApiKey: true,
      browserSupportsMediaDevices: true,
    });
    expect(result.retryable).to.equal(false);
    expect(result.detail).to.equal('permission_denied');
  });

  it('classifies interruption errors as retryable', function() {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    const result = classifySrInitFailure({
      error,
      secureContext: true,
      hasAnySpeechApiKey: true,
      browserSupportsMediaDevices: true,
    });
    expect(result.retryable).to.equal(true);
    expect(result.detail).to.equal('media_interrupted');
  });
});
