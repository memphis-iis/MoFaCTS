export const AUDIO_PROMPT_MODES = ['silent', 'question', 'feedback', 'all'] as const;

export type AudioPromptMode = typeof AUDIO_PROMPT_MODES[number];
export type AudioPromptSource = 'question' | 'feedback';

export function normalizeAudioPromptMode(value: unknown): AudioPromptMode {
  if (typeof value !== 'string') {
    return 'silent';
  }

  const normalized = value.trim().toLowerCase();
  return (AUDIO_PROMPT_MODES as readonly string[]).includes(normalized)
    ? normalized as AudioPromptMode
    : 'silent';
}

export function audioPromptModeAllows(value: unknown, source: AudioPromptSource): boolean {
  const mode = normalizeAudioPromptMode(value);
  return mode === 'all' || mode === source;
}

export function isAudioPromptModeEnabled(value: unknown): boolean {
  return normalizeAudioPromptMode(value) !== 'silent';
}

type UnitAudioPromptConfig = {
  audioPromptMode?: unknown;
};

export function resolveUnitAudioPromptMode(
  unit: UnitAudioPromptConfig | null | undefined,
  inheritedMode: unknown,
  allowUnitEnable = true
): AudioPromptMode {
  const normalizedInheritedMode = normalizeAudioPromptMode(inheritedMode);
  if (unit && Object.prototype.hasOwnProperty.call(unit, 'audioPromptMode')) {
    if (!allowUnitEnable && normalizedInheritedMode === 'silent') {
      return 'silent';
    }
    return normalizeAudioPromptMode(unit.audioPromptMode);
  }
  return normalizedInheritedMode;
}

