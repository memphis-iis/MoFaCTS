/**
 * Speech Recognition (SR) Service
 *
 * Wraps existing SR infrastructure for XState machine.
 * Only invoked for text-entry trials when explicitly requested.
 *
 * Features:
 * - Voice activity detection (Hark.js)
 * - Google Speech API integration
 * - Phonetic matching (double-metaphone)
 * - Max retry logic (3 attempts default)
 * - Recording lock management
 *
 * Reference:
 * - client/lib/phoneticUtils.js (phonetic matching)
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { _ } from 'meteor/underscore';
import { CardStore } from '../../modules/cardStore';
import { DeliveryParamsStore } from '../../../../lib/state/deliveryParamsStore';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { getAudioInputSensitivity, setAudioRecorderInitialized } from '../../../../lib/state/audioState';
import { audioManager } from '../../../../lib/audioContextManager';
import { getSpeechRecognitionMediaConstraints } from '../../../../lib/audioStartup';
import { getAllCurrentStimAnswers } from '../../../../lib/currentTestingHelpers';
import { resolveSpeechRecognitionLanguage } from '../../../../lib/speechRecognitionConfig';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import {
  classifySrInitFailure,
  evaluateSrAvailability,
  resolveSpeechApiKeyAvailability,
} from '../../../../lib/audioAvailability';
import {
  buildPhoneticIndexForLanguage,
  findPhoneticConflictsWithCorrectAnswerForLanguage,
  findPhoneticMatchForLanguage,
  getPhoneticMatchingStrategy
} from '../../../../lib/phoneticMatchingByLanguage';
import { nextChar } from '../../../../lib/stringUtils';
import hark from '../../../../lib/hark';
import { Recorder } from '../../../../lib/audioRecorder';
import type {
  SpeechRecognitionInitResult,
  SpeechRecognitionResult,
  SpeechRecognitionServiceContext,
  SpeechRecognitionServiceEvent,
  SpeechRecognitionServiceReceive,
  SpeechRecognitionServiceSend,
} from '../../../../../common/types';

type MeteorUserLike = {
  speechAPIKey?: string;
  audioSettings?: {
    audioInputMode?: boolean;
  };
};

type LegacyNavigatorCompat = Navigator & {
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
  msGetUserMedia?: LegacyGetUserMedia;
  getUserMedia?: LegacyGetUserMedia;
};

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  successCallback: (stream: MediaStream) => void,
  errorCallback: (error: unknown) => void
) => void;

type RecorderLike = {
  ready: Promise<unknown>;
  record: () => void;
  stop: () => void;
  clear: () => void;
  setProcessCallback: (callback: (audioData: ArrayBuffer | string) => Promise<SpeechRecognitionResult>) => void;
  exportToProcessCallback: () => void;
};

type HarkLike = {
  on: (eventName: 'speaking' | 'stopped_speaking', callback: () => void) => void;
  stop: () => void;
};

type GoogleSpeechAlternative = {
  transcript?: string;
  confidence?: number;
};

type GoogleSpeechResultEntry = {
  alternatives?: GoogleSpeechAlternative[];
};

type GoogleSpeechApiResponse = {
  results?: GoogleSpeechResultEntry[];
  speechAdaptationInfo?: {
    adaptationTimeout?: boolean;
    timeoutMessage?: string;
  };
};

type SpeechApiRequest = {
  config: {
    encoding: string;
    sampleRateHertz: number;
    languageCode: string;
    maxAlternatives: number;
    profanityFilter: boolean;
    enableAutomaticPunctuation: boolean;
    model: string;
    useEnhanced: boolean;
    adaptation: {
      phraseSets: Array<{
        boost?: number;
        phrases: Array<{
          value: string;
        }>;
      }>;
    };
  };
  audio: {
    content: string;
  };
};

type AdaptationPhraseSetBucket = {
  phrases: Array<{
    value: string;
  }>;
  boost?: number;
};

type SpeechAdaptationSummary = {
  currentAnswer: string | null;
  totalPhraseSets: number;
  totalPhrases: number;
  targetPhraseSetIndexes: number[];
  targetPhraseSetBoosts: number[];
  targetPhraseSetIndexesCsv: string;
  targetPhraseSetBoostsCsv: string;
  phraseSetBoostsCsv: string;
  phraseSets: Array<{
    index: number;
    boost: number | null;
    phraseCount: number;
    containsCurrentAnswer: boolean;
    samplePhrases: string[];
  }>;
};

type CurrentTdfLike = {
  tdfs?: {
    tutor?: {
      setspec?: {
        speechRecognitionLanguage?: string | string[];
        speechIgnoreOutOfGrammarResponses?: unknown;
        speechAPIKey?: string;
      };
    };
  };
};

type CurrentSetSpecLike = NonNullable<NonNullable<NonNullable<CurrentTdfLike['tdfs']>['tutor']>['setspec']>;

type RuntimeWindow = Window & {
  firefox_audio_hack?: MediaStreamAudioSourceNode | null;
};

type DeliveryParamsLike = {
  autostopTranscriptionAttemptLimit?: unknown;
};

function getMeteorUser(): MeteorUserLike | null {
  return (Meteor.user() as MeteorUserLike | null | undefined) ?? null;
}

const MeteorCompat = Meteor as typeof Meteor & {
  callAsync: (...args: unknown[]) => Promise<unknown>;
};

let recorder: RecorderLike | null = null;
let srHardFailureReason: string | null = null;
let audioContext: AudioContext | null = null;
let userMediaStream: MediaStream | null = null;
let streamSource: MediaStreamAudioSourceNode | null = null;
let speechEvents: HarkLike | null = null;
let pollMediaDevicesInterval: number | null = null;
let recordingStartTime: number | null = null;
let cleanupInProgress = false;
let speechTranscriptionAttempts = 0;
/** @type {SpeechRecognitionServiceSend | null} */
let srSend: SpeechRecognitionServiceSend | null = null;
let currentSpeechHintExclusionList = '';
let lastInitUsedPreInitializedStream = false;
const MAX_INIT_AUTO_RETRIES = 3;

function estimateBase64DecodedBytes(base64: string): number {
  const sanitized = String(base64 || '').replace(/\s+/g, '');
  const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((sanitized.length * 3) / 4) - padding);
}

