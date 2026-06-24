const DEFAULT_SPEECH_RECOGNITION_LANGUAGE = 'en-US' as const;
const DEFAULT_IGNORE_OUT_OF_GRAMMAR_RESPONSES = true;
const DEFAULT_FILTER_CLOSE_SPEECH_RESPONSES = true;

type SetSpecWithSpeechLanguage = {
  speechRecognitionLanguage?: string | string[] | null;
};

type SetSpecWithSpeechGrammar = {
  speechIgnoreOutOfGrammarResponses?: unknown;
  srfilterclose?: unknown;
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

export function resolveSpeechIgnoreOutOfGrammarResponses(
  setSpec: SetSpecWithSpeechGrammar | null | undefined
): boolean {
  const raw = setSpec?.speechIgnoreOutOfGrammarResponses;
  if (typeof raw === 'undefined' || raw === null || String(raw).trim() === '') {
    return DEFAULT_IGNORE_OUT_OF_GRAMMAR_RESPONSES;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`Invalid setspec.speechIgnoreOutOfGrammarResponses value "${String(raw)}" for SR`);
  }

  return normalized === 'true';
}

export function resolveSpeechFilterCloseResponses(
  setSpec: SetSpecWithSpeechGrammar | null | undefined
): boolean {
  const raw = setSpec?.srfilterclose;
  if (typeof raw === 'undefined' || raw === null || String(raw).trim() === '') {
    return DEFAULT_FILTER_CLOSE_SPEECH_RESPONSES;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`Invalid setspec.srfilterclose value "${String(raw)}" for SR`);
  }

  return normalized === 'true';
}
