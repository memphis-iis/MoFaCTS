/** Authored target contract shared by upload validation and learner runtime. */
export const SPARC_TARGET_CATEGORIES = ['fact', 'model', 'rule', 'fact-model', 'fact-rule', 'model-rule', 'fact-model-rule'] as const;
export type SparcTargetCategory = typeof SPARC_TARGET_CATEGORIES[number];
export type SparcQuestionResponseFormat = 'text' | 'multiple-choice';

export function requireSparcTargetCategory(value: unknown, label: string): SparcTargetCategory {
  if (!(SPARC_TARGET_CATEGORIES as readonly unknown[]).includes(value)) {
    throw new Error(`${label} requires category: ${SPARC_TARGET_CATEGORIES.join(', ')}`);
  }
  return value as SparcTargetCategory;
}

export function sparcTargetCategoryFields(value: unknown, label: string, required: boolean): { category?: SparcTargetCategory } {
  return value === undefined && !required ? {} : { category: requireSparcTargetCategory(value, label) };
}
