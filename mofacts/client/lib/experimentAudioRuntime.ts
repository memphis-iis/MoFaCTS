import { hasExperimentTag, resolveExperimentAudioSettings, type LessonAudioSetSpec } from './lessonAudioSettings';
import {
  setAudioEnabled, setAudioEnabledView, setAudioInputSensitivity, setAudioInputSensitivityView,
  setAudioPromptMode, setAudioPromptFeedbackView,
  setAudioPromptVoice, setAudioPromptVoiceView,
  setAudioPromptFeedbackVoice, setAudioPromptFeedbackVoiceView,
  setAudioPromptQuestionSpeakingRate, setAudioPromptQuestionSpeakingRateView,
  setAudioPromptFeedbackSpeakingRate, setAudioPromptFeedbackSpeakingRateView,
  setAudioPromptQuestionVolume, setAudioPromptFeedbackVolume,
} from './state/audioState';

// Reapply after condition selection and on content entry/resume. This changes
// only runtime state, never the participant's stored profile or lesson settings.
export function applyExperimentAudioSettings(setSpec: LessonAudioSetSpec | null | undefined): void {
  if (!hasExperimentTag(setSpec)) return;
  const audio = resolveExperimentAudioSettings(setSpec!);
  setAudioPromptMode(audio.audioPromptMode);
  setAudioPromptFeedbackView(audio.audioPromptMode === 'all' || audio.audioPromptMode === 'feedback');
  setAudioEnabled(audio.audioInputMode);
  setAudioEnabledView(audio.audioInputMode);
  setAudioInputSensitivity(audio.audioInputSensitivity);
  setAudioInputSensitivityView(audio.audioInputSensitivity);
  setAudioPromptVoice(audio.audioPromptVoice);
  setAudioPromptVoiceView(audio.audioPromptVoice);
  setAudioPromptFeedbackVoice(audio.audioPromptFeedbackVoice);
  setAudioPromptFeedbackVoiceView(audio.audioPromptFeedbackVoice);
  setAudioPromptQuestionSpeakingRate(audio.audioPromptQuestionSpeakingRate);
  setAudioPromptQuestionSpeakingRateView(audio.audioPromptQuestionSpeakingRate);
  setAudioPromptFeedbackSpeakingRate(audio.audioPromptFeedbackSpeakingRate);
  setAudioPromptFeedbackSpeakingRateView(audio.audioPromptFeedbackSpeakingRate);
  setAudioPromptQuestionVolume(audio.audioPromptQuestionVolume);
  setAudioPromptFeedbackVolume(audio.audioPromptFeedbackVolume);
}
