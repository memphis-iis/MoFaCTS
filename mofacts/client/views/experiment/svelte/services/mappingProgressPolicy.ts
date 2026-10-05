// Saved mapping integrity: progressed attempts must never regenerate mappings.
// Conservative by design: ambiguous progress is treated as meaningful progress.

type MappingProgressState = {
  currentUnitNumber?: unknown;
  lastUnitCompleted?: unknown;
  schedule?: unknown;
  scheduleUnitNumber?: unknown;
  questionIndex?: unknown;
  clusterIndex?: unknown;
  shufIndex?: unknown;
  overallOutcomeHistory?: unknown;
  overallStudyHistory?: unknown;
};

export function hasMeaningfulMappingProgress(state: MappingProgressState | null | undefined): boolean {
  if (!state || typeof state !== 'object') {
    return false;
  }

  if (Number(state.currentUnitNumber) > 0
    || (state.lastUnitCompleted != null && Number(state.lastUnitCompleted) >= 0)) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'questionIndex')) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'clusterIndex')) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'shufIndex')) {
    return true;
  }

  if (Array.isArray(state.overallOutcomeHistory) && state.overallOutcomeHistory.length > 0) {
    return true;
  }

  if (Array.isArray(state.overallStudyHistory) && state.overallStudyHistory.length > 0) {
    return true;
  }

  if (state.schedule && typeof state.schedule === 'object') {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'scheduleUnitNumber')) {
    return true;
  }

  return false;
}
