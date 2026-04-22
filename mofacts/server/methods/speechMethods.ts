import { Meteor } from 'meteor/meteor';
import type { IncomingMessage } from 'http';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';

const https = require('https');

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

async function makeHTTPSrequest(options: unknown, request: string | Buffer, timeoutMs: number = 30000){
  return new Promise<Buffer>((resolve, reject) => {
    let chunks: Buffer[] = [];
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const req = https.request(options as Parameters<typeof https.request>[0], (res: IncomingMessage) => {
      res.on('data', (d: Buffer) => {
          chunks.push(d);
      })
      res.on('end', function() {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve(Buffer.concat(chunks));
      })
    })

    req.on('error', (e: Error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(new Error(e.message));
    });

    timeoutHandle = setTimeout(() => {
      req.destroy();
      reject(new Error(`HTTPS request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    req.write(request)
    req.end()
  });
}

export function createSpeechMethods(deps: SpeechMethodsDeps) {
  return {
    makeGoogleTTSApiCall: async function(
      this: MethodContext,
      TDFId: string,
      message: string,
      audioPromptSpeakingRate: number,
      audioVolume: number,
      selectedVoice = 'en-US-Standard-A',
      languageCode = 'en-US'
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
        }

        if (!ttsAPIKey) {
          deps.serverConsole('[TTS] ERROR: No API key available');
          throw new Meteor.Error('no-api-key', 'No TTS API key available');
        }

        const normalizedLanguageCode = String(languageCode || '').trim() || 'en-US';
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
        const options = {
          hostname: 'texttospeech.googleapis.com',
          path: '/v1/text:synthesize?key=' + ttsAPIKey,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
        const data = await makeHTTPSrequest(options, request) as Buffer | string;
        const response = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf-8') : String(data));
        return response.audioContent;
      } catch (error: unknown) {
        deps.serverConsole('[TTS] ERROR in makeGoogleTTSApiCall:', error);
        throw error;
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
      }

      if (!speechAPIKey) {
        throw new Meteor.Error('no-api-key', 'No speech API key available');
      }

      const options = {
        hostname: 'speech.googleapis.com',
        path: '/v1p1beta1/speech:recognize?key=' + speechAPIKey,
        method: 'POST'
      }
      try {
        const data = await makeHTTPSrequest(options, JSON.stringify(request), 30000) as Buffer | string;
        const parsed = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf-8') : String(data));
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
        deps.serverConsole('Google Speech API error:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Meteor.Error('google-speech-api-error', 'Error with Google SR API call: ' + message);
      }
    },
  };
}
