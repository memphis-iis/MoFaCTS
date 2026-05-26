type LearningSessionConfigUnit = {
  assessmentsession?: Record<string, unknown> | null;
  learningsession?: Record<string, unknown> | null;
  videosession?: Record<string, unknown> | null;
};

export function resolveLearningSessionRuntimeConfig(
  unit: LearningSessionConfigUnit | null | undefined,
): Record<string, unknown> | null {
  if (unit?.learningsession) {
    return unit.learningsession;
  }
  if (unit?.videosession) {
    return unit.videosession;
  }
  return null;
}

export function resolveLearningSessionUnitMode(
  unit: LearningSessionConfigUnit | null | undefined,
): string {
  const unitMode = resolveLearningSessionRuntimeConfig(unit)?.unitMode;
  return typeof unitMode === 'string' && unitMode.trim()
    ? unitMode.trim()
    : 'default';
}

export function resolveLearningSessionProbabilitySource(
  unit: LearningSessionConfigUnit | null | undefined,
): string | undefined {
  const calculateProbability = resolveLearningSessionRuntimeConfig(unit)?.calculateProbability;
  if (typeof calculateProbability !== 'string') {
    return undefined;
  }

  const trimmed = calculateProbability.trim();
  return trimmed || undefined;
}

export function resolveLearningSessionClusterListSource(
  unit: LearningSessionConfigUnit | null | undefined,
  activeVideoSession: boolean,
): unknown {
  if (activeVideoSession) {
    return unit?.videosession?.questions;
  }

  const clusterlist = unit?.learningsession?.clusterlist;
  return typeof clusterlist === 'string'
    ? clusterlist.trim()
    : clusterlist;
}

export function resolveLearningSessionModelPreparationClusterListSource(
  unit: LearningSessionConfigUnit | null | undefined,
): unknown {
  const assessmentClusterList = unit?.assessmentsession?.clusterlist;
  if (assessmentClusterList) {
    return assessmentClusterList;
  }

  return unit?.learningsession?.clusterlist;
}
