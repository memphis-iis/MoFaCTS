/** Omitted settings deliberately retain the regular, unbiased prompt. */
export const SPARC_READING_LEVELS = ['unbiased', 'high-school-freshman', 'college-freshman'] as const;
export type SparcReadingLevel = typeof SPARC_READING_LEVELS[number];

export function resolveSparcReadingLevel(value: unknown): SparcReadingLevel {
  if (value === undefined) return 'unbiased';
  if (!SPARC_READING_LEVELS.some(level => level === value)) {
    throw new Error('sparcsession.readingLevel must be unbiased, high-school-freshman, or college-freshman');
  }
  return value as SparcReadingLevel;
}

export function sparcReadingLevelInstruction(level: SparcReadingLevel): string {
  if (level === 'unbiased') return '';
  const audience = level === 'high-school-freshman'
    ? 'a freshman high school student (grade 9)'
    : 'a freshman college student (first year)';
  return `For learner-facing text only, speak as if talking to ${audience}. Use familiar vocabulary, direct sentences, and short paragraphs appropriate to that audience. Explain necessary technical terms in plain language when first used. Keep the tone respectful. Preserve the target concepts, factual precision, qualifications, required reasoning, response format, and selected level of assistance; simplify language without lowering the learning standard or revealing answers. Apply this direction to explanations, feedback, questions, answer options, worked examples, tables, headings, and learner-facing figure descriptions. Do not change identifiers, JSON structure, image-generation instructions, scoring, or target selection.`;
}
