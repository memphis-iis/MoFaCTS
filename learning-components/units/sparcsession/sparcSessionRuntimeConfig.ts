type SparcSessionConfigUnit = {
  sparcsession?: Record<string, unknown> | null;
};

export type SparcSessionModelConfigurationValidationIssue = {
  readonly kind:
    | 'missing-sparcsession-model-config';
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

export function resolveSparcSessionPageId(
  unit: SparcSessionConfigUnit | null | undefined,
): string | undefined {
  const pageId = resolveSparcSessionRuntimeConfig(unit)?.pageId;
  if (typeof pageId !== 'string') {
    return undefined;
  }
  const trimmed = pageId.trim();
  return trimmed || undefined;
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
  return issues;
}
