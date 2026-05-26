type LearningSessionConfigUnit = {
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
