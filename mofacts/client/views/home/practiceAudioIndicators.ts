import { isAudioPromptModeEnabled } from '../../../common/lib/audioPromptMode';

export type PracticeTtsIndicatorState = Readonly<{
  visible: boolean;
  active: boolean;
  runtimePromptModeEnabled: boolean;
  keyAvailable: boolean;
}>;

export function resolvePracticeTtsIndicatorState({
  lessonPromptMode,
  runtimePromptMode,
  keyAvailable,
}: {
  lessonPromptMode: unknown;
  runtimePromptMode: unknown;
  keyAvailable: boolean;
}): PracticeTtsIndicatorState {
  const visible = isAudioPromptModeEnabled(lessonPromptMode);
  const runtimePromptModeEnabled = isAudioPromptModeEnabled(runtimePromptMode);

  return {
    visible,
    active: visible && runtimePromptModeEnabled && keyAvailable,
    runtimePromptModeEnabled,
    keyAvailable,
  };
}
