export const AUDIO_INPUT_SENSITIVITY_MIN = 20;
export const AUDIO_INPUT_SENSITIVITY_MAX = 80;
export const AUDIO_INPUT_SENSITIVITY_DEFAULT = 60;

export type AudioPromptMode = 'silent' | 'question' | 'feedback' | 'all';

export type AudioSettingsForm = Readonly<{
  audioPromptMode: AudioPromptMode;
  audioPromptQuestionVolume: number;
  audioPromptQuestionSpeakingRate: number;
  audioPromptVoice: string;
  audioPromptFeedbackVolume: number;
  audioPromptFeedbackSpeakingRate: number;
  audioPromptFeedbackVoice: string;
  audioInputMode: boolean;
  audioInputSensitivity: number;
}>;

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsForm = Object.freeze({
  audioPromptMode: 'silent',
  audioPromptQuestionVolume: 0,
  audioPromptQuestionSpeakingRate: 1,
  audioPromptVoice: 'en-US-Standard-A',
  audioPromptFeedbackVolume: 0,
  audioPromptFeedbackSpeakingRate: 1,
  audioPromptFeedbackVoice: 'en-US-Standard-A',
  audioInputMode: false,
  audioInputSensitivity: AUDIO_INPUT_SENSITIVITY_DEFAULT,
});

function finiteNumber(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function normalizeAudioInputSensitivity(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return AUDIO_INPUT_SENSITIVITY_DEFAULT;
  }
  return Math.min(AUDIO_INPUT_SENSITIVITY_MAX, Math.max(AUDIO_INPUT_SENSITIVITY_MIN, parsed));
}

function normalizePromptMode(value: unknown): AudioPromptMode {
  return value === 'question' || value === 'feedback' || value === 'all'
    ? value
    : 'silent';
}

export function normalizeAudioSettings(value: unknown): AudioSettingsForm {
  const source = value && typeof value === 'object'
    ? value as Partial<AudioSettingsForm>
    : {};
  return {
    audioPromptMode: normalizePromptMode(source.audioPromptMode),
    audioPromptQuestionVolume: finiteNumber(
      source.audioPromptQuestionVolume,
      DEFAULT_AUDIO_SETTINGS.audioPromptQuestionVolume,
    ),
    audioPromptQuestionSpeakingRate: finiteNumber(
      source.audioPromptQuestionSpeakingRate,
      DEFAULT_AUDIO_SETTINGS.audioPromptQuestionSpeakingRate,
    ),
    audioPromptVoice: typeof source.audioPromptVoice === 'string' && source.audioPromptVoice
      ? source.audioPromptVoice
      : DEFAULT_AUDIO_SETTINGS.audioPromptVoice,
    audioPromptFeedbackVolume: finiteNumber(
      source.audioPromptFeedbackVolume,
      DEFAULT_AUDIO_SETTINGS.audioPromptFeedbackVolume,
    ),
    audioPromptFeedbackSpeakingRate: finiteNumber(
      source.audioPromptFeedbackSpeakingRate,
      DEFAULT_AUDIO_SETTINGS.audioPromptFeedbackSpeakingRate,
    ),
    audioPromptFeedbackVoice: typeof source.audioPromptFeedbackVoice === 'string' && source.audioPromptFeedbackVoice
      ? source.audioPromptFeedbackVoice
      : DEFAULT_AUDIO_SETTINGS.audioPromptFeedbackVoice,
    audioInputMode: source.audioInputMode === true,
    audioInputSensitivity: normalizeAudioInputSensitivity(source.audioInputSensitivity),
  };
}

export function parsePublishedAudioSettings(value: unknown): AudioSettingsForm {
  if (!value || typeof value !== 'object') {
    throw new Error('The audio settings publication did not provide an object.');
  }
  const source = value as Record<string, unknown>;
  const requiredKeys = [
    'audioPromptMode',
    'audioPromptQuestionVolume',
    'audioPromptQuestionSpeakingRate',
    'audioPromptVoice',
    'audioPromptFeedbackVolume',
    'audioPromptFeedbackSpeakingRate',
    'audioPromptFeedbackVoice',
    'audioInputMode',
    'audioInputSensitivity',
  ] as const;
  const missingKey = requiredKeys.find((key) => !(key in source));
  if (missingKey) {
    throw new Error(`The audio settings publication is missing ${missingKey}.`);
  }
  if (!['silent', 'question', 'feedback', 'all'].includes(String(source.audioPromptMode))) {
    throw new Error('The audio settings publication contains an invalid prompt mode.');
  }
  if (typeof source.audioInputMode !== 'boolean') {
    throw new Error('The audio settings publication contains an invalid audio input mode.');
  }
  for (const key of [
    'audioPromptQuestionVolume',
    'audioPromptQuestionSpeakingRate',
    'audioPromptFeedbackVolume',
    'audioPromptFeedbackSpeakingRate',
    'audioInputSensitivity',
  ] as const) {
    if (!Number.isFinite(Number(source[key]))) {
      throw new Error(`The audio settings publication contains an invalid ${key}.`);
    }
  }
  if (
    typeof source.audioPromptVoice !== 'string'
    || !source.audioPromptVoice
    || typeof source.audioPromptFeedbackVoice !== 'string'
    || !source.audioPromptFeedbackVoice
  ) {
    throw new Error('The audio settings publication contains an invalid voice.');
  }
  return normalizeAudioSettings(source);
}

export function promptModeFromToggles(question: boolean, feedback: boolean): AudioPromptMode {
  if (question && feedback) return 'all';
  if (question) return 'question';
  if (feedback) return 'feedback';
  return 'silent';
}

export function promptQuestionEnabled(settings: AudioSettingsForm): boolean {
  return settings.audioPromptMode === 'question' || settings.audioPromptMode === 'all';
}

export function promptFeedbackEnabled(settings: AudioSettingsForm): boolean {
  return settings.audioPromptMode === 'feedback' || settings.audioPromptMode === 'all';
}

export function promptControlsVisible(settings: AudioSettingsForm): boolean {
  return settings.audioPromptMode !== 'silent';
}

export function rangeProgress(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || maximum <= minimum) {
    throw new Error('Range progress requires a finite value and an increasing range.');
  }
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return ((bounded - minimum) / (maximum - minimum)) * 100;
}