function estimateLinear16DurationMs(byteLength: number, sampleRate: number): number | null {
  if (!Number.isFinite(byteLength) || byteLength <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }
  return Math.round((byteLength / 2 / sampleRate) * 1000);
}

export function shouldRetryShortTargetWithCommandModel(
  response: GoogleSpeechApiResponse | null | undefined,
  currentAnswer: string | null,
  language: string
): boolean {
  const normalizedCurrentAnswer = normalizeSpeechToken(currentAnswer || '');
  const resultCount = Array.isArray(response?.results) ? response.results.length : 0;

  return resultCount === 0 &&
    /^es(?:-|$)/i.test(language.trim()) &&
    normalizedCurrentAnswer.length > 0 &&
    normalizedCurrentAnswer.length <= 3;
}

function buildCommandAndSearchRetryRequest(request: SpeechApiRequest): SpeechApiRequest {
  return {
    ...request,
    config: {
      ...request.config,
      model: 'command_and_search',
      useEnhanced: false,
    },
  };
}

function buildSpeechAdaptation(
  phraseHints: string[],
  currentAnswer: string | null
): SpeechApiRequest['config']['adaptation'] {
  const dedupedHints = Array.from(new Set(
    phraseHints
      .map((phrase) => String(phrase || '').trim())
      .filter(Boolean)
  ));

  if (dedupedHints.length === 0) {
    throw new Error('Cannot build speech adaptation without phrase hints');
  }

  const normalizedCurrentAnswer = String(currentAnswer || '').trim().toLowerCase();
  if (!normalizedCurrentAnswer) {
    throw new Error('Cannot build target-biased speech adaptation without a current answer');
  }

  const hasCanonicalTarget = dedupedHints.some((phrase) => phrase.toLowerCase() === normalizedCurrentAnswer);
  if (!hasCanonicalTarget) {
    throw new Error(`Current answer "${currentAnswer}" is missing from phrase hints`);
  }

  const boostedTargetHintSet = new Set(buildSpeechRecognitionPhraseHints([normalizedCurrentAnswer]));
  const targetPhrases = dedupedHints.filter((phrase) => boostedTargetHintSet.has(phrase.toLowerCase()));
  const backgroundPhrases = dedupedHints.filter((phrase) => !boostedTargetHintSet.has(phrase.toLowerCase()));
  const phraseSets: AdaptationPhraseSetBucket[] = [{
    phrases: targetPhrases.map((phrase) => ({ value: phrase })),
    boost: 20,
  }];

  if (backgroundPhrases.length > 0) {
    phraseSets.push({
      phrases: backgroundPhrases.map((phrase) => ({ value: phrase })),
    });
  }

  return { phraseSets };
}

function summarizeSpeechAdaptation(
  adaptation: SpeechApiRequest['config']['adaptation'],
  currentAnswer: string | null
): SpeechAdaptationSummary {
  const normalizedCurrentAnswer = String(currentAnswer || '').trim().toLowerCase();
  const phraseSets = adaptation.phraseSets.map((phraseSet, index) => {
    const containsCurrentAnswer = normalizedCurrentAnswer.length > 0 &&
      phraseSet.phrases.some((phrase) => phrase.value.toLowerCase() === normalizedCurrentAnswer);

    return {
      index,
      boost: typeof phraseSet.boost === 'number' ? phraseSet.boost : null,
      phraseCount: phraseSet.phrases.length,
      containsCurrentAnswer,
      samplePhrases: phraseSet.phrases
        .slice(0, containsCurrentAnswer ? 5 : 3)
        .map((phrase) => phrase.value),
    };
  });
  const targetPhraseSets = phraseSets.filter((phraseSet) => phraseSet.containsCurrentAnswer);
  const targetPhraseSetIndexes = targetPhraseSets.map((phraseSet) => phraseSet.index);
  const targetPhraseSetBoosts = targetPhraseSets.map((phraseSet) => phraseSet.boost ?? 0);

  return {
    currentAnswer,
    totalPhraseSets: adaptation.phraseSets.length,
    totalPhrases: adaptation.phraseSets.reduce((total, phraseSet) => total + phraseSet.phrases.length, 0),
    targetPhraseSetIndexes,
    targetPhraseSetBoosts,
    targetPhraseSetIndexesCsv: targetPhraseSetIndexes.join(','),
    targetPhraseSetBoostsCsv: targetPhraseSetBoosts.join(','),
    phraseSetBoostsCsv: phraseSets.map((phraseSet) => String(phraseSet.boost ?? 0)).join(','),
    phraseSets,
  };
}

export function normalizeSpeechToken(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function buildSpeechRecognitionPhraseHints(targets: string[]): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const addHint = (value: unknown): void => {
    const hint = normalizeSpeechToken(value);
    if (!hint || seen.has(hint)) {
      return;
    }
    seen.add(hint);
    hints.push(hint);
  };

  for (const target of targets) {
    addHint(target);

    // Google SR can fail to emit a transcript for short standalone words ending
    // in unvoiced "th" ("growth" is often heard as "grow"). Add the common
    // dropped-fricative form as a hint, but keep scoring tied to the canonical
    // answer through the grammar/phonetic matcher.
    const normalizedTarget = normalizeSpeechToken(target);
    if (normalizedTarget.length >= 5 && normalizedTarget.endsWith('th')) {
      addHint(normalizedTarget.slice(0, -2));
    }
  }

  return hints;
}

function extractSpeechRecognitionTargets(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }

  const [firstBranch = ''] = raw.split(';');
  const [matchPart = ''] = firstBranch.split('~');

  return Array.from(new Set(
    matchPart
      .split('|')
      .map((token) => normalizeSpeechToken(token))
      .filter(Boolean)
  ));
}

function parseSpeechHintExclusionList(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((token) => normalizeSpeechToken(token))
    .filter(Boolean);
}

function requireSpeechRecognitionLanguage(setSpec: CurrentSetSpecLike | undefined): string {
  return resolveSpeechRecognitionLanguage(setSpec);
}

