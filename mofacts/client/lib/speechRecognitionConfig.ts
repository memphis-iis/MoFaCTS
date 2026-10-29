import { GOOGLE_STT_LANGUAGE_CODES } from '../../common/fieldRegistrySectionCore';

const DEFAULT_IGNORE_OUT_OF_GRAMMAR_RESPONSES = true;
const DEFAULT_FILTER_CLOSE_SPEECH_RESPONSES = true;

type SetSpecWithSpeechLanguage = {
  speechRecognitionLanguage?: unknown;
};

const supportedSpeechLanguages = new Set<string>(GOOGLE_STT_LANGUAGE_CODES);

export class SpeechRecognitionConfigurationError extends Error {}

type SetSpecWithSpeechGrammar = {
  speechIgnoreOutOfGrammarResponses?: unknown;
  srfilterclose?: unknown;
};

type SpeechEnabledConfig = {
  audioInputEnabled?: unknown;
};

function parseSpeechEnabled(value: unknown): boolean {
  return value === true || value === 1 || String(value ?? '').trim().toLowerCase() === 'true';
}

export function resolveUnitSpeechRecognitionEnabled(
  unit: SpeechEnabledConfig | null | undefined,
  setSpec: SpeechEnabledConfig | null | undefined
): boolean {
  if (unit && Object.prototype.hasOwnProperty.call(unit, 'audioInputEnabled')) {
    return parseSpeechEnabled(unit.audioInputEnabled);
  }
  return parseSpeechEnabled(setSpec?.audioInputEnabled);
}

export function resolveSpeechRecognitionLanguage(
  setSpec: SetSpecWithSpeechLanguage | null | undefined,
): string {
  const raw = setSpec?.speechRecognitionLanguage;
  if (raw != null && typeof raw !== 'string' && !Array.isArray(raw)
    || Array.isArray(raw) && raw.some(value => typeof value !== 'string')) {
    throw new SpeechRecognitionConfigurationError('setspec.speechRecognitionLanguage must contain a supported Google Speech-to-Text language code.');
  }
  // Repeated authored values retain their current first-nonblank selection contract.
  const language = Array.isArray(raw)
    ? raw.map(value => value.trim()).find(Boolean) ?? ''
    : typeof raw === 'string' ? raw.trim() : '';
  if (!language) {
    throw new SpeechRecognitionConfigurationError('Speech recognition requires an explicit setspec.speechRecognitionLanguage.');
  }
  if (!supportedSpeechLanguages.has(language)) {
    throw new SpeechRecognitionConfigurationError('setspec.speechRecognitionLanguage must contain a supported Google Speech-to-Text language code.');
  }
  return language;
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
