type TtsLanguageResolutionInput = {
  configuredLanguage?: string | string[] | null | undefined;
  requestedVoice?: string | null | undefined;
  contextLabel: string;
};

export function inferTtsLanguageFromVoice(requestedVoice: string | null | undefined): string {
  const voiceMatch = String(requestedVoice || '').trim().match(/^([A-Za-z]{2,3}-[A-Za-z]{2,3})-/);
  return voiceMatch?.[1] || '';
}

export function resolveExplicitTtsLanguageCode(input: TtsLanguageResolutionInput): string {
  const configuredLanguage = Array.isArray(input.configuredLanguage)
    ? input.configuredLanguage.map((value) => String(value || '').trim()).find(Boolean)
    : String(input.configuredLanguage || '').trim();
  if (configuredLanguage) {
    return configuredLanguage;
  }

  const voiceLanguage = inferTtsLanguageFromVoice(input.requestedVoice);
  if (voiceLanguage) {
    return voiceLanguage;
  }

  throw new Error(`${input.contextLabel} requires an explicit text-to-speech language or voice locale.`);
}

export function canResolveExplicitTtsLanguageCode(input: TtsLanguageResolutionInput): boolean {
  try {
    resolveExplicitTtsLanguageCode(input);
    return true;
  } catch (_error) {
    return false;
  }
}