function requireIgnoreOutOfGrammarResponses(setSpec: CurrentSetSpecLike | undefined): boolean {
  const raw = setSpec?.speechIgnoreOutOfGrammarResponses;
  if (typeof raw === 'undefined' || raw === null) {
    throw new Error('Missing required setspec.speechIgnoreOutOfGrammarResponses for SR');
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`Invalid setspec.speechIgnoreOutOfGrammarResponses value "${String(raw)}" for SR`);
  }

  return normalized === 'true';
}

function buildTranscriptionFailureResult(
  error: unknown,
  options: { silence?: boolean; feedback?: string; transcript?: string } = {}
): SpeechRecognitionResult {
  CardStore.setWaitingForTranscription(false);
  if (srSend) {
    srSend({
      type: 'TRANSCRIPTION_ERROR',
      error,
      ...(typeof options.transcript === 'string' ? { transcript: options.transcript } : {}),
      ...(options.silence === true ? { silence: true } : {}),
      ...(typeof options.feedback === 'string' && options.feedback.trim()
        ? { feedback: options.feedback }
        : {}),
    });
  }

  return {
    transcript: '',
    phoneticMatch: null,
    isCorrect: false,
    maxAttemptsReached: false,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Check if SR is enabled.
 * Requires BOTH user pref AND TDF support.
 *
 * @returns {boolean} True if SR is enabled
 */
function isSrEnabled(): boolean {
  const availability = evaluateSrAvailability({
    user: getMeteorUser(),
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
  });
  return availability.status === 'available';
}

/**
 * @returns {Promise<void>}
 */
async function logMediaDeviceState() {
  if (!navigator?.mediaDevices?.enumerateDevices) {
    clientConsole(1, '[SR] mediaDevices.enumerateDevices unavailable');
    return;
  }

  try {
    await navigator.mediaDevices.enumerateDevices();
  } catch (error: unknown) {
    clientConsole(1, '[SR] enumerateDevices failed:', error);
  }

  if (navigator.permissions?.query) {
    try {
      await navigator.permissions.query({ name: 'microphone' });
    } catch (error: unknown) {
      clientConsole(1, '[SR] permissions.query(microphone) failed:', error);
    }
  }
}

/**
 * Initialize audio context and recorder.
 * Sets up microphone stream and Hark voice activity detection.
 *
 *
 * @returns {Promise<SpeechRecognitionInitResult | null>} {recorder, audioContext, speechEvents}
 */
export async function initializeAudioRecorder(): Promise<SpeechRecognitionInitResult | null> {
  const srAvailability = evaluateSrAvailability({
    user: getMeteorUser(),
    tdfFile: Session.get('currentTdfFile'),
    sessionSpeechApiKey: Session.get('speechAPIKey'),
  });
  if (srAvailability.status !== 'available') {
    setAudioRecorderInitialized(false);
    clientConsole(2, '[SR] initializeAudioRecorder skipped', srAvailability);
    return null;
  }

  try {
    
    await logMediaDeviceState();

    if (typeof navigator.mediaDevices === 'undefined') {
      clientConsole(1, '[SR] navigator.mediaDevices undefined; creating shim');
      (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices = {} as MediaDevices;
    }

    if (typeof navigator.mediaDevices.getUserMedia === 'undefined') {
      navigator.mediaDevices.getUserMedia = function(constraints: MediaStreamConstraints) {
        const legacyNavigator = navigator as LegacyNavigatorCompat;
        const legacyGetUserMedia = legacyNavigator.webkitGetUserMedia ||
          legacyNavigator.mozGetUserMedia ||
          legacyNavigator.msGetUserMedia ||
          legacyNavigator.getUserMedia;
        if (!legacyGetUserMedia) {
          return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
        }
        return new Promise<MediaStream>((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }

    const existingContext = audioManager.getRecorderContext();
    if (existingContext) {
      audioContext = existingContext;
    } else {
      audioContext = audioManager.createRecorderContext({ sampleRate: 16000 });
    }
    audioManager.setContext(audioContext);
    clientConsole(2, '[SR] AudioContext state before resume', { state: audioContext?.state });
    await ensureAudioContextRunning(audioContext);
    clientConsole(2, '[SR] AudioContext state after resume', { state: audioContext?.state });

    // Get microphone stream (reuse warmup stream if available)
    const preInitStream = audioManager.getPreInitializedStream();
    const constraints = getSpeechRecognitionMediaConstraints();
    const requestedAudioConstraints = (
      constraints.audio &&
      typeof constraints.audio === 'object' &&
      !Array.isArray(constraints.audio)
    ) ? constraints.audio as MediaTrackConstraints : {};
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() || {};
    clientConsole(2, '[SR] getUserMedia started', {
      hasPreInitStream: !!preInitStream,
      requestedAudioConstraints,
      supportedAudioConstraints: {
        echoCancellation: Boolean(supportedConstraints.echoCancellation),
        noiseSuppression: Boolean(supportedConstraints.noiseSuppression),
        autoGainControl: Boolean(supportedConstraints.autoGainControl),
      },
    });
    lastInitUsedPreInitializedStream = !!preInitStream;
    const stream = preInitStream || await navigator.mediaDevices.getUserMedia(constraints);
    clientConsole(2, '[SR] getUserMedia succeeded');
    if (preInitStream) {
      audioManager.setPreInitializedStream(null);
    }
    userMediaStream = stream;

    const tracks = stream.getTracks();
    const audioTrack = tracks[0] || null;
    const appliedTrackSettings = audioTrack?.getSettings?.() || null;
    clientConsole(2, '[SR] Applied track settings', {
      deviceId: appliedTrackSettings?.deviceId,
      sampleRate: appliedTrackSettings?.sampleRate,
      channelCount: appliedTrackSettings?.channelCount,
      echoCancellation: appliedTrackSettings?.echoCancellation,
      noiseSuppression: appliedTrackSettings?.noiseSuppression,
      autoGainControl: appliedTrackSettings?.autoGainControl,
    });
    clientConsole(
      2,
      `[SR] Applied track settings summary sampleRate=${String(appliedTrackSettings?.sampleRate ?? 'n/a')} ` +
      `channelCount=${String(appliedTrackSettings?.channelCount ?? 'n/a')} ` +
      `echoCancellation=${String(appliedTrackSettings?.echoCancellation ?? 'n/a')} ` +
      `noiseSuppression=${String(appliedTrackSettings?.noiseSuppression ?? 'n/a')} ` +
      `autoGainControl=${String(appliedTrackSettings?.autoGainControl ?? 'n/a')}`
    );
    

    // Create media stream source
    streamSource = audioContext.createMediaStreamSource(stream);

    // Firefox hack for audio context
    (window as RuntimeWindow).firefox_audio_hack = streamSource;

    // Capture sample rate for Google Speech API
    CardStore.setSampleRate(streamSource.context.sampleRate);

    // Initialize recorder
    const audioRecorderConfig = {
      errorCallback: function(x: unknown) {
        clientConsole(1, '[SR] Recorder error:', x);
      }
    };

    recorder = new Recorder(streamSource, audioRecorderConfig) as RecorderLike;

    await recorder.ready;

    // Set process callback (called when voice stops)
    recorder.setProcessCallback(processAudioData);

    // Initialize Hark for voice activity detection
    const sensitivity = getAudioInputSensitivity();
    if (!Number.isFinite(Number(sensitivity))) {
      throw new Error('Missing authoritative audio input sensitivity for SR');
    }
    const harkOptions = {
      threshold: -1 * Number(sensitivity),  // Convert to negative dB value (e.g., -40 dB)
      interval: 50,  // Check every 50ms for responsive detection
      history: 5,  // Needs 5 consecutive silent samples to stop (250ms)
      smoothing: 0.1,  // Smoothing time constant to reduce noise spikes
      audioContext: audioContext  // Share same context with recorder
    };

    
    speechEvents = hark(stream, harkOptions);

    // CRITICAL: Set recording flag BEFORE setting up voice handlers to avoid race condition
    // where voice is detected before recording is flagged as active
    CardStore.setRecording(true);
    recorder.record();
    

    // Set up voice activity event handlers
    setupVoiceEventHandlers();

    setAudioRecorderInitialized(true);
    srHardFailureReason = null;

    return { recorder, audioContext, speechEvents };
  } catch (error: unknown) {
    const failureClass = classifySrInitFailure({
      error,
      secureContext: typeof window !== 'undefined' ? window.isSecureContext : true,
      hasAnySpeechApiKey: resolveSpeechApiKeyAvailability({
        user: getMeteorUser(),
        tdfFile: Session.get('currentTdfFile'),
        sessionSpeechApiKey: Session.get('speechAPIKey'),
      }),
      browserSupportsMediaDevices: supportsMediaDevicesApi(),
    });
    clientConsole(1, '[SR] initializeAudioRecorder failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: getErrorMessage(error),
      retryable: failureClass.retryable,
      detail: failureClass.detail,
      reason: failureClass.reason,
      contextState: audioContext?.state,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    });
    setAudioRecorderInitialized(false);
    if (!failureClass.retryable) {
      srHardFailureReason = failureClass.reason;
    }
    throw error;
  }
}

async function initializeAudioRecorderWithRetry(
  trigger: 'auto' | 'user',
  maxAttempts = MAX_INIT_AUTO_RETRIES
): Promise<SpeechRecognitionInitResult | null> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await initializeAudioRecorder();
    } catch (error: unknown) {
      lastError = error;
      const failureClass = classifySrInitFailure({
        error,
        secureContext: typeof window !== 'undefined' ? window.isSecureContext : true,
        hasAnySpeechApiKey: resolveSpeechApiKeyAvailability({
          user: getMeteorUser(),
          tdfFile: Session.get('currentTdfFile'),
          sessionSpeechApiKey: Session.get('speechAPIKey'),
        }),
        browserSupportsMediaDevices: supportsMediaDevicesApi(),
      });
      clientConsole(1, '[SR] init retry decision', {
        trigger,
        attempt,
        maxAttempts,
        retryable: failureClass.retryable,
        detail: failureClass.detail,
        reason: failureClass.reason,
      });
      if (!failureClass.retryable || attempt >= maxAttempts) {
        break;
      }
      await sleep(150);
    }
  }

  throw lastError || new Error('SR initialization failed');
}

/**
 * Set up Hark voice activity event handlers.
 * Listens for 'speaking' and 'stopped_speaking' events.
 *
 */
/**
 * @returns {void}
 */
function setupVoiceEventHandlers(): void {
  if (!speechEvents) return;

  speechEvents.on('speaking', function() {
    recordingStartTime = Date.now();

    if (!CardStore.isRecording()) {
      
      return;
    }

    
    if (srSend) {
      srSend({ type: 'VOICE_START' });
    }

    // Reset timeout to give more time for speech
    // Note: In XState, this would be handled by pausing the main timeout
  });

  speechEvents.on('stopped_speaking', function() {
    if (!CardStore.isRecording() || CardStore.getPausedLocks() > 0) {
      
      return;
    }

    // Only process if voice actually started
    if (!recordingStartTime) {
      
      return;
    }

    // Prevent stopping too quickly
    const timeSinceStart = Date.now() - recordingStartTime;
    if (timeSinceStart < 200) {
      
      return;
    }

    
    if (srSend) {
      srSend({ type: 'VOICE_STOP' });
    }

    // Stop recording and process audio
    if (!recorder) {
      recordingStartTime = null;
      return;
    }
    recorder.stop();
    CardStore.setRecording(false);

    // Set flag BEFORE exporting to prevent autorun from restarting
    CardStore.setWaitingForTranscription(true);
    

    recorder.exportToProcessCallback();
    recordingStartTime = null;
  });
}

/**
 * Start recording audio.
 *
 */
export function startRecording(): void {
  // Skip if already recording
  if (CardStore.isRecording()) {
    
    return;
  }

  if (CardStore.isButtonTrial()) {
    
    return;
  }

  if (recorder && !CardStore.isRecordingLocked() && isSrEnabled()) {
    CardStore.setRecording(true);
    recorder.record();
    
  } else {
    if (!CardStore.isRecordingLocked() && isSrEnabled()) {
      void initializeAudioRecorderWithRetry('auto').then((result) => {
        if (!result || !recorder || CardStore.isRecordingLocked()) {
          return;
        }
        CardStore.setRecording(true);
        recorder.record();
      }).catch((error: unknown) => {
        clientConsole(1, '[SR] startRecording initialization failed', {
          error: getErrorMessage(error),
        });
        if (srSend) {
          srSend({ type: 'TRANSCRIPTION_ERROR', error: getErrorMessage(error) });
        }
      });
    }
  }
}

/**
 * Stop recording audio.
 *
 */
export function stopRecording(): void {
  
  if (recorder && CardStore.isRecording()) {
    recorder.stop();
    CardStore.setRecording(false);
    recorder.clear();
    
  }
}

/**
 * Process audio data and get transcription from Google Speech API.
 * Includes phonetic matching for fuzzy answer validation.
 *
 *
 * @param {ArrayBuffer | string} audioData - Audio data from recorder
 * @returns {Promise<SpeechRecognitionResult>} {transcript, phoneticMatch, isCorrect}
 */
async function processAudioData(audioData: ArrayBuffer | string): Promise<SpeechRecognitionResult> {
  
  // Set flag to prevent timeout during transcription
  CardStore.setWaitingForTranscription(true);

  if (!recorder) {
    CardStore.setWaitingForTranscription(false);
    return { transcript: '', phoneticMatch: null, isCorrect: false, maxAttemptsReached: false };
  }
  recorder.clear();

  const isButtonTrial = CardStore.isButtonTrial();
  

  // Increment attempt counter
  speechTranscriptionAttempts += 1;
  const maxAttempts = Number((DeliveryParamsStore.get() as DeliveryParamsLike).autostopTranscriptionAttemptLimit || 3);
  

  // Check if exceeded max attempts
  if (speechTranscriptionAttempts > maxAttempts) {
    CardStore.setWaitingForTranscription(false);
    if (srSend) {
      srSend({ type: 'TRANSCRIPTION_ERROR', error: 'max-attempts' });
    }
    return { transcript: '', phoneticMatch: null, isCorrect: false, maxAttemptsReached: true };
  }

  // Get configuration
  const sampleRate = CardStore.getSampleRate();
  
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    clientConsole(1, '[SR] Invalid sample rate; speech API may reject audio');
  }
  const setSpec = (Session.get('currentTdfFile') as CurrentTdfLike | null | undefined)?.tdfs?.tutor?.setspec;
  let speechRecognitionLanguage: string;
  let ignoreOutOfGrammarResponses: boolean;
  try {
    speechRecognitionLanguage = requireSpeechRecognitionLanguage(setSpec);
    ignoreOutOfGrammarResponses = requireIgnoreOutOfGrammarResponses(setSpec);
  } catch (error: unknown) {
    clientConsole(1, '[SR] Refusing to transcribe with missing SR configuration', {
      error: getErrorMessage(error),
      setSpec,
    });
    return buildTranscriptionFailureResult(getErrorMessage(error));
  }
  const phoneticMatchingStrategy = getPhoneticMatchingStrategy(speechRecognitionLanguage);

  // Build phrase hints and answer grammar
  let phraseHints: string[] = [];
  let answerGrammar: string[] = [];
  let requestCorrectAnswer: string | null = null;
  let phoneticIndexForCurrentTrial: ReturnType<typeof buildPhoneticIndexForLanguage> | null = null;
  let configuredSpeechTargets: string[] = [];
  let configuredExclusions: string[] = [];

  if (isButtonTrial) {
    // Button trial: a-z
    let curChar = 'a';
    phraseHints.push(curChar);
    for (let i = 1; i < 26; i++) {
      curChar = nextChar(curChar);
      phraseHints.push(curChar);
    }
    answerGrammar = phraseHints;
  } else {
    const experimentState = ExperimentStateStore.get();
    const rawCorrectAnswer = Session.get('currentAnswer') ||
      experimentState?.currentAnswer ||
      experimentState?.originalAnswer;
    configuredSpeechTargets = extractSpeechRecognitionTargets(rawCorrectAnswer);
    requestCorrectAnswer = configuredSpeechTargets[0] || null;
    configuredExclusions = parseSpeechHintExclusionList(currentSpeechHintExclusionList);

    if (!requestCorrectAnswer) {
      clientConsole(1, '[SR] Missing current speech target for SR', {
        rawCorrectAnswer,
        experimentState,
      });
      return buildTranscriptionFailureResult('sr-missing-current-answer');
    }

    const excludedCurrentTargets = configuredSpeechTargets.filter((target) => configuredExclusions.includes(target));
    if (excludedCurrentTargets.length > 0) {
      clientConsole(1, '[SR] Refusing to transcribe because the current answer is excluded by speechHintExclusionList', {
        currentSpeechTargets: configuredSpeechTargets,
        configuredExclusions,
      });
      return buildTranscriptionFailureResult('sr-current-answer-excluded');
    }

    const rawGrammarAnswers = getAllCurrentStimAnswers(false) as Iterable<unknown> | unknown[] | null | undefined;
    const normalizedGrammarAnswers = (Array.isArray(rawGrammarAnswers) ? rawGrammarAnswers : Array.from(rawGrammarAnswers || []))
      .map((answer) => normalizeSpeechToken(answer))
      .filter(Boolean);

    // Keep recognition biased toward the current target, but allow other valid
    // lesson answers to be scored as real incorrect responses instead of
    // falling into the retry/out-of-grammar path.
    answerGrammar = Array.from(new Set([
      ...normalizedGrammarAnswers,
      ...configuredSpeechTargets,
    ]));

    if (requestCorrectAnswer && answerGrammar.length > 0) {
      const phoneticIndexForConflicts = buildPhoneticIndexForLanguage(answerGrammar, speechRecognitionLanguage);
      const normalizedCurrentAnswer = normalizeSpeechToken(requestCorrectAnswer);
      const conflicts = findPhoneticConflictsWithCorrectAnswerForLanguage(
        requestCorrectAnswer,
        answerGrammar,
        phoneticIndexForConflicts,
        speechRecognitionLanguage
      )
        .map((word) => normalizeSpeechToken(word))
        .filter((word) => word.length > 0 && word !== normalizedCurrentAnswer);

      if (conflicts.length > 0) {
        const conflictSet = new Set(conflicts);
        answerGrammar = answerGrammar.filter((word) => !conflictSet.has(normalizeSpeechToken(word)));
      }
    }

    phraseHints = buildSpeechRecognitionPhraseHints(configuredSpeechTargets);
    phoneticIndexForCurrentTrial = buildPhoneticIndexForLanguage(answerGrammar, speechRecognitionLanguage);

    if (!answerGrammar.includes('skip')) answerGrammar.push('skip');
    if (!answerGrammar.includes('enter')) answerGrammar.push('enter');
  }

  // Generate request JSON
  const request = generateRequestJSON(
    audioData,
    sampleRate,
    speechRecognitionLanguage,
    phraseHints,
    requestCorrectAnswer
  );
  const base64Audio = String(request?.audio?.content || '');
  const audioBytes = estimateBase64DecodedBytes(base64Audio);
  const estimatedDurationMs = estimateLinear16DurationMs(audioBytes, sampleRate);
  const apiCallStartedAt = performance.now();
  const speechAdaptationSummary = summarizeSpeechAdaptation(
    request.config.adaptation,
    requestCorrectAnswer
  );
  clientConsole(1, '[SR DEBUG] Built speech adaptation', speechAdaptationSummary);
  clientConsole(1, '[SR DEBUG] Sending audio to Google SR', {
    attempt: speechTranscriptionAttempts,
    sampleRate,
    audioBytes,
    estimatedDurationMs,
    phraseHintsCount: phraseHints.length,
    answerGrammarCount: answerGrammar.length,
    correctAnswer: requestCorrectAnswer,
    configuredSpeechTargets,
    configuredExclusions,
    language: speechRecognitionLanguage,
    phoneticStrategy: phoneticMatchingStrategy,
    reusedPreInitializedStream: lastInitUsedPreInitializedStream,
    speechAdaptationSummary,
  });
  clientConsole(
    1,
    `[SR DEBUG] Audio request summary attempt=${speechTranscriptionAttempts} sampleRate=${sampleRate} ` +
    `audioBytes=${audioBytes} estimatedDurationMs=${String(estimatedDurationMs ?? 'n/a')} ` +
    `phraseHints=${phraseHints.length} answerGrammar=${answerGrammar.length} ` +
    `language=${speechRecognitionLanguage} correctAnswer=${String(requestCorrectAnswer || '')} ` +
    `reusedPreInit=${String(lastInitUsedPreInitializedStream)} ` +
    `targetBoosts=${speechAdaptationSummary.targetPhraseSetBoostsCsv || 'none'}`
  );

  // Call Google Speech API
  try {
    const tdfId = Session.get('currentTdfId');
    const speechAPIKey = Session.get('speechAPIKey') || '';
    let apiResult = await MeteorCompat.callAsync('makeGoogleSpeechAPICall', tdfId, speechAPIKey, request, answerGrammar);
    let apiElapsedMs = Math.round(performance.now() - apiCallStartedAt);
    
    // API returns [answerGrammar, response] array - extract the response object
    let [, response] = Array.isArray(apiResult) ? apiResult : [answerGrammar, apiResult];
    let typedResponse = response as GoogleSpeechApiResponse | null | undefined;
    if (shouldRetryShortTargetWithCommandModel(typedResponse, requestCorrectAnswer, speechRecognitionLanguage)) {
      const retryStartedAt = performance.now();
      const retryRequest = buildCommandAndSearchRetryRequest(request);
      clientConsole(1, '[SR DEBUG] Retrying short Spanish target with command_and_search model', {
        attempt: speechTranscriptionAttempts,
        correctAnswer: requestCorrectAnswer,
        originalModel: request.config.model,
        retryModel: retryRequest.config.model,
        originalApiElapsedMs: apiElapsedMs,
      });
      apiResult = await MeteorCompat.callAsync('makeGoogleSpeechAPICall', tdfId, speechAPIKey, retryRequest, answerGrammar);
      apiElapsedMs += Math.round(performance.now() - retryStartedAt);
      [, response] = Array.isArray(apiResult) ? apiResult : [answerGrammar, apiResult];
      typedResponse = response as GoogleSpeechApiResponse | null | undefined;
    }
    const resultCount = Array.isArray(typedResponse?.results) ? typedResponse.results.length : 0;
    const adaptationTimeout = Boolean(typedResponse?.speechAdaptationInfo?.adaptationTimeout);
    const adaptationTimeoutMessage = typedResponse?.speechAdaptationInfo?.timeoutMessage || '';
    const alternativesPerResult = resultCount > 0
      ? typedResponse!.results!.map((res) => Array.isArray(res?.alternatives) ? res.alternatives.length : 0)
      : [];
    const topAlternatives = resultCount > 0
      ? typedResponse!.results!
        .flatMap((res) => Array.isArray(res?.alternatives) ? res.alternatives : [])
        .map((alt) => String(alt?.transcript || '').trim())
        .filter(Boolean)
        .slice(0, 5)
      : [];
    clientConsole(1, '[SR DEBUG] Google SR response received', {
      attempt: speechTranscriptionAttempts,
      apiElapsedMs,
      resultCount,
      adaptationTimeout,
      adaptationTimeoutMessage,
      alternativesPerResult,
      topAlternatives,
    });
    clientConsole(
      1,
      `[SR DEBUG] Response summary attempt=${speechTranscriptionAttempts} apiElapsedMs=${apiElapsedMs} ` +
      `resultCount=${resultCount} adaptationTimeout=${String(adaptationTimeout)} ` +
      `topAlternatives=${topAlternatives.join(' | ') || 'none'}`
    );
    
    

    // Clear waiting flag
    CardStore.setWaitingForTranscription(false);

    // Parse result
    if (typedResponse && typedResponse.results && typedResponse.results.length > 0) {
      // Collect ALL alternatives from ALL results (Google spreads them across multiple)
      const alternatives: Array<GoogleSpeechAlternative & { resultIndex: number; alternativeIndex: number }> = [];
      typedResponse.results.forEach((res, resultIndex) => {
        if (!res?.alternatives?.length) {
          return;
        }
        res.alternatives.forEach((alt, alternativeIndex) => {
          if (alt?.transcript) {
            alternatives.push({
              ...alt,
              resultIndex,
              alternativeIndex,
            });
          }
        });
      });
      const rankedAlternatives = alternatives.map((alt) => ({
        resultIndex: alt.resultIndex,
        alternativeIndex: alt.alternativeIndex,
        transcript: String(alt.transcript || '').trim(),
        confidence: typeof alt.confidence === 'number' ? alt.confidence : null,
      }));

      if (alternatives.length === 0) {
        clientConsole(1, '[SR DEBUG] Google SR returned no transcript alternatives', {
          attempt: speechTranscriptionAttempts,
          apiElapsedMs,
          resultCount,
          alternativesPerResult,
          audioBytes,
          estimatedDurationMs,
          rankedAlternatives,
        });

        return buildTranscriptionFailureResult('no-results', { silence: true });
      }

      const firstTranscript = String(alternatives[0]?.transcript || '').trim();
      if (!firstTranscript) {
        return buildTranscriptionFailureResult('no-results', { silence: true });
      }

      // Preserve original case from the speech recogniser for display/feedback.
      // Lowercase is used only for internal grammar-matching comparisons.
      let transcript = firstTranscript;
      let foundGrammarMatch = false;
      let phoneticMatch = null;
      let acceptancePath: 'exact-grammar' | 'phonetic' | 'command' | 'raw' = 'raw';

      // Build a lowercase lookup map so grammar matching is case-insensitive
      // while still returning the original-case grammar entry for display.
      const grammarByLower = new Map<string, string>();
      for (const g of answerGrammar) {
        grammarByLower.set(normalizeSpeechToken(g), g);
      }
      const normalizedCurrentAnswer = normalizeSpeechToken(requestCorrectAnswer || '');
      const normalizedAlternatives = alternatives
        .map((alt) => normalizeSpeechToken(alt?.transcript || ''))
        .filter(Boolean);
      const exactGrammarAlternatives = Array.from(new Set(
        normalizedAlternatives
          .map((altTranscript) => {
            if (altTranscript === 'skip' || altTranscript === 'enter') {
              return altTranscript;
            }
            return grammarByLower.get(altTranscript);
          })
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      ));
      const currentAnswerPresentInAlternatives = normalizedCurrentAnswer.length > 0 &&
        normalizedAlternatives.includes(normalizedCurrentAnswer);
      const currentAnswerPresentAsExactGrammarAlternative = normalizedCurrentAnswer.length > 0 &&
        exactGrammarAlternatives.some((entry) => entry.toLowerCase() === normalizedCurrentAnswer);

      const cachedIgnore = CardStore.getIgnoreOutOfGrammarResponses();
      if (cachedIgnore !== ignoreOutOfGrammarResponses) {
        clientConsole(1, '[SR] Updating ignoreOutOfGrammarResponses from TDF:', {
          fromCache: cachedIgnore,
          fromTdf: ignoreOutOfGrammarResponses,
        });
      }
      CardStore.setIgnoreOutOfGrammarResponses(ignoreOutOfGrammarResponses);

      

      // First pass: Look for exact match in any alternative (case-insensitive)
      for (const alt of alternatives) {
        const altRaw = String(alt.transcript || '').trim();
        const altLower = normalizeSpeechToken(altRaw);
        if (altLower === 'skip' || altLower === 'enter') {
          transcript = altLower;
          foundGrammarMatch = true;
          acceptancePath = 'command';
          break;
        }
        const grammarEntry = grammarByLower.get(altLower);
        if (grammarEntry !== undefined) {
          // Use the grammar entry's original case (authoritative casing from TDF)
          transcript = grammarEntry;
          foundGrammarMatch = true;
          acceptancePath = 'exact-grammar';
          break;
        }
      }

      // Second pass: Phonetic matching if no exact match found
      if (!foundGrammarMatch) {
        const uniqueAlternatives = Array.from(new Set(
          alternatives
            .map((alt) => normalizeSpeechToken(alt?.transcript || ''))
            .filter((altTranscript) => altTranscript.length >= 3)
        ));

        for (const altTranscript of uniqueAlternatives) {
          phoneticMatch = findPhoneticMatchForLanguage(
            altTranscript,
            configuredSpeechTargets,
            phoneticIndexForCurrentTrial,
            speechRecognitionLanguage
          );
          if (phoneticMatch) {
            transcript = phoneticMatch;
            foundGrammarMatch = true;
            acceptancePath = 'phonetic';
            break;
          }
        }
      }

      // Handle out-of-grammar responses
      if (ignoreOutOfGrammarResponses && !foundGrammarMatch) {
        clientConsole(1, '[SR DEBUG] Transcript rejected as out-of-grammar', {
          attempt: speechTranscriptionAttempts,
          transcript,
          topAlternatives,
          rankedAlternatives,
          phraseHintsCount: phraseHints.length,
          answerGrammarCount: answerGrammar.length,
          currentAnswer: requestCorrectAnswer,
          configuredSpeechTargets,
          configuredExclusions,
          reusedPreInitializedStream: lastInitUsedPreInitializedStream,
        });

        const feedback = String(Session.get('speechOutOfGrammarFeedback') || '').trim();
        return buildTranscriptionFailureResult('out-of-grammar', {
          transcript,
          ...(feedback ? { feedback } : {}),
        });
      }

      if (srSend) {
        srSend({
          type: 'TRANSCRIPTION_SUCCESS',
          transcript,
          phoneticMatch,
          isCorrect: foundGrammarMatch,
        });
      }

      clientConsole(1, '[SR DEBUG] Transcript accepted', {
        attempt: speechTranscriptionAttempts,
        transcript,
        phoneticMatch,
        foundGrammarMatch,
        acceptancePath,
        currentAnswer: requestCorrectAnswer,
        currentAnswerPresentInAlternatives,
        currentAnswerPresentAsExactGrammarAlternative,
        configuredSpeechTargets,
        configuredExclusions,
        reusedPreInitializedStream: lastInitUsedPreInitializedStream,
        exactGrammarAlternatives,
        rawAlternatives: normalizedAlternatives,
        rankedAlternatives,
        answerGrammar,
      });

      return {
        transcript,
        phoneticMatch,
        isCorrect: foundGrammarMatch,
        maxAttemptsReached: false
      };
    } else {
      clientConsole(1, '[SR DEBUG] Google SR returned empty results payload', {
        attempt: speechTranscriptionAttempts,
        apiElapsedMs,
        responseKeys: response && typeof response === 'object' ? Object.keys(response) : [],
        audioBytes,
        estimatedDurationMs,
      });

      return buildTranscriptionFailureResult('no-results', { silence: true });
    }
  } catch (error: unknown) {
    clientConsole(1, '[SR] API error:', error);
    CardStore.setWaitingForTranscription(false);
    return buildTranscriptionFailureResult(error);
  }
}

/**
 * Generate Google Speech API request JSON.
 *
 *
 * @param {ArrayBuffer | string} audioData - Audio data
 * @param {number} sampleRate - Sample rate in Hz
 * @param {string} language - Language code (e.g., 'en-US')
 * @param {Array<string>} phraseHints - Phrase hints for better recognition
 * @returns {Record<string, unknown>} Request JSON
 */
function generateRequestJSON(
  audioData: ArrayBuffer | string,
  sampleRate: number,
  language: string,
  phraseHints: string[],
  currentAnswer: string | null
): SpeechApiRequest {
  // audioRecorderWorker already returns base64 for LINEAR16.
  // Only convert if we were given raw binary.
  const base64Audio = typeof audioData === 'string'
    ? audioData
    : arrayBufferToBase64(audioData);
  const adaptation = buildSpeechAdaptation(phraseHints, currentAnswer);

  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: sampleRate,
      languageCode: language,
      maxAlternatives: 5,
      profanityFilter: false,
      enableAutomaticPunctuation: false,
      model: 'latest_short',
      useEnhanced: true,
      adaptation
    },
    audio: {
      content: base64Audio
    }
  };

  

  return request;
}

