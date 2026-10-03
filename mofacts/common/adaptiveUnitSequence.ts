/** Frozen generated units belong to the same durable state as the unit cursor.
 * Resume must not reevaluate a completed branch using later practice answers.
 */
export type AdaptiveUnitSequence = {
  version: 1;
  tdfId: string;
  units: Record<string, unknown>[];
};

export function captureAdaptiveUnitSequence(tdfId: unknown, units: Record<string, unknown>[]): AdaptiveUnitSequence {
  if (typeof tdfId !== 'string' || !tdfId) throw new Error('Adaptive sequence requires a TDF identity');
  return { version: 1, tdfId, units: structuredClone(units) };
}

export function restoreAdaptiveUnitSequence(
  content: any,
  state: Record<string, unknown>,
  tdfId: unknown,
): void {
  const units = content?.tdfs?.tutor?.unit;
  // Condition roots resolve their actual TDF before restoring units.
  if (!Array.isArray(units)) return;
  const artifact = state.adaptiveUnitSequence as AdaptiveUnitSequence | undefined;
  if (artifact != null) {
    if (artifact.version !== 1 || artifact.tdfId !== tdfId || !Array.isArray(artifact.units)
      || !artifact.units.length || artifact.units.some(unit => !unit || typeof unit !== 'object' || Array.isArray(unit))) {
      throw new Error('Saved adaptive unit sequence is invalid or belongs to another lesson');
    }
    content.tdfs.tutor.unit = structuredClone(artifact.units);
    return;
  }
  const cursor = Number(state.currentUnitNumber ?? 0);
  if (units.some((unit, index) => index < cursor && unit.adaptive)) {
    throw new Error('This attempt has no saved adaptive unit sequence. An administrator must review the attempt before it can resume.');
  }
}
