import { isAudioPromptModeEnabled, resolveUnitAudioPromptMode } from '../../common/lib/audioPromptMode';
import { normalizeAudioSettings } from '../views/audioSettingsState';
import { resolveUnitSpeechRecognitionEnabled } from './speechRecognitionConfig';

export type LessonAudioSetSpec = {
  tags?: unknown;
  audioInputEnabled?: unknown;
  audioInputSensitivity?: unknown;
  audioPromptMode?: unknown;
  audioPromptVoice?: unknown;
  audioPromptFeedbackVoice?: unknown;
  audioPromptQuestionSpeakingRate?: unknown;
  audioPromptFeedbackSpeakingRate?: unknown;
  audioPromptQuestionVolume?: unknown;
  audioPromptFeedbackVolume?: unknown;
};

export function hasExperimentTag(setSpec: LessonAudioSetSpec | null | undefined): boolean {
  return Array.isArray(setSpec?.tags) && setSpec.tags.some(
    tag => typeof tag === 'string' && tag.trim().toLowerCase() === 'experiment',
  );
}

// Authored condition values use the existing audio defaults, never profile values.
export function resolveExperimentAudioSettings(setSpec: LessonAudioSetSpec) {
  return normalizeAudioSettings({
    ...setSpec,
    audioInputMode: resolveUnitSpeechRecognitionEnabled(null, setSpec),
  });
}

export function resolveLessonAudioPromptMode(
  unit: Parameters<typeof resolveUnitAudioPromptMode>[0],
  setSpec: LessonAudioSetSpec | null | undefined,
  inheritedMode: unknown,
  isExperimentSession = false,
) {
  const experimentAudio = hasExperimentTag(setSpec);
  return resolveUnitAudioPromptMode(
    unit,
    experimentAudio ? setSpec?.audioPromptMode : inheritedMode,
    experimentAudio || isExperimentSession || isAudioPromptModeEnabled(inheritedMode),
  );
}