/**
 * Convert ArrayBuffer to base64 string.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string} Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return window.btoa(binary);
}

/**
 * Clean up audio resources.
 * Stops recording, closes audio context, releases microphone.
 */
export function cleanupAudioRecorder(): void {
  
  if (cleanupInProgress) {
    return;
  }
  cleanupInProgress = true;
  try {

    if (recorder) {
      if (CardStore.isRecording()) {
        recorder.stop();
        CardStore.setRecording(false);
      }
      recorder.clear();
      recorder = null;
    }

    if (speechEvents) {
      speechEvents.stop();
      speechEvents = null;
    }

    if (streamSource) {
      streamSource.disconnect();
      streamSource = null;
    }

    if (userMediaStream) {
      userMediaStream.getTracks().forEach((track) => track.stop());
      userMediaStream = null;
    }

    const recorderContext = audioManager.getRecorderContext();
    if (audioContext) {
      if (audioContext === recorderContext) {
        audioManager.closeRecorderContext();
      } else if (audioContext.state !== 'closed') {
        audioContext.close();
      }
      audioContext = null;
    }
    if (audioManager.getContext() === recorderContext) {
      audioManager.setContext(null);
    }

    if (pollMediaDevicesInterval) {
      Meteor.clearInterval(pollMediaDevicesInterval);
      pollMediaDevicesInterval = null;
    }

    audioManager.clearPreInitializedStream();

    streamSource = null;
    recordingStartTime = null;
    setAudioRecorderInitialized(false);
  } finally {
    cleanupInProgress = false;
  }
}

