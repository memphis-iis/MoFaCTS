import { Meteor } from 'meteor/meteor';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';

type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type SpeechMethodsDeps = {
  serverConsole: (...args: unknown[]) => void;
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
  getApiKeyResolutionErrorMessage: (error: unknown) => string;
};

function redactGoogleApiKeys(message: string): string {
  return message
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted Google API key]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted Google API key]');
}

function getSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactGoogleApiKeys(message);
}

type FetchImplementation = typeof fetch;

export async function postGoogleApiJson(
  url: string,
  request: string,
  timeoutMs: number = 30000,
  fetchImplementation: FetchImplementation = fetch
): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: request,
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const responseSummary = redactGoogleApiKeys(responseText).slice(0, 1000);
      throw new Error(`Google API HTTP ${response.status}${responseSummary ? `: ${responseSummary}` : ''}`);
    }
    try {
      return JSON.parse(responseText) as Record<string, any>;
    } catch {
      throw new Error('Google API returned an invalid JSON response');
    }
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`Google API request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function createSpeechMethods(deps: SpeechMethodsDeps) {
  return {
    makeGoogleTTSApiCall: async function(
      this: MethodContext,
      TDFId: string,
      message: string,
      audioPromptSpeakingRate: number,
      audioVolume: number,
      selectedVoice = '',
      languageCode = ''
    ) {
      try {
        deps.serverConsole('[TTS] makeGoogleTTSApiCall called:', {
          TDFId,
          message,
          audioPromptSpeakingRate,
          audioVolume,
          selectedVoice,
          languageCode,
        });
        const keyResolution = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), {
          userId: this.userId,
          tdfId: TDFId,
          kind: 'tts',
        });
        const ttsAPIKey = keyResolution.apiKey;

        if (keyResolution.errors.tdf) {
          deps.serverConsole('Could not access TDF TTS key:', deps.getApiKeyResolutionErrorMessage(keyResolution.errors.tdf));
        }
        if (keyResolution.errors.user) {
          deps.serverConsole('Could not access user TTS key:', deps.getApiKeyResolutionErrorMessage(keyResolution.errors.user));
        }
        if (keyResolution.source === 'tdf') {
          deps.serverConsole('Using TDF API key for TTS');
        } else if (keyResolution.source === 'user') {
          deps.serverConsole('Using user personal API key for TTS');
        } else if (keyResolution.source === 'admin') {
          deps.serverConsole('Using admin-provided API key alternative for TTS');
        }

        if (!ttsAPIKey) {
          deps.serverConsole('[TTS] ERROR: No API key available');
          throw new Meteor.Error('no-api-key', 'No TTS API key available');
        }

        const normalizedLanguageCode = String(languageCode || '').trim();
        if (!normalizedLanguageCode) {
          throw new Meteor.Error('missing-tts-language', 'Text-to-speech language code is required');
        }
        const normalizedVoice = String(selectedVoice || '').trim();
        const includeVoiceName = normalizedVoice.toLowerCase().startsWith(`${normalizedLanguageCode.toLowerCase()}-`);
        const voiceConfig = includeVoiceName
          ? { languageCode: normalizedLanguageCode, name: normalizedVoice }
          : { languageCode: normalizedLanguageCode };

        const request = JSON.stringify({
          input: {text: message},
          voice: voiceConfig,
          audioConfig: {audioEncoding: 'MP3', speakingRate: audioPromptSpeakingRate, volumeGainDb: audioVolume},
        });
        const response = await postGoogleApiJson(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(ttsAPIKey)}`,
          request
        );
        return response.audioContent;
      } catch (error: unknown) {
        deps.serverConsole('[TTS] ERROR in makeGoogleTTSApiCall:', getSafeErrorMessage(error));
        throw error instanceof Meteor.Error ? error : new Meteor.Error('google-tts-api-error', getSafeErrorMessage(error));
      }
    },

    makeGoogleSpeechAPICall: async function(this: MethodContext, TDFId: string, speechAPIKey: string | null, request: unknown, answerGrammar: string){
      this.unblock?.();

      deps.serverConsole('makeGoogleSpeechAPICall for TDFId:', TDFId);
      const requestRecord = (request && typeof request === 'object') ? request as Record<string, any> : {};
      const requestConfig = (requestRecord.config && typeof requestRecord.config === 'object')
        ? requestRecord.config as Record<string, any>
        : {};
      const audioContent = requestRecord.audio && typeof requestRecord.audio === 'object'
        ? String((requestRecord.audio as Record<string, any>).content || '')
        : '';
      const requestStartedAt = Date.now();
      deps.serverConsole('[SR DEBUG] makeGoogleSpeechAPICall request meta', {
        tdfId: TDFId,
        sampleRateHertz: requestConfig.sampleRateHertz,
        languageCode: requestConfig.languageCode,
        model: requestConfig.model,
        hasAdaptation: Boolean(requestConfig.adaptation),
        phraseSetCount: Array.isArray(requestConfig.adaptation?.phraseSets)
          ? requestConfig.adaptation.phraseSets.length
          : 0,
        phraseSetBoosts: Array.isArray(requestConfig.adaptation?.phraseSets)
          ? requestConfig.adaptation.phraseSets.map((phraseSet: Record<string, any>) => phraseSet?.boost ?? null)
          : [],
        phraseHintsCount: Array.isArray(requestConfig.adaptation?.phraseSets?.[0]?.phrases)
          ? requestConfig.adaptation.phraseSets[0].phrases.length
          : 0,
        audioBase64Length: audioContent.length,
        answerGrammarCount: Array.isArray(answerGrammar) ? answerGrammar.length : undefined,
      });

      const keyResolution = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), {
        userId: this.userId,
        tdfId: TDFId,
        kind: 'speech',
        initialKey: speechAPIKey,
      });
      speechAPIKey = keyResolution.apiKey;

      if (keyResolution.errors.tdf) {
        deps.serverConsole('Could not access TDF key:', deps.getApiKeyResolutionErrorMessage(keyResolution.errors.tdf));
      }
      if (keyResolution.errors.user) {
        deps.serverConsole('Could not access user API key:', deps.getApiKeyResolutionErrorMessage(keyResolution.errors.user));
      }
      if (keyResolution.source === 'tdf') {
        deps.serverConsole('Using TDF API key for speech recognition');
      } else if (keyResolution.source === 'user') {
        deps.serverConsole('Using user personal API key for speech recognition');
      } else if (keyResolution.source === 'admin') {
        deps.serverConsole('Using admin-provided API key alternative for speech recognition');
      }

      if (!speechAPIKey) {
        throw new Meteor.Error('no-api-key', 'No speech API key available');
      }

      try {
        const parsed = await postGoogleApiJson(
          `https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${encodeURIComponent(speechAPIKey)}`,
          JSON.stringify(request),
          30000
        );
        const elapsedMs = Date.now() - requestStartedAt;
        deps.serverConsole('[SR DEBUG] makeGoogleSpeechAPICall response meta', {
          tdfId: TDFId,
          elapsedMs,
          resultCount: Array.isArray(parsed?.results) ? parsed.results.length : 0,
          adaptationTimeout: Boolean(parsed?.speechAdaptationInfo?.adaptationTimeout),
          adaptationTimeoutMessage: parsed?.speechAdaptationInfo?.timeoutMessage || '',
        });
        return [answerGrammar, parsed];
      } catch (error: unknown) {
        const message = getSafeErrorMessage(error);
        deps.serverConsole('Google Speech API error:', message);
        throw new Meteor.Error('google-speech-api-error', 'Error with Google SR API call: ' + message);
      }
    },
  };
}
