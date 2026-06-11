type SparcSessionConfigUnit = {
  sparcsession?: Record<string, unknown> | null;
};

export function resolveSparcSessionRuntimeConfig(
  unit: SparcSessionConfigUnit | null | undefined,
): Record<string, unknown> | null {
  if (unit?.sparcsession) {
    return unit.sparcsession;
  }
  return null;
}

export function resolveSparcSessionClusterListSource(
  unit: SparcSessionConfigUnit | null | undefined,
): unknown {
  const clusterlist = resolveSparcSessionRuntimeConfig(unit)?.clusterlist;
  return typeof clusterlist === 'string'
    ? clusterlist.trim()
    : clusterlist;
}

export function resolveSparcSessionUnitMode(
  unit: SparcSessionConfigUnit | null | undefined,
): string {
  const unitMode = resolveSparcSessionRuntimeConfig(unit)?.unitMode;
  return typeof unitMode === 'string' && unitMode.trim()
    ? unitMode.trim()
    : 'default';
}

export function resolveSparcSessionProbabilitySource(
  unit: SparcSessionConfigUnit | null | undefined,
): string | undefined {
  const calculateProbability = resolveSparcSessionRuntimeConfig(unit)?.calculateProbability;
  if (typeof calculateProbability !== 'string') {
    return undefined;
  }

  const trimmed = calculateProbability.trim();
  return trimmed || undefined;
}

export function resolveSparcSessionModelPreparationClusterListSource(
  unit: SparcSessionConfigUnit | null | undefined,
): unknown {
  return resolveSparcSessionClusterListSource(unit);
}
