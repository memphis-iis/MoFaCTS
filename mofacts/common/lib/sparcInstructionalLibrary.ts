/** Shared component types accepted by library listing, grouping, and cursor validation. */
export const SPARC_INSTRUCTIONAL_COMPONENT_KINDS = ['feedback', 'explanation', 'richContent', 'question', 'image', 'video'] as const;
export type SparcInstructionalComponentKind = typeof SPARC_INSTRUCTIONAL_COMPONENT_KINDS[number];

export function isSparcInstructionalComponentKind(value: unknown): value is SparcInstructionalComponentKind {
  return SPARC_INSTRUCTIONAL_COMPONENT_KINDS.some(kind => kind === value);
}
