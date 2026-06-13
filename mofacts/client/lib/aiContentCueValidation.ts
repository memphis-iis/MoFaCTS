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
  'about',
  'after',
  'before',
  'being',
  'can',
  'does',
  'and',
  'are',
  'but',
  'for',
  'from',
  'into',
  'not',
  'only',
  'should',
  'the',
  'this',
  'that',
  'use',
  'with',
]);

const LOW_INFORMATION_MULTI_TERM_TOKENS = new Set([
  'action',
  'answer',
  'apply',
  'call',
  'change',
  'check',
  'choose',
  'common',
  'compatible',
  'correct',
  'describe',
  'different',
  'each',
  'example',
  'explain',
  'find',
  'function',
  'graph',
  'identify',
  'include',
  'includes',
  'item',
  'kind',
  'learn',
  'learner',
  'match',
  'mean',
  'method',
  'model',
  'needed',
  'operation',
  'optimizer',
  'process',
  'question',
  'response',
  'result',
  'same',
  'step',
  'term',
  'text',
  'type',
  'value',
  'word',
  'words',
]);

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function isPureNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

function hasCodeOrFormulaSyntax(value: string): boolean {
  return /(?:->|=>|==|!=|<=|>=|[()[\]{}._=<>/])/.test(value);
}

function containsTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) {
    return false;
  }
  for (let startIndex = 0; startIndex <= tokens.length - sequence.length; startIndex += 1) {
    const matches = sequence.every((token, sequenceIndex) => tokens[startIndex + sequenceIndex] === token);
    if (matches) {
      return true;
    }
  }
  return false;
}

function candidateAnswerTerms(correctResponse: string, options: CueLeakValidationOptions = {}): string[] {
  const allowedTerms = new Set([
    ...DEFAULT_ALLOWED_TERMS,
    ...(options.allowedTerms || []).map((term) => term.toLowerCase()),
  ]);
  return [...new Set(normalizedTokens(correctResponse)
    .filter((term) => term.length >= MIN_FORBIDDEN_TOKEN_LENGTH)
    .filter((term) => !isPureNumber(term))
    .filter((term) => !allowedTerms.has(term)))];
}

export function forbiddenAnswerTerms(correctResponse: string, options: CueLeakValidationOptions = {}): string[] {
  const candidateTerms = candidateAnswerTerms(correctResponse, options);
  const hasMultipleDistinctiveTerms = new Set(candidateTerms).size > 1;
  const terms = candidateTerms
    .filter((term) => !hasMultipleDistinctiveTerms || !LOW_INFORMATION_MULTI_TERM_TOKENS.has(term));
  return [...new Set(terms)];
}

function shouldFlagSinglePartialTermLeak(correctResponse: string, candidateTerms: string[]): boolean {
  if (hasCodeOrFormulaSyntax(correctResponse)) {
    return false;
  }
  return candidateTerms.length <= 2;
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
  const promptTokenList = normalizedTokens(promptText);
  const promptTokens = new Set(promptTokenList);
  const answerTokenList = normalizedTokens(correctResponse);
  const exactAnswerPhraseLeak = containsTokenSequence(promptTokenList, answerTokenList);
  const candidateTerms = candidateAnswerTerms(correctResponse, options);
  const leakedTerms = (exactAnswerPhraseLeak
    ? candidateAnswerTerms(correctResponse, options)
    : forbiddenAnswerTerms(correctResponse, options))
    .filter((term) => promptTokens.has(term));
  const forbiddenTerms = exactAnswerPhraseLeak ||
    leakedTerms.length > 1 ||
    (leakedTerms.length === 1 && shouldFlagSinglePartialTermLeak(correctResponse, candidateTerms))
    ? leakedTerms
    : [];
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
