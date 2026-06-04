import type { AiItem, AiLessonOutput } from './aiContentTypes';

export type CueLeak = {
  itemIndex: number;
  promptText: string;
  correctResponse: string;
  forbiddenTerms: string[];
};

export type CueLeakValidationOptions = {
  allowedTerms?: string[];
};

const MIN_FORBIDDEN_TOKEN_LENGTH = 3;
const DEFAULT_ALLOWED_TERMS = new Set([
  'and',
  'are',
  'but',
  'for',
  'from',
  'into',
  'not',
  'the',
  'this',
  'that',
  'with',
]);

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function isPureNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

export function forbiddenAnswerTerms(correctResponse: string, options: CueLeakValidationOptions = {}): string[] {
  const allowedTerms = new Set([
    ...DEFAULT_ALLOWED_TERMS,
    ...(options.allowedTerms || []).map((term) => term.toLowerCase()),
  ]);
  const terms = normalizedTokens(correctResponse)
    .filter((term) => term.length >= MIN_FORBIDDEN_TOKEN_LENGTH)
    .filter((term) => !isPureNumber(term))
    .filter((term) => !allowedTerms.has(term));
  return [...new Set(terms)];
}

export function findCueLeakForItem(
  item: AiItem,
  itemIndex: number,
  options: CueLeakValidationOptions = {},
): CueLeak | null {
  const promptText = String(item.prompt?.text || '').trim();
  const correctResponse = String(item.response?.correctResponse || '').trim();
  if (!promptText || !correctResponse) {
    return null;
  }
  const promptTokens = new Set(normalizedTokens(promptText));
  const forbiddenTerms = forbiddenAnswerTerms(correctResponse, options)
    .filter((term) => promptTokens.has(term));
  if (forbiddenTerms.length === 0) {
    return null;
  }
  return {
    itemIndex,
    promptText,
    correctResponse,
    forbiddenTerms,
  };
}

export function findCueLeaks(output: AiLessonOutput, options: CueLeakValidationOptions = {}): CueLeak[] {
  const items = Array.isArray(output.items) ? output.items : [];
  return items
    .map((item, itemIndex) => findCueLeakForItem(item, itemIndex, options))
    .filter((leak): leak is CueLeak => leak !== null);
}
