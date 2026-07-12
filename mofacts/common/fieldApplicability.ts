export type TdfUnitType = 'learning' | 'assessment' | 'video' | 'instructions' | 'autotutor' | 'sparc';

export const INTERACTIVE_TDF_UNIT_TYPES: readonly TdfUnitType[] = Object.freeze([
  'learning',
  'assessment',
  'video',
  'autotutor',
  'sparc',
]);

export function detectTdfUnitType(unit: unknown): TdfUnitType | null {
  if (!unit || typeof unit !== 'object') {
    return null;
  }
  const record = unit as Record<string, unknown>;
  if (record.videosession && typeof record.videosession === 'object') {
    return 'video';
  }
  if (record.autotutorsession && typeof record.autotutorsession === 'object') {
    return 'autotutor';
  }
  if (record.assessmentsession && typeof record.assessmentsession === 'object') {
    return 'assessment';
  }
  if (record.learningsession && typeof record.learningsession === 'object') {
    return 'learning';
  }
  if (record.sparcsession && typeof record.sparcsession === 'object') {
    return 'sparc';
  }
  if (record.unitinstructions) {
    return 'instructions';
  }
  return null;
}

export function unitTypeApplies(
  applicableUnitTypes: readonly TdfUnitType[] | undefined,
  unitType: TdfUnitType | null
): boolean {
  if (!applicableUnitTypes || applicableUnitTypes.length === 0) {
    return true;
  }
  return unitType !== null && applicableUnitTypes.includes(unitType);
}
