/** Authored target contract shared by upload validation and learner runtime. */
export const SPARC_TARGET_CATEGORIES = ['fact', 'model', 'rule', 'fact-model', 'fact-rule', 'model-rule', 'fact-model-rule'] as const;
export type SparcTargetCategory = typeof SPARC_TARGET_CATEGORIES[number];
export const SPARC_QUESTION_RESPONSE_FORMATS = ['text', 'cloze', 'multiple-choice', 'true-false'] as const;
export type SparcQuestionResponseFormat = typeof SPARC_QUESTION_RESPONSE_FORMATS[number];
export const SPARC_QUESTION_RESPONSE_LABELS: Readonly<Record<SparcQuestionResponseFormat, string>> = {
  text: 'text answer', cloze: 'cloze', 'multiple-choice': 'multiple choice', 'true-false': 'true/false',
};

/** The saved dynamic action owns its question format, including records predating format metadata. */
export function sparcQuestionFormatFromAction(action: unknown): SparcQuestionResponseFormat | undefined {
  if (typeof action !== 'string' || !action.startsWith('instruction.dynamic.')) return undefined;
  const format = SPARC_QUESTION_RESPONSE_FORMATS.find(value => action.endsWith(`.${value}`));
  if (!format) throw new Error(`Unknown dynamic question format: ${action}`);
  return format;
}

export function isSparcChoiceFormat(format: unknown): format is 'multiple-choice' | 'true-false' {
  return format === 'multiple-choice' || format === 'true-false';
}

export function validateSparcClozeQuestion(text: string): void {
  const blanks = text.match(/_{2,}/g) ?? [];
  if (blanks.length !== 1 || blanks[0] !== '_____' || !text.replace('_____', '').trim()) {
    throw new Error('Cloze question requires exactly one _____ blank in a meaningful statement');
  }
}

export function requireSparcTargetCategory(value: unknown, label: string): SparcTargetCategory {
  if (!(SPARC_TARGET_CATEGORIES as readonly unknown[]).includes(value)) {
    throw new Error(`${label} requires category: ${SPARC_TARGET_CATEGORIES.join(', ')}`);
  }
  return value as SparcTargetCategory;
}

export function sparcTargetCategoryFields(value: unknown, label: string, required: boolean): { category?: SparcTargetCategory } {
  return value === undefined && !required ? {} : { category: requireSparcTargetCategory(value, label) };
}
