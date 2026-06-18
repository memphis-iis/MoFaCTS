type SparcSessionConfigUnit = {
  sparcsession?: Record<string, unknown> | null;
};

export type SparcSessionModelConfigurationValidationIssue = {
  readonly kind:
    | 'missing-sparcsession-model-config'
    | 'missing-sparcsession-clusterlist'
    | 'missing-sparcsession-calculateProbability';
  readonly message: string;
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

export function validateSparcSessionModelConfiguration(
  unit: SparcSessionConfigUnit | null | undefined,
): readonly SparcSessionModelConfigurationValidationIssue[] {
  const config = resolveSparcSessionRuntimeConfig(unit);
  if (!config) {
    return [{
      kind: 'missing-sparcsession-model-config',
      message: 'SPARC model-backed features require unit-level sparcsession model configuration',
    }];
  }

  const issues: SparcSessionModelConfigurationValidationIssue[] = [];
  const clusterlist = resolveSparcSessionClusterListSource(unit);
  const hasClusterList = Array.isArray(clusterlist)
    ? clusterlist.length > 0
    : !(clusterlist === undefined || clusterlist === null || clusterlist === '');
  if (!hasClusterList) {
    issues.push({
      kind: 'missing-sparcsession-clusterlist',
      message: 'SPARC model-backed features require unit-level sparcsession.clusterlist',
    });
  }
  if (!resolveSparcSessionProbabilitySource(unit)) {
    issues.push({
      kind: 'missing-sparcsession-calculateProbability',
      message: 'SPARC model-backed features require unit-level sparcsession.calculateProbability',
    });
  }
  return issues;
}
