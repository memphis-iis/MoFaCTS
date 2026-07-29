export const TDF_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const SERVER_TDF_ID_PATTERN = /^tdf_[a-f0-9]{24}$/;

export type ConditionFamilyValidation = {
  isConditionRoot: boolean;
  conditionFileNames: string[];
  conditionTdfIds: string[];
  errors: string[];
};

export function normalizeTdfIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim() || !TDF_ID_PATTERN.test(value)) {
    return null;
  }
  return value;
}

export function validateConditionFamilyTutor(
  tutor: unknown,
  options: { requireCanonicalIds?: boolean } = {},
): ConditionFamilyValidation {
  const tutorRecord = tutor && typeof tutor === 'object' ? tutor as Record<string, any> : {};
  const setspec = tutorRecord.setspec && typeof tutorRecord.setspec === 'object'
    ? tutorRecord.setspec as Record<string, unknown>
    : {};
  const rawConditions = setspec.condition;
  const rawIds = setspec.conditionTdfIds;
  const errors: string[] = [];
  const isConditionRoot = Array.isArray(rawConditions) && rawConditions.length > 0;

  if (!isConditionRoot) {
    if (rawIds !== undefined && (!Array.isArray(rawIds) || rawIds.length > 0)) {
      errors.push('conditionTdfIds is only valid for a condition root.');
    }
    const units = tutorRecord.unit;
    if (!Array.isArray(units) || units.length === 0) {
      errors.push('A runnable TDF must contain at least one tutor.unit entry.');
    }
    return { isConditionRoot: false, conditionFileNames: [], conditionTdfIds: [], errors };
  }

  if (Object.prototype.hasOwnProperty.call(tutorRecord, 'unit')) {
    errors.push('A condition root must not contain tutor.unit.');
  }

  const conditionFileNames = (rawConditions as unknown[]).map((value, index) => {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
      errors.push(`condition[${index}] must be a non-empty trimmed filename.`);
      return '';
    }
    return value;
  });
  if (new Set(conditionFileNames).size !== conditionFileNames.length) {
    errors.push('Condition filenames must be unique.');
  }

  if (!Array.isArray(rawIds)) {
    if (options.requireCanonicalIds) errors.push('conditionTdfIds is required for a condition root.');
    return { isConditionRoot: true, conditionFileNames, conditionTdfIds: [], errors };
  }
  if (rawIds.length !== conditionFileNames.length) {
    errors.push('conditionTdfIds must contain one entry for every condition filename.');
  }
  const conditionTdfIds = rawIds.map((value, index) => {
    const id = normalizeTdfIdentity(value);
    if (!id) {
      errors.push(`conditionTdfIds[${index}] must be a valid canonical TDF id.`);
      return '';
    }
    return id;
  });
  if (new Set(conditionTdfIds).size !== conditionTdfIds.length) {
    errors.push('Condition TDF ids must be unique.');
  }
  return { isConditionRoot: true, conditionFileNames, conditionTdfIds, errors };
}

export function assertConditionFilenameIdAlignment(
  conditionFileNames: string[],
  conditionTdfIds: string[],
  childFileNameById: Map<string, string>,
): string[] {
  const errors: string[] = [];
  for (let index = 0; index < conditionFileNames.length; index += 1) {
    const id = conditionTdfIds[index];
    const expectedFileName = conditionFileNames[index];
    if (!id || childFileNameById.get(id) !== expectedFileName) {
      errors.push(`Condition ${expectedFileName || index + 1} does not match its canonical TDF id.`);
    }
  }
  return errors;
}

export function reconcileConditionCountsByChildId(
  previousConditionTdfIds: unknown,
  previousConditionCounts: unknown,
  nextConditionTdfIds: readonly string[],
): number[] {
  const previousIds = Array.isArray(previousConditionTdfIds) ? previousConditionTdfIds : [];
  const previousCounts = Array.isArray(previousConditionCounts) ? previousConditionCounts : [];
  const countById = new Map<string, number>();
  previousIds.forEach((rawId, index) => {
    const id = normalizeTdfIdentity(rawId);
    const count = previousCounts[index];
    if (id && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      countById.set(id, count);
    }
  });
  return nextConditionTdfIds.map((id) => countById.get(id) ?? 0);
}
