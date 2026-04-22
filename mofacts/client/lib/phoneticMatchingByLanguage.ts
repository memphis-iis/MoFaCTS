import {
  buildPhoneticIndex,
  findPhoneticConflictsWithCorrectAnswer,
  findPhoneticMatch
} from './phoneticUtils';
import {
  buildSpanishPhoneticIndex,
  findSpanishPhoneticConflictsWithCorrectAnswer,
  findSpanishPhoneticMatch
} from './spanishPhoneticUtils';

type LanguageAwarePhoneticIndexEntry = {
  word: string;
  length: number;
  primary: string | null;
  secondary: string | null;
  codes?: string[];
};

type LanguageAwarePhoneticIndex = Map<string, LanguageAwarePhoneticIndexEntry[]>;

export function getPhoneticMatchingStrategy(language: string): 'english-default' | 'spanish' {
  return /^es(?:-|$)/i.test(language.trim()) ? 'spanish' : 'english-default';
}

export function buildPhoneticIndexForLanguage(
  grammarList: string[],
  language: string
): LanguageAwarePhoneticIndex {
  return getPhoneticMatchingStrategy(language) === 'spanish'
    ? buildSpanishPhoneticIndex(grammarList)
    : buildPhoneticIndex(grammarList);
}

export function findPhoneticConflictsWithCorrectAnswerForLanguage(
  correctAnswer: string,
  grammarList: string[],
  phoneticIndex: LanguageAwarePhoneticIndex | null,
  language: string
): string[] {
  return getPhoneticMatchingStrategy(language) === 'spanish'
    ? findSpanishPhoneticConflictsWithCorrectAnswer(correctAnswer, grammarList, phoneticIndex)
    : findPhoneticConflictsWithCorrectAnswer(correctAnswer, grammarList, phoneticIndex);
}

export function findPhoneticMatchForLanguage(
  spokenWord: string,
  grammarList: string[],
  phoneticIndex: LanguageAwarePhoneticIndex | null,
  language: string
): string | null {
  return getPhoneticMatchingStrategy(language) === 'spanish'
    ? findSpanishPhoneticMatch(spokenWord, grammarList, phoneticIndex)
    : findPhoneticMatch(spokenWord, grammarList, phoneticIndex);
}
