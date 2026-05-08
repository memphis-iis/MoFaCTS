/**
 * Text-to-Speech (TTS) Service
 *
 * Wraps existing TTS infrastructure (audioContextManager.js, plyrHelper.js) for XState machine.
 * Handles both browser-based TTS and pre-recorded audio playback.
 *
 * Reference:
 * - client/lib/audioContextManager.js (audioManager)
 * - client/lib/plyrHelper.js (Plyr audio player)
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { audioManager } from '../../../../lib/audioContextManager';
import {
  getUnlockedAppleMobileAudioElement,
  warnIfAppleMobileAudioMayBeLocked,
} from '../../../../lib/audioUnlock';
import { CardStore } from '../../modules/cardStore';
import { startRecording as startSrRecording } from './speechRecognitionService';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import {
  getAudioPromptQuestionSpeakingRate,
  getAudioPromptQuestionVolume,
  getAudioPromptVoice,
  getAudioPromptFeedbackSpeakingRate,
  getAudioPromptFeedbackVolume,
  getAudioPromptFeedbackVoice
} from '../../../../lib/state/audioState';
import { resolveDynamicAssetPath } from './mediaResolver';
import { logIdInvariantBreachOnce } from '../../../../lib/idContext';
import type {
  AudioPromptSource,
  TtsPlaybackEvent,
  TtsServiceResult,
  TtsSpeakOptions
} from '../../../../../common/types/svelteServices';

type MeteorCallAsyncCompat = typeof Meteor & {
  callAsync: (name: string, ...args: unknown[]) => Promise<unknown>;
};

type UserAudioProfile = {
  audioSettings?: {
    audioPromptMode?: string;
  };
};

const MeteorCompat = Meteor as MeteorCallAsyncCompat;

class TtsPlaybackCancelledError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TtsPlaybackCancelledError';
  }
}

type ActiveTtsPlayback = {
  id: number;
  cancellation: TtsPlaybackCancelledError | null;
  cancelHandlers: Set<(error: TtsPlaybackCancelledError) => void>;
  cancel: (reason: string) => void;
};

let activeTtsPlayback: ActiveTtsPlayback | null = null;
let ttsPlaybackSequence = 0;

function isTtsPlaybackCancelled(error: unknown): error is TtsPlaybackCancelledError {
  return error instanceof TtsPlaybackCancelledError;
}

function clearTtsPlaybackState(): void {
  audioManager.pauseCurrentAudio();
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  CardStore.setRecordingLocked(false);
  CardStore.setTtsRequested(false);
}

export function stopTtsPlayback(reason = 'stopped'): void {
  const playback = activeTtsPlayback;
  clearTtsPlaybackState();
  playback?.cancel(reason);
  activeTtsPlayback = null;
}

function registerTtsCancellationHandler(
  playbackId: number,
  handler: (error: TtsPlaybackCancelledError) => void
): (() => void) {
  const playback = activeTtsPlayback;
  if (!playback || playback.id !== playbackId) {
    return () => {};
  }

  if (playback.cancellation) {
    handler(playback.cancellation);
    return () => {};
  }

  playback.cancelHandlers.add(handler);
  return () => {
    playback.cancelHandlers.delete(handler);
  };
}

function isWebKitAudioEngine(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
}

export function isAppleMobileSpeechSynthesisEnvironment(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0
): boolean {
  const normalizedUserAgent = String(userAgent || '');
  if (/(iPhone|iPad|iPod)/i.test(normalizedUserAgent)) {
    return true;
  }

  // Some iPads advertise as Mac; preserve iOS-specific recovery there too.
  return /\bMacintosh\b/i.test(normalizedUserAgent) && Number(maxTouchPoints) > 1;
}

export function estimateSpeechSynthesisCompletionTimeoutMs(text: string, rate: number): number {
  const normalizedText = String(text || '').trim();
  const normalizedRate = Number.isFinite(rate) && rate > 0 ? Number(rate) : 1;
  const wordCount = normalizedText ? normalizedText.split(/\s+/).length : 1;
  const charCount = normalizedText.length || 1;
  const estimatedFromWords = (wordCount * 420) / normalizedRate;
  const estimatedFromChars = (charCount * 75) / normalizedRate;
  return Math.max(2500, Math.min(20000, Math.round(Math.max(estimatedFromWords, estimatedFromChars) + 1800)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareAppleMobileSpeechSynthesis(): Promise<void> {
  if (!window.speechSynthesis) {
    return;
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
    await sleep(80);
  }
}

async function finalizeAppleMobileSpeechSynthesis(reason: string): Promise<void> {
  if (!window.speechSynthesis) {
    return;
  }

  const wasSpeaking = window.speechSynthesis.speaking;
  const wasPending = window.speechSynthesis.pending;
  if (wasSpeaking || wasPending) {
    window.speechSynthesis.cancel();
  }
  await sleep(80);
  clientConsole(2, '[TTS] Apple mobile speech synthesis finalized', {
    reason,
    wasSpeaking,
    wasPending,
    nowSpeaking: window.speechSynthesis.speaking,
    nowPending: window.speechSynthesis.pending,
  });
}

async function waitForSpeechSynthesisVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!window.speechSynthesis) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    return voices;
  }
  return await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };
    const onVoicesChanged = () => finish();
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged, { passive: true, once: true });
    setTimeout(finish, 300);
  });
}

function findMatchingBrowserVoice(voices: SpeechSynthesisVoice[], requestedVoice: string): SpeechSynthesisVoice | null {
  if (!requestedVoice || !voices.length) {
    return null;
  }
  const exact = voices.find((voice) => voice.name === requestedVoice || voice.voiceURI === requestedVoice);
  if (exact) {
    return exact;
  }
  return null;
}

function parseBooleanLike(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function resolveTtsLanguageCode(
  setspec: { textToSpeechLanguage?: string | string[] } | null | undefined,
  requestedVoice: string
): string {
  const configuredLanguage = Array.isArray(setspec?.textToSpeechLanguage)
    ? setspec?.textToSpeechLanguage[0]
    : setspec?.textToSpeechLanguage;
  const normalizedLanguage = String(configuredLanguage || '').trim();
  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  const voiceMatch = String(requestedVoice || '').trim().match(/^([A-Za-z]{2,3}-[A-Za-z]{2,3})-/);
  if (voiceMatch?.[1]) {
    return voiceMatch[1];
  }

  return 'en-US';
}

function voiceMatchesLanguageCode(requestedVoice: string, languageCode: string): boolean {
  const normalizedVoice = String(requestedVoice || '').trim().toLowerCase();
  const normalizedLanguage = String(languageCode || '').trim().toLowerCase();
  if (!normalizedVoice || !normalizedLanguage) {
    return false;
  }
  return normalizedVoice.startsWith(`${normalizedLanguage}-`);
}

function findBestBrowserVoice(
  voices: SpeechSynthesisVoice[],
  requestedVoice: string,
  requestedLanguage: string
): SpeechSynthesisVoice | null {
  const exact = findMatchingBrowserVoice(voices, requestedVoice);
  if (exact) {
    return exact;
  }

  const normalizedLanguage = String(requestedLanguage || '').trim().toLowerCase();
  if (!normalizedLanguage) {
    return null;
  }

  const exactLanguage = voices.find((voice) => String(voice.lang || '').toLowerCase() === normalizedLanguage);
  if (exactLanguage) {
    return exactLanguage;
  }

  const baseLanguage = normalizedLanguage.split('-')[0];
  return voices.find((voice) => {
    const voiceLang = String(voice.lang || '').toLowerCase();
    return voiceLang === baseLanguage || voiceLang.startsWith(`${baseLanguage}-`);
  }) || null;
}

async function restartSrAfterTtsHandoff(): Promise<void> {
  const handoffStart = Date.now();
  const activeAudio = audioManager.getCurrentAudio();
  const playbackEnded = !activeAudio || activeAudio.ended || activeAudio.paused;
  const ttsQueueActive = !!window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
  if (ttsQueueActive && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  audioManager.clearCurrentAudio();
  CardStore.setRecordingLocked(false);
  CardStore.setTtsRequested(false);
  if (isWebKitAudioEngine()) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  clientConsole(2, '[TTS] handoff timeline', {
    playbackEnded,
    ttsQueueActive,
    lockCleared: !CardStore.isRecordingLocked(),
    currentAudioCleared: !audioManager.getCurrentAudio(),
    handoffDelayMs: Date.now() - handoffStart,
  });
  startSrRecording();
}

/**
 * Check if TTS is enabled for questions.
 * Requires user pref AND TDF support.
 *
 * @returns {boolean} True if question TTS enabled
 */
