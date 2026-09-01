/**
 * Authoritative helper names accepted in authored probability expressions.
 * Runtime helper implementations must remain exactly aligned with this manifest.
 */
export const PROBABILITY_FUNCTION_HELPER_NAMES = Object.freeze([
  'testFunction',
  'mul',
  'logitdec',
  'recency',
  'quaddiffcor',
  'quaddiffincor',
  'linediffcor',
  'linediffincor',
  'arrSum',
  'errlist',
  'componentSpacing',
  'spacingLagged',
  'ppew',
  'ppet',
  'ppetw',
  'slideppetw',
  'ppes',
  'ppesFromTimes',
] as const);

export type ProbabilityFunctionHelperName = typeof PROBABILITY_FUNCTION_HELPER_NAMES[number];
