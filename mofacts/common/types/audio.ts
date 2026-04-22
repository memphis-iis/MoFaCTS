// Owner: Learning Runtime Team
// Shared contracts for persisted audio settings and per-session audio state.

export type AudioPromptMode = 'none' | 'question' | 'feedback' | 'both';

export interface AudioStateValues {
  ttsWarmedUp: boolean;
  srWarmedUp: boolean;
  audioRecorderInitialized: boolean;
  audioEnabled: boolean | undefined;
  audioEnabledView: boolean | undefined;
  audioInputSensitivity: number | undefined;
  audioInputSensitivityView: number | undefined;
  audioPromptMode: AudioPromptMode | undefined;
  audioPromptFeedbackView: boolean | undefined;
  audioPromptQuestionVolume: number | undefined;
  audioPromptFeedbackVolume: number | undefined;
  audioPromptQuestionSpeakingRate: number | undefined;
  audioPromptFeedbackSpeakingRate: number | undefined;
  audioPromptSpeakingRate: number | undefined;
  audioPromptQuestionSpeakingRateView: number | undefined;
  audioPromptFeedbackSpeakingRateView: number | undefined;
  audioPromptVoice: string | undefined;
  audioPromptFeedbackVoice: string | undefined;
  audioPromptVoiceView: string | undefined;
  audioPromptFeedbackVoiceView: string | undefined;
}