function getEffectiveAudioPromptMode(): string {
  const userAudioPromptMode = (Meteor.user() as UserAudioProfile | null)?.audioSettings?.audioPromptMode;
  const tdfTtsEnabled = parseBooleanLike(Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.enableAudioPromptAndFeedback);

  const userWantsAudioPrompts = userAudioPromptMode && userAudioPromptMode !== 'silent';

  return tdfTtsEnabled && userWantsAudioPrompts ? userAudioPromptMode : 'silent';
}

/**
 * @param {AudioPromptSource} source
 * @returns {boolean}
 */
export function shouldPlayAudioPrompt(source: AudioPromptSource): boolean {
  const audioPromptMode = getEffectiveAudioPromptMode();
  if (!audioPromptMode || audioPromptMode === 'silent') {
    return false;
  }
  return audioPromptMode === 'all' || audioPromptMode === source;
}

function isTtsEnabledForQuestions() {
  return shouldPlayAudioPrompt('question');
}

/**
 * Check if TTS is enabled for feedback.
 * Requires user pref AND TDF support.
 *
 * @returns {boolean} True if feedback TTS enabled
 */
function isTtsEnabledForFeedback() {
  return shouldPlayAudioPrompt('feedback');
}

/**
 * Speak text using browser TTS (Web Speech API or Google TTS).
 * Returns promise that resolves when speech completes.
 *
 * @param {string} text - Text to speak
 * @param {TtsSpeakOptions} options - TTS options
 * @returns {Promise<void>}
 */
