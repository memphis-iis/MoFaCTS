function legacyHistoryTrim(value: unknown): string {
  const asString = String(value || '');
  return asString.trim();
}

export function getHistoryCorrectAnswer(rawResponse: unknown): string {
  const fullResponse = legacyHistoryTrim(rawResponse);
  return fullResponse.split('~')[0] || '';
}

export function getHistoryResponseKey(
  rawResponse: unknown,
  getDisplayAnswerText: (answer: string) => string,
  normalizeResponseText: (answer: string) => string,
): string {
  const firstVariant = getHistoryCorrectAnswer(rawResponse);
  return normalizeResponseText(getDisplayAnswerText(firstVariant));
}
