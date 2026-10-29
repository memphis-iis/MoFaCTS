// Browser diagnostics retain source alignment metadata without learner or tutor text.
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
