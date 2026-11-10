/** Presentation/realization contract for newly selected categorized SPARC turns. */
export const SPARC_ORIENTATION_MODES = ['full', 'headings', 'off'] as const;
export type SparcOrientationMode = typeof SPARC_ORIENTATION_MODES[number];

export function resolveSparcOrientationMode(value: unknown): SparcOrientationMode {
  if (value === undefined) return 'full';
  if (!SPARC_ORIENTATION_MODES.some(mode => mode === value)) {
    throw new Error('sparcsession.orientationMode must be full, headings, or off');
  }
  return value as SparcOrientationMode;
}