async function speakText(
  text: string,
  options: TtsSpeakOptions = {},
  getCancellation: () => TtsPlaybackCancelledError | null = () => null,
  playbackId = 0
): Promise<void> {
  const isQuestion = options.isQuestion === true;
  const voice = options.voice || (isQuestion ? getAudioPromptVoice() : getAudioPromptFeedbackVoice());
  const rate = options.rate ?? (isQuestion ? getAudioPromptQuestionSpeakingRate() : getAudioPromptFeedbackSpeakingRate());
  const volume = options.volume ?? (isQuestion ? getAudioPromptQuestionVolume() : getAudioPromptFeedbackVolume());

  return new Promise<void>((resolve, reject) => {
    try {
      const shouldSpeak = isQuestion ? isTtsEnabledForQuestions() : isTtsEnabledForFeedback();
      if (!shouldSpeak) {
        
        resolve();
        return;
      }

      const rawText = typeof text === 'string' ? text : String(text || '');
      const cleanText = rawText
        .replace(/(&nbsp;)+/g, 'blank')
        .replace(/(<([^>]+)>)/ig, '');

      if (!cleanText.trim()) {
        
        resolve();
        return;
      }

      

      const currentTdf = Session.get('currentTdfFile');
      const hasTtsKey = !!currentTdf?.tdfs?.tutor?.setspec?.textToSpeechAPIKey;
      const ttsLanguage = resolveTtsLanguageCode(currentTdf?.tdfs?.tutor?.setspec, String(voice || ''));

      const speakWithSpeechSynthesis = () => new Promise<void>((speechResolve, speechReject) => {
        if (!window.speechSynthesis) {
          speechReject(new Error('speechSynthesis unavailable'));
          return;
        }

        const requiresAppleMobileRecovery = isAppleMobileSpeechSynthesisEnvironment();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = ttsLanguage;
        utterance.rate = Number.isFinite(rate) ? Number(rate) : 1.0;
        utterance.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, Number(volume) / 6 + 0.5)) : 1.0;
        let settled = false;
        let playbackObserved = false;
        let queueDrainIntervalId: ReturnType<typeof setInterval> | null = null;
        let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let unregisterCancellation = () => {};

        const clearRecoveryTimers = () => {
          if (queueDrainIntervalId !== null) {
            clearInterval(queueDrainIntervalId);
            queueDrainIntervalId = null;
          }
          if (hardTimeoutId !== null) {
            clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
          }
        };

        const resolveSpeech = async (reason: string) => {
          if (settled) {
            return;
          }
          const cancellation = getCancellation();
          if (cancellation) {
            rejectSpeech(cancellation);
            return;
          }
          settled = true;
          clearRecoveryTimers();
          if (requiresAppleMobileRecovery) {
            await finalizeAppleMobileSpeechSynthesis(reason);
          }
          speechResolve();
        };

        const rejectSpeech = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          clearRecoveryTimers();
          unregisterCancellation();
          speechReject(error);
        };

        unregisterCancellation = registerTtsCancellationHandler(playbackId, rejectSpeech);

        utterance.addEventListener('end', () => {
          void resolveSpeech('utterance-end');
        }, { passive: true });
        utterance.addEventListener('start', () => {
          playbackObserved = true;
        }, { passive: true });
        utterance.addEventListener('error', (event) => {
          rejectSpeech(event);
        }, { passive: true });

        const startSpeech = async () => {
          const cancellation = getCancellation();
          if (cancellation) {
            rejectSpeech(cancellation);
            return;
          }

          if (requiresAppleMobileRecovery) {
            await prepareAppleMobileSpeechSynthesis();
          }

          const voices = await waitForSpeechSynthesisVoices();
          const browserVoice = findBestBrowserVoice(voices, String(voice || ''), ttsLanguage);
          if (browserVoice) {
            utterance.voice = browserVoice;
          }
          const postVoiceCancellation = getCancellation();
          if (postVoiceCancellation) {
            rejectSpeech(postVoiceCancellation);
            return;
          }

          clientConsole(2, '[TTS] Browser speech synthesis start', {
            language: ttsLanguage,
            requestedVoice: voice,
            selectedVoice: utterance.voice?.name || null,
            rate: utterance.rate,
            volume: utterance.volume,
            requiresAppleMobileRecovery,
          });
          warnIfAppleMobileAudioMayBeLocked('browser-speech-synthesis');
          window.speechSynthesis.speak(utterance);

          if (!requiresAppleMobileRecovery) {
            return;
          }

          const timeoutMs = estimateSpeechSynthesisCompletionTimeoutMs(cleanText, utterance.rate);
          queueDrainIntervalId = setInterval(() => {
            if (settled || !window.speechSynthesis) {
              return;
            }
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
              playbackObserved = true;
              return;
            }
            if (playbackObserved) {
              void resolveSpeech('queue-drained');
            }
          }, 100);
          hardTimeoutId = setTimeout(() => {
            if (settled) {
              return;
            }
            clientConsole(1, '[TTS] Apple mobile speech synthesis watchdog forced cleanup', {
              timeoutMs,
              speaking: window.speechSynthesis?.speaking ?? false,
              pending: window.speechSynthesis?.pending ?? false,
              textLength: cleanText.length,
            });
            void resolveSpeech('watchdog-timeout');
          }, timeoutMs);
        };

        void startSpeech().catch((error: unknown) => {
          rejectSpeech(error);
        });
      });

      const playAudioObject = (audioObj: HTMLAudioElement) => new Promise<void>((audioResolve, audioReject) => {
        let settled = false;
        let unregisterCancellation = () => {};
        const removeListeners = () => {
          audioObj.removeEventListener('ended', onEnded);
          audioObj.removeEventListener('error', onError);
          unregisterCancellation();
        };
        const onEnded = () => {
          if (settled) return;
          settled = true;
          removeListeners();
          audioResolve();
        };
        const onError = (event: unknown) => {
          if (settled) return;
          settled = true;
          removeListeners();
          audioReject(event);
        };
        const cancellation = getCancellation();
        if (cancellation) {
          audioReject(cancellation);
          return;
        }
        unregisterCancellation = registerTtsCancellationHandler(playbackId, onError);
        audioObj.addEventListener('ended', onEnded, { passive: true });
        audioObj.addEventListener('error', onError, { passive: true });

        const playPromise = audioObj.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((error) => {
            onError(error);
          });
        }
      });

      const speakWithGoogleTts = async () => {
        const speakingRate = Number.isFinite(rate) ? rate : 1.0;
        const volumeGain = Number.isFinite(volume) ? volume : 0.0;
        const selectedVoice = voiceMatchesLanguageCode(String(voice || ''), ttsLanguage)
          ? String(voice || '')
          : '';
        const tdfId = Session.get('currentTdfId');
        if (!tdfId) {
          logIdInvariantBreachOnce('tts.speakWithGoogleTts:missing-currentTdfId');
          throw new Error('TTS requires currentTdfId');
        }

        const res = await MeteorCompat.callAsync(
          'makeGoogleTTSApiCall',
          tdfId,
          cleanText,
          speakingRate,
          volumeGain,
          selectedVoice,
          ttsLanguage
        );

        if (!res || typeof res !== 'string') {
          throw new Error('TTS API returned empty audio');
        }

        if (!CardStore.isTtsRequested()) {
          
          return;
        }

        const unlockedAudioObj = getUnlockedAppleMobileAudioElement();
        const audioObj = unlockedAudioObj || new Audio();
        audioObj.src = `data:audio/mp3;base64,${res}`;
        audioObj.muted = false;
        audioObj.volume = 1;
        audioManager.pauseCurrentAudio();
        audioManager.setCurrentAudio(audioObj);
        clientConsole(2, '[TTS] path selected', {
          path: 'google-tts-playback',
          reusedUnlockedAudioElement: !!unlockedAudioObj,
        });
        warnIfAppleMobileAudioMayBeLocked('google-tts-playback');
        try {
          await playAudioObject(audioObj);
        } catch (error: unknown) {
          if (isTtsPlaybackCancelled(error)) {
            throw error;
          }
          clientConsole(1, '[TTS] google playback rejected; falling back to browser TTS', {
            error: error instanceof Error ? error.message : String(error),
          });
          audioManager.clearCurrentAudio();
          await speakWithSpeechSynthesis();
        } finally {
          audioManager.clearCurrentAudio();
        }
      };

      const run = async () => {
        if (hasTtsKey) {
          await speakWithGoogleTts();
        } else {
          clientConsole(2, '[TTS] path selected', { path: 'browser-speech-synthesis' });
          await speakWithSpeechSynthesis();
        }
      };

      run().then(resolve).catch((error: unknown) => {
        clientConsole(1, '[TTS] Speech error:', error);
        reject(error);
      });
    } catch (error: unknown) {
      clientConsole(1, '[TTS] Error in speakText:', error);
      reject(error);
    }
  });
}

