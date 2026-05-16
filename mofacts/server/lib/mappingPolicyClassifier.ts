export function hasMeaningfulProgressSignal(experimentState: any): boolean {
  if (!experimentState || typeof experimentState !== 'object') {
    return false;
  }

  if (Array.isArray(experimentState.overallOutcomeHistory) && experimentState.overallOutcomeHistory.length > 0) {
    return true;
  }
  if (Array.isArray(experimentState.overallStudyHistory) && experimentState.overallStudyHistory.length > 0) {
    return true;
  }
  if (typeof experimentState.questionIndex === 'number' && experimentState.questionIndex > 0) {
    return true;
  }
  if (typeof experimentState.clusterIndex === 'number' && experimentState.clusterIndex >= 0) {
    return true;
  }
  if (typeof experimentState.shufIndex === 'number' && experimentState.shufIndex >= 0) {
    return true;
  }
  if (experimentState.schedule && typeof experimentState.schedule === 'object') {
    return true;
  }
  if (typeof experimentState.scheduleUnitNumber === 'number' && experimentState.scheduleUnitNumber >= 0) {
    return true;
  }

  return false;
}
