// Keep source alignment separate from the text retained in browser diagnostics.
// Match locations are observations only: never use them to repair a citation.
export function summarizeSparcCitation(
  citation: Readonly<Record<string, unknown>>,
  dialogueHistory: readonly Readonly<Record<string, unknown>>[],
  learnerText: string,
) {
  const source = citation.source === 'dialogueHistory' || citation.source === 'learnerText'
    ? citation.source : 'invalid';
  const index = citation.dialogueHistoryIndex === null ? null
    : Number.isSafeInteger(citation.dialogueHistoryIndex) && Number(citation.dialogueHistoryIndex) >= 0
      ? Number(citation.dialogueHistoryIndex) : 'invalid';
  const quote = typeof citation.quote === 'string' ? citation.quote.trim() : '';
  const matches = (text: unknown) => Boolean(quote && typeof text === 'string' && text.includes(quote));
  const referencedEntry = source === 'dialogueHistory' && typeof index === 'number'
    ? dialogueHistory[index] : undefined;
  const matchingStudentIndices: number[] = [];
  const matchingTutorIndices: number[] = [];
  let matchingStudentCount = 0;
  let matchingTutorCount = 0;
  let studentEntries = 0;
  for (const [entryIndex, entry] of dialogueHistory.entries()) {
    if (entry.role === 'student') studentEntries += 1;
    if (!matches(entry.text)) continue;
    if (entry.role === 'student') {
      matchingStudentCount += 1;
      if (matchingStudentIndices.length < 8) matchingStudentIndices.push(entryIndex);
    } else if (entry.role === 'tutor') {
      matchingTutorCount += 1;
      if (matchingTutorIndices.length < 8) matchingTutorIndices.push(entryIndex);
    }
  }
  return {
    source,
    index,
    referencedRole: source === 'learnerText' ? 'latest'
      : !referencedEntry ? 'missing'
        : referencedEntry.role === 'student' || referencedEntry.role === 'tutor'
          ? referencedEntry.role : 'invalid',
    historyEntries: dialogueHistory.length,
    studentEntries,
    quoteCharacters: quote.length,
    quoteMatchesReferenced: matches(source === 'learnerText' ? learnerText : referencedEntry?.text),
    matchingStudentIndices,
    matchingStudentCount,
    matchingTutorIndices,
    matchingTutorCount,
    quoteMatchesLatest: matches(learnerText),
  };
}

export function redactSparcDialogueDiagnosticText(text: string): string {
  return text
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?):\/\/\S+/gi, '[redacted connection string]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted API key]')
    .replace(/\bsk-(?:or-v1-)?[0-9A-Za-z_-]{16,}\b/g, '[redacted API key]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
}

export function describeSparcCitation(
  citation: Readonly<Record<string, unknown>>,
  dialogueHistory: readonly Readonly<Record<string, unknown>>[],
  learnerText: string,
) {
  const summary = summarizeSparcCitation(citation, dialogueHistory, learnerText);
  // Keep recent context plus the selected/matching entries, retaining original indices.
  const indices = new Set([
    ...dialogueHistory.slice(-32).map((_, index) => Math.max(0, dialogueHistory.length - 32) + index),
    ...(typeof summary.index === 'number' && dialogueHistory[summary.index] ? [summary.index] : []),
    ...summary.matchingStudentIndices,
    ...summary.matchingTutorIndices,
  ]);
  const history = [...indices].sort((a, b) => a - b).map((index) => {
    const entry = dialogueHistory[index]!;
    return {
      index,
      role: entry.role === 'student' || entry.role === 'tutor' ? entry.role : 'invalid',
      text: redactSparcDialogueDiagnosticText(typeof entry.text === 'string' ? entry.text : ''),
    };
  });
  return {
    summary,
    quote: redactSparcDialogueDiagnosticText(typeof citation.quote === 'string' ? citation.quote : ''),
    learnerText: redactSparcDialogueDiagnosticText(learnerText),
    dialogueHistory: history,
    omittedHistoryEntries: dialogueHistory.length - history.length,
  };
}