/**
 * Play pre-recorded audio file using Plyr.
 * Returns promise that resolves when audio completes.
 *
 * @param {string} audioSrc - Audio file URL
 * @returns {Promise<void>}
 */
async function playAudioFile(
  audioSrc: string,
  getCancellation: () => TtsPlaybackCancelledError | null = () => null,
  playbackId = 0
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      

      let currentAudioSrc = (audioSrc || '').trim().replace(/\\\//g, '/');
      if (!currentAudioSrc) {
        resolve();
        return;
      }
      currentAudioSrc = resolveDynamicAssetPath(currentAudioSrc, { logPrefix: '[TTS]' });
      if (!currentAudioSrc) {
        reject(new Error('[TTS] Unresolved local audio source'));
        return;
      }

      const audio = new Audio(currentAudioSrc);
      clientConsole(2, '[TTS] path selected', { path: 'pre-recorded-audio', src: currentAudioSrc });
      let settled = false;
      let canPlayHandler: (() => void) | null = null;
      let unregisterCancellation = () => {};

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        unregisterCancellation();
        if (canPlayHandler) {
          audio.removeEventListener('canplay', canPlayHandler);
          canPlayHandler = null;
        }
        resolve();
      };

      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        unregisterCancellation();
        if (canPlayHandler) {
          audio.removeEventListener('canplay', canPlayHandler);
          canPlayHandler = null;
        }
        reject(error);
      };

      const cancellation = getCancellation();
      if (cancellation) {
        rejectOnce(cancellation);
        return;
      }
      unregisterCancellation = registerTtsCancellationHandler(playbackId, rejectOnce);

      audioManager.setCurrentAudio(audio);

      audio.onended = () => {
        
        audioManager.clearCurrentAudio();
        resolveOnce();
      };

      audio.onerror = (error: unknown) => {
        clientConsole(1, '[TTS] Audio file error:', error);
        audioManager.clearCurrentAudio();
        rejectOnce(error);
      };

      const playFromStart = () => {
        const playCancellation = getCancellation();
        if (playCancellation) {
          rejectOnce(playCancellation);
          return;
        }

        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (_err: unknown) {
          // ignore reset failures and still attempt playback
        }

        audio.play().then(() => {
          // Some browsers can start slightly ahead on first decode.
          if ((audio.currentTime || 0) > 0.15) {
            audio.pause();
            audio.currentTime = 0;
            audio.play().catch((err: unknown) => {
              clientConsole(1, '[TTS] audio replay from start failed:', err);
              audioManager.clearCurrentAudio();
              rejectOnce(err);
            });
          }
        }).catch((err: unknown) => {
          clientConsole(1, '[TTS] audio.play() failed:', err);
          audioManager.clearCurrentAudio();
          rejectOnce(err);
        });
      };

      // Wait until enough media is decoded to avoid clipping the first syllable.
      if ((audio.readyState || 0) < 3) {
        canPlayHandler = () => {
          if (!canPlayHandler) {
            return;
          }
          audio.removeEventListener('canplay', canPlayHandler);
          canPlayHandler = null;
          playFromStart();
        };
        audio.addEventListener('canplay', canPlayHandler, { once: true });
        try {
          audio.load();
        } catch (_err: unknown) {
          playFromStart();
        }
      } else {
        playFromStart();
      }
    } catch (error: unknown) {
      clientConsole(1, '[TTS] Error playing audio file:', error);
      reject(error);
    }
  });
}

