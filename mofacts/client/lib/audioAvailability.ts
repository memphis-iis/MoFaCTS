type SrAvailabilityStatus = 'available' | 'blocked' | 'pending' | 'failed';

type SrAvailabilityDetail =
  | 'ok'
  | 'not_text_trial'
  | 'user_pref_disabled'
  | 'tdf_audio_disabled'
  | 'missing_key'
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'permission_prompt_pending'
  | 'audio_context_suspended'
  | 'media_interrupted'
  | 'initializing'
  | 'init_error';

type TdfLike = {
  tdfs?: {
    tutor?: {
      setspec?: {
        audioInputEnabled?: string | boolean;
        speechAPIKey?: string;
      };
    };
  };
};

type UserLike = {
  speechAPIKey?: string;
  audioSettings?: {
    audioInputMode?: boolean;
  };
};

type SrAvailabilityInput = {
  user?: UserLike | null;
  tdfFile?: TdfLike | null;
  sessionSpeechApiKey?: unknown;
  requireTextTrial?: boolean;
  isTextTrial?: boolean;
};

type SrAvailabilityResult = {
  status: SrAvailabilityStatus;
  detail: SrAvailabilityDetail;
  userAudioEnabled: boolean;
  tdfAudioEnabled: boolean;
  hasAnySpeechApiKey: boolean;
};

type SrInitErrorInput = {
  error: unknown;
  secureContext?: boolean;
  hasAnySpeechApiKey: boolean;
  browserSupportsMediaDevices: boolean;
};

type SrInitFailureClass = {
  retryable: boolean;
  detail: SrAvailabilityDetail;
  reason: string;
};

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseBooleanLike(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getUserAudioInputPreference(user?: UserLike | null): boolean {
  return user?.audioSettings?.audioInputMode === true;
}

function isTdfAudioInputEnabled(tdfFile?: TdfLike | null): boolean {
  return parseBooleanLike(tdfFile?.tdfs?.tutor?.setspec?.audioInputEnabled);
}

export function resolveSpeechApiKeyAvailability(input: Pick<SrAvailabilityInput, 'user' | 'tdfFile' | 'sessionSpeechApiKey'>): boolean {
  const tdfHasSpeechKey = hasNonEmptyString(input.tdfFile?.tdfs?.tutor?.setspec?.speechAPIKey);
  const userHasSpeechKey = hasNonEmptyString(input.user?.speechAPIKey);
  const sessionHasSpeechKey = hasNonEmptyString(input.sessionSpeechApiKey);
  return tdfHasSpeechKey || userHasSpeechKey || sessionHasSpeechKey;
}

export function evaluateSrAvailability(input: SrAvailabilityInput): SrAvailabilityResult {
  const userAudioEnabled = getUserAudioInputPreference(input.user);
  const tdfAudioEnabled = isTdfAudioInputEnabled(input.tdfFile);
  const hasAnySpeechApiKey = resolveSpeechApiKeyAvailability(input);

  if (input.requireTextTrial && input.isTextTrial !== true) {
    return { status: 'blocked', detail: 'not_text_trial', userAudioEnabled, tdfAudioEnabled, hasAnySpeechApiKey };
  }
  if (!userAudioEnabled) {
    return { status: 'blocked', detail: 'user_pref_disabled', userAudioEnabled, tdfAudioEnabled, hasAnySpeechApiKey };
  }
  if (!tdfAudioEnabled) {
    return { status: 'blocked', detail: 'tdf_audio_disabled', userAudioEnabled, tdfAudioEnabled, hasAnySpeechApiKey };
  }
  if (!hasAnySpeechApiKey) {
    return { status: 'blocked', detail: 'missing_key', userAudioEnabled, tdfAudioEnabled, hasAnySpeechApiKey };
  }
  return { status: 'available', detail: 'ok', userAudioEnabled, tdfAudioEnabled, hasAnySpeechApiKey };
}

export function classifySrInitFailure(input: SrInitErrorInput): SrInitFailureClass {
  const { error, secureContext, hasAnySpeechApiKey, browserSupportsMediaDevices } = input;
  if (!browserSupportsMediaDevices) {
    return { retryable: false, detail: 'unsupported', reason: 'media-devices-unavailable' };
  }
  if (secureContext === false) {
    return { retryable: false, detail: 'insecure_context', reason: 'insecure-context' };
  }
  if (!hasAnySpeechApiKey) {
    return { retryable: false, detail: 'missing_key', reason: 'missing-speech-api-key' };
  }

  const name = error instanceof Error ? error.name : '';
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();

  if (name === 'NotAllowedError') {
    const explicitlyDenied = message.includes('denied') || message.includes('permission denied');
    if (explicitlyDenied) {
      return { retryable: false, detail: 'permission_denied', reason: 'permission-denied' };
    }
    return { retryable: true, detail: 'permission_prompt_pending', reason: 'permission-timing' };
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { retryable: false, detail: 'unsupported', reason: 'no-supported-input-device' };
  }

  if (name === 'AbortError' || name === 'NotReadableError' || name === 'InvalidStateError' || name === 'SecurityError') {
    return { retryable: true, detail: 'media_interrupted', reason: `transient-${name || 'media-error'}` };
  }

  return { retryable: true, detail: 'init_error', reason: name || 'unknown-init-error' };
}