function supportsMediaDevicesApi(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
}

async function ensureAudioContextRunning(ctx: AudioContext | null): Promise<void> {
  if (!ctx || getAudioContextState(ctx) === 'running') {
    return;
  }
  if (getAudioContextState(ctx) === 'closed') {
    throw new Error('AudioContext is closed');
  }
  if (getAudioContextState(ctx) === 'suspended' && typeof ctx.resume === 'function') {
    await ctx.resume();
    const resumedState = getAudioContextState(ctx);
    if (resumedState !== 'running') {
      throw new Error(`AudioContext resume did not reach running state (state=${resumedState})`);
    }
  }
}

function getAudioContextState(ctx: AudioContext): AudioContextState {
  return ctx.state;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reset SR attempt counter.
 * Call when starting a new trial or unit.
 */
export function resetSrAttempts(): void {
  speechTranscriptionAttempts = 0;
  
}

/**
 * XState service for speech recognition.
 * Manages recording, transcription, and phonetic matching.
 *
 * Usage in cardMachine.js:
 * ```
 * invoke: {
 *   src: 'speechRecognitionService',
 *   data: {
 *     answerGrammar: context.answerGrammar
 *   },
 *   onDone: [
 *     { target: 'validating', cond: 'hasTranscript', actions: 'storeTranscript' },
 *     { target: 'maxAttemptsReached', cond: 'maxSrAttemptsReached' },
 *     { target: 'awaiting' }  // Retry
 *   ],
 *   onError: { actions: 'onSrError' }
 * }
 * ```
 */
/**
 * @param {SpeechRecognitionServiceContext} context
 * @returns {(send: SpeechRecognitionServiceSend, receive: SpeechRecognitionServiceReceive) => (() => void)}
 */
export function speechRecognitionService(context: SpeechRecognitionServiceContext) {
  return (send: SpeechRecognitionServiceSend, receive: SpeechRecognitionServiceReceive) => {
    srSend = send;
    // Store exclusion list for processAudioData callback
    currentSpeechHintExclusionList = context.speechHintExclusionList || '';
    
    (async () => {
      try {
        if (srHardFailureReason) {
          clientConsole(1, '[SR] Hard failure lock active; skipping init', { reason: srHardFailureReason });
          send({ type: 'TRANSCRIPTION_ERROR', error: `SR unavailable (${srHardFailureReason})`, silence: true });
          return;
        }

        if (!recorder) {
          await initializeAudioRecorderWithRetry('auto');
        } else {
          startRecording();
        }

        send({ type: 'RECORDING_STARTED' });
      } catch (error: unknown) {
        clientConsole(1, '[SR] Service init failed', { error: getErrorMessage(error) });
        send({ type: 'TRANSCRIPTION_ERROR', error: getErrorMessage(error), initFailure: true });
      }
    })();
    receive((event: SpeechRecognitionServiceEvent) => {
      const serviceEvent = event;
      if (serviceEvent.type === 'STOP_RECORDING') {
        stopRecording();
      }
    });

    return () => {
      if (srSend === send) {
        srSend = null;
      }
    };
  };
}