/**
 * XState service for TTS playback.
 * Plays text-to-speech or audio file, resolves when complete.
 *
 * Usage in cardMachine.js:
 * ```
 * invoke: {
 *   src: 'ttsPlaybackService',
 *   data: {
 *     text: context.currentDisplay.text,
 *     audioSrc: context.currentDisplay.audioSrc,
 *     isQuestion: true
 *   },
 *   onDone: { target: 'displaying', actions: 'onTtsComplete' },
 *   onError: { actions: 'onTtsError' }  // Don't fail trial on TTS error
 * }
 * ```
 */
/**
 * @param {Record<string, unknown>} _context
 * @param {TtsPlaybackEvent} event
 * @returns {Promise<TtsServiceResult>}
 */
export async function ttsPlaybackService(_context: Record<string, unknown>, event: TtsPlaybackEvent): Promise<TtsServiceResult> {
  stopTtsPlayback('superseded');
  const playbackId = ++ttsPlaybackSequence;
  let cancellation: TtsPlaybackCancelledError | null = null;
  activeTtsPlayback = {
    id: playbackId,
    cancellation,
    cancelHandlers: new Set(),
    cancel: (reason: string) => {
      if (!cancellation) {
        cancellation = new TtsPlaybackCancelledError(reason);
        activeTtsPlayback?.cancelHandlers.forEach((handler) => handler(cancellation as TtsPlaybackCancelledError));
      }
      if (activeTtsPlayback?.id === playbackId) {
        activeTtsPlayback.cancellation = cancellation;
      }
    },
  };

  const getCancellation = () => cancellation;

  try {
    

    const text = event.text || '';
    const audioSrc = event.audioSrc || '';
    const questionText = event.questionText || '';
    const questionAudioSrc = event.questionAudioSrc || '';
    const isQuestion = event.isQuestion !== undefined ? event.isQuestion : false;
    const autoRestartSr = event.autoRestartSr === true;
    const delayAfterQuestionMs = Number.isFinite(event.delayAfterQuestionMs)
      ? Math.max(0, Number(event.delayAfterQuestionMs))
      : 1000;

    // Set recording lock to prevent SR from starting during TTS
    CardStore.setTtsRequested(true);
    CardStore.setRecordingLocked(true);
    
    const playSegment = async (segmentText: string, segmentAudioSrc: string, segmentIsQuestion: boolean): Promise<boolean> => {
      const segmentCancellation = getCancellation();
      if (segmentCancellation) {
        throw segmentCancellation;
      }

      if (segmentAudioSrc) {
        await playAudioFile(segmentAudioSrc, getCancellation, playbackId);
        return true;
      }

      if (!segmentText) {
        return false;
      }

      if (!shouldPlayAudioPrompt(segmentIsQuestion ? 'question' : 'feedback')) {
        return false;
      }

      await speakText(segmentText, { isQuestion: segmentIsQuestion }, getCancellation, playbackId);
      return true;
    };

    const hasStudyQuestionSegment = Boolean(questionAudioSrc || questionText);
    if (hasStudyQuestionSegment) {
      const questionPlayed = await playSegment(questionText, questionAudioSrc, true);
      const hasAnswerSegment = Boolean(audioSrc || text);

      if (questionPlayed && hasAnswerSegment && delayAfterQuestionMs > 0) {
        await sleep(delayAfterQuestionMs);
        const delayCancellation = getCancellation();
        if (delayCancellation) {
          throw delayCancellation;
        }
      }

      await playSegment(text, audioSrc, false);
    } else if (audioSrc) {
      await playAudioFile(audioSrc, getCancellation, playbackId);
    } else if (text) {
      await speakText(text, { isQuestion }, getCancellation, playbackId);
    } else {
      // No TTS/audio payload for this transition.
    }


    if (activeTtsPlayback?.id === playbackId) {
      activeTtsPlayback = null;
    }

    if (autoRestartSr) {
      try {
        await restartSrAfterTtsHandoff();
      } catch (error: unknown) {
        clientConsole(1, '[TTS] Failed to restart SR after playback', { error: String(error) });
      }
    } else {
      CardStore.setRecordingLocked(false);
      CardStore.setTtsRequested(false);
    }

    return { status: 'completed' };
  } catch (error: unknown) {
    if (isTtsPlaybackCancelled(error)) {
      if (activeTtsPlayback?.id === playbackId) {
        activeTtsPlayback = null;
      }
      CardStore.setRecordingLocked(false);
      CardStore.setTtsRequested(false);
      audioManager.clearCurrentAudio();
      return { status: 'skipped' };
    }

    clientConsole(1, '[TTS] Service error:', error);

    // Unlock recording even on error
    CardStore.setRecordingLocked(false);
    CardStore.setTtsRequested(false);

    if (event?.autoRestartSr === true) {
      try {
        await restartSrAfterTtsHandoff();
      } catch (restartError) {
        clientConsole(1, '[TTS] Failed to restart SR after TTS error', { error: String(restartError) });
      }
    }

    // Don't crash the trial - just log error and continue
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (activeTtsPlayback?.id === playbackId && getCancellation()) {
      activeTtsPlayback = null;
    }
  }
}






