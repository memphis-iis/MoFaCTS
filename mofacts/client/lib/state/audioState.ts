// Audio state management - Phase 3 of state management refactor
// Consolidates all audio-related Session variables into a single ReactiveDict

import { ReactiveDict } from 'meteor/reactive-dict';
import type { AudioStateValues } from '../../../common/types/audio';

const AudioState = new ReactiveDict('audio');

type AudioStateKey = keyof AudioStateValues;

function getAudioStateValue<K extends AudioStateKey>(key: K): AudioStateValues[K] {
  return AudioState.get(key) as AudioStateValues[K];
}

function setAudioStateValue<K extends AudioStateKey>(key: K, value: AudioStateValues[K]): void {
  AudioState.set(key, value);
}

const createGetter = <K extends AudioStateKey>(key: K) => (): AudioStateValues[K] => getAudioStateValue(key);
const createSetter = <K extends AudioStateKey>(key: K) => (value: AudioStateValues[K]): void => {
  setAudioStateValue(key, value);
};

// Warmup flags
export const getTtsWarmedUp = createGetter('ttsWarmedUp');
export const setTtsWarmedUp = createSetter('ttsWarmedUp');

export const getSrWarmedUp = createGetter('srWarmedUp');
export const setSrWarmedUp = createSetter('srWarmedUp');

export const getAudioRecorderInitialized = createGetter('audioRecorderInitialized');
export const setAudioRecorderInitialized = createSetter('audioRecorderInitialized');

// Audio enabled state
export const setAudioEnabled = createSetter('audioEnabled');

export const setAudioEnabledView = createSetter('audioEnabledView');

// Input sensitivity
export const getAudioInputSensitivity = createGetter('audioInputSensitivity');
export const setAudioInputSensitivity = createSetter('audioInputSensitivity');

export const setAudioInputSensitivityView = createSetter('audioInputSensitivityView');

// Prompt mode
export const setAudioPromptMode = createSetter('audioPromptMode');

export const getAudioPromptFeedbackView = createGetter('audioPromptFeedbackView');
export const setAudioPromptFeedbackView = createSetter('audioPromptFeedbackView');

// Volume settings
export const getAudioPromptQuestionVolume = createGetter('audioPromptQuestionVolume');
export const setAudioPromptQuestionVolume = createSetter('audioPromptQuestionVolume');

export const getAudioPromptFeedbackVolume = createGetter('audioPromptFeedbackVolume');
export const setAudioPromptFeedbackVolume = createSetter('audioPromptFeedbackVolume');

// Speaking rate settings
export const getAudioPromptQuestionSpeakingRate = createGetter('audioPromptQuestionSpeakingRate');
export const setAudioPromptQuestionSpeakingRate = createSetter('audioPromptQuestionSpeakingRate');

export const getAudioPromptFeedbackSpeakingRate = createGetter('audioPromptFeedbackSpeakingRate');
export const setAudioPromptFeedbackSpeakingRate = createSetter('audioPromptFeedbackSpeakingRate');

export const getAudioPromptSpeakingRate = createGetter('audioPromptSpeakingRate');
export const setAudioPromptSpeakingRate = createSetter('audioPromptSpeakingRate');

// Speaking rate view (for UI restore)
export const setAudioPromptQuestionSpeakingRateView = createSetter('audioPromptQuestionSpeakingRateView');

export const setAudioPromptFeedbackSpeakingRateView = createSetter('audioPromptFeedbackSpeakingRateView');

// Voice settings
export const getAudioPromptVoice = createGetter('audioPromptVoice');
export const setAudioPromptVoice = createSetter('audioPromptVoice');

export const getAudioPromptFeedbackVoice = createGetter('audioPromptFeedbackVoice');
export const setAudioPromptFeedbackVoice = createSetter('audioPromptFeedbackVoice');

// Voice view (for UI restore)
export const setAudioPromptVoiceView = createSetter('audioPromptVoiceView');

export const setAudioPromptFeedbackVoiceView = createSetter('audioPromptFeedbackVoiceView');

// Reset all audio state to defaults (for sessionCleanUp)
export const resetAudioState = (): void => {
  setAudioStateValue('ttsWarmedUp', false);
  setAudioStateValue('srWarmedUp', false);
  setAudioStateValue('audioRecorderInitialized', false);
  setAudioStateValue('audioEnabled', undefined);
  setAudioStateValue('audioEnabledView', undefined);
  setAudioStateValue('audioInputSensitivity', undefined);
  setAudioStateValue('audioInputSensitivityView', undefined);
  setAudioStateValue('audioPromptMode', undefined);
  setAudioStateValue('audioPromptFeedbackView', undefined);
  setAudioStateValue('audioPromptQuestionVolume', undefined);
  setAudioStateValue('audioPromptFeedbackVolume', undefined);
  setAudioStateValue('audioPromptQuestionSpeakingRate', undefined);
  setAudioStateValue('audioPromptFeedbackSpeakingRate', undefined);
  setAudioStateValue('audioPromptSpeakingRate', undefined);
  setAudioStateValue('audioPromptQuestionSpeakingRateView', undefined);
  setAudioStateValue('audioPromptFeedbackSpeakingRateView', undefined);
  setAudioStateValue('audioPromptVoice', undefined);
  setAudioStateValue('audioPromptFeedbackVoice', undefined);
  setAudioStateValue('audioPromptVoiceView', undefined);
  setAudioStateValue('audioPromptFeedbackVoiceView', undefined);
};
