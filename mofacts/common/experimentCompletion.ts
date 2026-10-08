export function normalizeSavedUnitNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

/** Shared by learner resume and server finalization. Missing progress is never completion. */
export function savedLessonCompleted(state: Record<string, unknown>, unitCount: number): boolean {
  const last = normalizeSavedUnitNumber(state.lastUnitCompleted);
  const cursor = normalizeSavedUnitNumber(state.currentUnitNumber);
  return Number.isFinite(unitCount) && unitCount > 0 && last === unitCount - 1
    && (cursor === null || (cursor >= 0 && cursor <= unitCount));
}
