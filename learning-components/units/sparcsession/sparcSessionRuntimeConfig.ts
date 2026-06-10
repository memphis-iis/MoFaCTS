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