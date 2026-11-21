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

export const personalAudioVoices = new Set('ABCDEFGHIJ'.split('').map(letter => `en-US-Standard-${letter}`));

export function validPersonalAudioSetting(key: string, value: unknown): boolean {
  switch (key) {
    case 'audioPromptMode': return ['silent', 'question', 'feedback', 'all'].some(mode => mode === value);
    case 'audioInputMode': return typeof value === 'boolean';
    case 'audioPromptVoice':
    case 'audioPromptFeedbackVoice': return typeof value === 'string' && personalAudioVoices.has(value);
    case 'audioPromptQuestionVolume':
    case 'audioPromptFeedbackVolume': return typeof value === 'number' && value >= -6 && value <= 6 && Number.isInteger(value * 2);
    case 'audioPromptQuestionSpeakingRate':
    case 'audioPromptFeedbackSpeakingRate': return typeof value === 'number' && value >= 0.25 && value <= 2 && Number.isInteger(value * 4);
    case 'audioInputSensitivity': return typeof value === 'number' && Number.isInteger(value) && value >= AUDIO_INPUT_SENSITIVITY_MIN && value <= AUDIO_INPUT_SENSITIVITY_MAX;
    default: return false;
  }
}
