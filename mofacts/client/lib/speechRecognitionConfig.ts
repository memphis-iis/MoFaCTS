const DEFAULT_SPEECH_RECOGNITION_LANGUAGE = 'en-US' as const;

type SetSpecWithSpeechLanguage = {
  speechRecognitionLanguage?: string | string[] | null;
};

export function resolveSpeechRecognitionLanguage(
  setSpec: SetSpecWithSpeechLanguage | null | undefined
): string {
  const raw = setSpec?.speechRecognitionLanguage;

  if (Array.isArray(raw)) {
    const firstNonEmpty = raw
      .map((value) => String(value || '').trim())
      .find(Boolean);
    return firstNonEmpty || DEFAULT_SPEECH_RECOGNITION_LANGUAGE;
  }

  const language = String(raw || '').trim();
  return language || DEFAULT_SPEECH_RECOGNITION_LANGUAGE;
}
