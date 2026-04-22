import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { audioManager } from './audioContextManager';
import { evaluateSrAvailability } from './audioAvailability';
import { resolveSpeechRecognitionLanguage } from './speechRecognitionConfig';
import {
  getAudioRecorderInitialized,
  getSrWarmedUp,
  getTtsWarmedUp,
  setAudioRecorderInitialized,
  setSrWarmedUp,
  setTtsWarmedUp,
} from './state/audioState';

type AudioStartupUser = {
  speechAPIKey?: string;
  ttsAPIKey?: string;
  audioSettings?: {
    audioInputMode?: boolean;
    audioPromptMode?: string;
  };
};

type AudioStartupTdf = {
  tdfs?: {
    tutor?: {
      setspec?: {
        enableAudioPromptAndFeedback?: string | boolean;
        textToSpeechAPIKey?: string;
        textToSpeechLanguage?: string;
        audioPromptFeedbackVoice?: string;
        speechAPIKey?: string;
        speechRecognitionLanguage?: string;
        audioInputEnabled?: string;
      };
    };
  };
};

const AUDIO_STARTUP_TIMEOUT_MS = 12000;

type AudioLaunchPreparationPlan = {
  requiresPreparation: boolean;
  ttsWarmup: boolean;
  srWarmup: boolean;
  recorderPreInitialization: boolean;
};

function hasEnabledAudioPromptMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value !== 'silent';
}

function parseBooleanLike(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function getSpeechRecognitionMediaConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
}

function supportsSr(currentTdfFile: AudioStartupTdf | null | undefined, user: AudioStartupUser | null | undefined) {
  const availability = evaluateSrAvailability({
    user: user as any,
    tdfFile: currentTdfFile as any,
    sessionSpeechApiKey: Session.get('speechAPIKey'),
  });
  return availability.status === 'available';
}

function supportsTts(currentTdfFile: AudioStartupTdf | null | undefined, user: AudioStartupUser | null | undefined) {
  const userAudioPromptMode = user?.audioSettings?.audioPromptMode;
  const tdfTtsEnabled = parseBooleanLike(currentTdfFile?.tdfs?.tutor?.setspec?.enableAudioPromptAndFeedback);
  const hasTtsKey = (
    typeof currentTdfFile?.tdfs?.tutor?.setspec?.textToSpeechAPIKey === 'string' &&
    currentTdfFile.tdfs.tutor.setspec.textToSpeechAPIKey.trim().length > 0
  ) || (
    typeof user?.ttsAPIKey === 'string' &&
    user.ttsAPIKey.trim().length > 0
  );

  return tdfTtsEnabled &&
    hasEnabledAudioPromptMode(userAudioPromptMode) &&
    hasTtsKey;
}

function ensureMediaDevicesPolyfill() {
  if ((navigator as any).mediaDevices === undefined) {
    (navigator as any).mediaDevices = {};
  }
  if ((navigator as any).mediaDevices.getUserMedia === undefined) {
    (navigator as any).mediaDevices.getUserMedia = function(constraints: MediaStreamConstraints) {
      const getUserMedia = (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia ||
        (navigator as any).msGetUserMedia ||
        (navigator as any).getUserMedia;
      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
      }
      return new Promise(function(resolve: (stream: MediaStream) => void, reject: (error: unknown) => void) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
}

export async function withStartupTimeout<T>(promise: Promise<T>, label: string, timeoutMs = AUDIO_STARTUP_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[Audio Startup] ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function warmupTtsIfNeeded(
  currentTdfFile: AudioStartupTdf | null | undefined,
  user: AudioStartupUser | null | undefined,
): Promise<void> {
  if (!supportsTts(currentTdfFile, user) || getTtsWarmedUp()) {
    return;
  }

  await withStartupTimeout(
    (Meteor as any).callAsync(
      'makeGoogleTTSApiCall',
      Session.get('currentTdfId'),
      'warmup',
      1.0,
      0.0,
      currentTdfFile?.tdfs?.tutor?.setspec?.audioPromptFeedbackVoice || 'en-US-Standard-A',
      currentTdfFile?.tdfs?.tutor?.setspec?.textToSpeechLanguage || 'en-US'
    ),
    'TTS warmup'
  );

  setTtsWarmedUp(true);
}

async function warmupSrIfNeeded(
  currentTdfFile: AudioStartupTdf | null | undefined,
  user: AudioStartupUser | null | undefined,
): Promise<void> {
  if (!supportsSr(currentTdfFile, user) ||
      !currentTdfFile?.tdfs?.tutor?.setspec?.speechAPIKey ||
      getSrWarmedUp()) {
    return;
  }

  const speechRecognitionLanguage = resolveSpeechRecognitionLanguage(currentTdfFile?.tdfs?.tutor?.setspec);

  const silentAudioBytes = new Uint8Array(3200).fill(0);
  const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(silentAudioBytes) as any));
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: speechRecognitionLanguage,
      maxAlternatives: 1,
      profanityFilter: false,
      enableAutomaticPunctuation: false,
      model: 'latest_short',
      useEnhanced: true,
      speechContexts: [{
        phrases: ['warmup'],
        boost: 5
      }]
    },
    audio: {
      content: base64Audio
    }
  };

  await withStartupTimeout(
    (Meteor as any).callAsync(
      'makeGoogleSpeechAPICall',
      Session.get('currentTdfId'),
      '',
      request,
      ['warmup']
    ),
    'SR warmup'
  );

  setSrWarmedUp(true);
}

