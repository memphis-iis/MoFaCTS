import { parseSparcTeacherPersona } from '../../runtime/sparcPersonas';
import { resolveSparcOrientationMode, type SparcOrientationMode } from '../../runtime/sparcOrientationMode';

type SparcSessionConfigUnit = {
  sparcsession?: Record<string, unknown> | null;
};

export type SparcSessionModelConfigurationValidationIssue = {
  readonly kind:
    | 'missing-sparcsession-model-config'
    | 'invalid-sparcsession-orientation-mode'
    | 'invalid-sparcsession-teacher-persona';
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

export function resolveSparcSessionStartingKC(
  unit: SparcSessionConfigUnit | null | undefined,
): string | undefined {
  const startingKC = resolveSparcSessionRuntimeConfig(unit)?.startingKC;
  if (startingKC === undefined) return undefined;
  if (typeof startingKC !== 'string' || !startingKC.trim()) {
    throw new Error('sparcsession.startingKC must be a nonempty clusterKC identity');
  }
  return startingKC.trim();
}

export function resolveSparcSessionOrientationMode(
  unit: SparcSessionConfigUnit | null | undefined,
): SparcOrientationMode {
  return resolveSparcOrientationMode(resolveSparcSessionRuntimeConfig(unit)?.orientationMode);
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
  try { resolveSparcOrientationMode(config.orientationMode); }
  catch (error) { issues.push({ kind: 'invalid-sparcsession-orientation-mode',
    message: error instanceof Error ? error.message : 'Invalid SPARC orientation mode' }); }
  if (config.teacherPersona !== undefined) {
    try { parseSparcTeacherPersona(config.teacherPersona); }
    catch (error) { issues.push({ kind: 'invalid-sparcsession-teacher-persona',
      message: error instanceof Error ? error.message : 'Invalid SPARC teacher persona' }); }
  }
  return issues;
}