async function preInitializeAudioRecorderIfNeeded(
  currentTdfFile: AudioStartupTdf | null | undefined,
  user: AudioStartupUser | null | undefined,
): Promise<void> {
  if (!supportsSr(currentTdfFile, user) ||
      !currentTdfFile?.tdfs?.tutor?.setspec?.speechAPIKey ||
      getAudioRecorderInitialized() ||
      audioManager.getPreInitializedStream()) {
    return;
  }

  if (!audioManager.getRecorderContext()) {
    window.AudioContext = window.webkitAudioContext || window.AudioContext;
    audioManager.createRecorderContext({ sampleRate: 16000 });
  }

  ensureMediaDevicesPolyfill();

  const stream = await withStartupTimeout(
    navigator.mediaDevices.getUserMedia(getSpeechRecognitionMediaConstraints()),
    'audio recorder pre-initialization'
  );

  audioManager.setPreInitializedStream(stream);
  setAudioRecorderInitialized(true);
}

export function getAudioLaunchPreparationPlan(
  currentTdfFile: AudioStartupTdf | null | undefined,
  user: AudioStartupUser | null | undefined,
): AudioLaunchPreparationPlan {
  const hasSrWarmupTarget = !!currentTdfFile?.tdfs?.tutor?.setspec?.speechAPIKey;
  const srSupported = supportsSr(currentTdfFile, user);

  const ttsWarmup = supportsTts(currentTdfFile, user) && !getTtsWarmedUp();
  const srWarmup = srSupported && hasSrWarmupTarget && !getSrWarmedUp();
  const recorderPreInitialization = srSupported &&
    hasSrWarmupTarget &&
    !getAudioRecorderInitialized() &&
    !audioManager.getPreInitializedStream();

  return {
    requiresPreparation: ttsWarmup || srWarmup || recorderPreInitialization,
    ttsWarmup,
    srWarmup,
    recorderPreInitialization,
  };
}

export async function prepareAudioForLaunchIfNeeded(
  currentTdfFile: AudioStartupTdf | null | undefined,
  user: AudioStartupUser | null | undefined,
): Promise<void> {
  const preparationPlan = getAudioLaunchPreparationPlan(currentTdfFile, user);
  if (!preparationPlan.requiresPreparation) {
    return;
  }

  const startupTasks: Promise<void>[] = [];
  if (preparationPlan.ttsWarmup) {
    startupTasks.push(warmupTtsIfNeeded(currentTdfFile, user));
  }
  if (preparationPlan.srWarmup) {
    startupTasks.push(warmupSrIfNeeded(currentTdfFile, user));
  }
  if (preparationPlan.recorderPreInitialization) {
    startupTasks.push(preInitializeAudioRecorderIfNeeded(currentTdfFile, user));
  }

  const results = await Promise.allSettled(startupTasks);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
  if (rejected) {
    throw rejected.reason;
  }
}
