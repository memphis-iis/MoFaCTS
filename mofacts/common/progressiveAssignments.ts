import { detectTdfUnitType } from './fieldApplicability';

export const MIN_PROGRESSIVE_MEMBERS = 2;

function nonBlank(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function positiveNumber(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function hasPositiveSetting(source: unknown, key: string): boolean {
  if (Array.isArray(source)) return source.some((entry) => hasPositiveSetting(entry, key));
  if (!source || typeof source !== 'object') return false;
  return positiveNumber((source as Record<string, unknown>)[key]);
}

export function parseProgressiveClusterList(value: unknown): number[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  const result: number[] = [];
  for (const token of value.trim().split(/\s+/)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end < start) return [];
      for (let index = start; index <= end; index += 1) result.push(index);
      continue;
    }
    if (!/^\d+$/.test(token)) return [];
    result.push(Number(token));
  }
  return [...new Set(result)];
}

export function progressiveTdfIneligibilityReasons(tdf: any): string[] {
  const reasons: string[] = [];
  if (tdf?.tdfAvailability === 'repair-required') reasons.push('Lesson identity requires repair.');
  if (tdf?.content?.isMultiTdf) reasons.push('Multi-TDF lessons cannot be progression members.');

  const tutor = tdf?.content?.tdfs?.tutor;
  const conditions = tutor?.setspec?.condition;
  const conditionTdfIds = tutor?.setspec?.conditionTdfIds;
  if (
    (Array.isArray(conditions) ? conditions.length > 0 : nonBlank(conditions))
    || (Array.isArray(conditionTdfIds) ? conditionTdfIds.length > 0 : nonBlank(conditionTdfIds))
  ) {
    reasons.push('Condition-family lessons cannot be progression members.');
  }
  const units = tutor?.unit;
  if (!Array.isArray(units) || units.length !== 2) {
    reasons.push('Lesson must contain exactly two units.');
    return reasons;
  }
  if (detectTdfUnitType(units[0]) !== 'instructions') {
    reasons.push('Unit 1 must be an instruction unit.');
  }
  if (detectTdfUnitType(units[1]) !== 'learning') {
    reasons.push('Unit 2 must be a learning session.');
    return reasons;
  }
  if (!nonBlank(units[1]?.unitname)) {
    reasons.push('Unit 2 requires a unit name for source history identity.');
  }

  const clusterIndexes = parseProgressiveClusterList(units[1]?.learningsession?.clusterlist);
  if (clusterIndexes.length === 0) reasons.push('Unit 2 requires a valid, non-empty clusterlist.');
  if (positiveNumber(units[1]?.learningsession?.maxTrials)) {
    reasons.push('Unit 2 maxTrials must be zero or unset.');
  }
  if (hasPositiveSetting(tutor?.deliverySettings, 'practiceseconds') || hasPositiveSetting(units[1]?.deliverySettings, 'practiceseconds')) {
    reasons.push('Unit 2 practiceseconds must be zero or unset.');
  }

  const clusters = tdf?.rawStimuliFile?.setspec?.clusters;
  if (!Array.isArray(clusters)) {
    reasons.push('Lesson requires canonical raw stimulus clusters.');
    return reasons;
  }
  if (clusterIndexes.some((index) => index < 0 || index >= clusters.length)) {
    reasons.push('Unit 2 clusterlist contains an out-of-range cluster.');
    return reasons;
  }
  for (const clusterIndex of clusterIndexes) {
    const cluster = clusters[clusterIndex];
    if (!nonBlank(cluster?.clusterKC) || !Array.isArray(cluster?.stims) || cluster.stims.length === 0) {
      reasons.push(`Cluster ${clusterIndex} is missing canonical identity or stimuli.`);
      break;
    }
    if (cluster.stims.some((stim: any) => !stim || typeof stim !== 'object')) {
      reasons.push(`Cluster ${clusterIndex} contains an invalid stimulus.`);
      break;
    }
  }
  if (!nonBlank(tdf?.stimuliSetId)) reasons.push('Lesson requires a canonical stimuliSetId.');
  return reasons;
}

export function assignmentMemberTdfIds(assignment: any): string[] {
  if (assignment?.assignmentType === 'lesson') {
    const id = typeof assignment.TDFId === 'string' ? assignment.TDFId.trim() : '';
    return id ? [id] : [];
  }
  if (assignment?.assignmentType === 'progressive' && Array.isArray(assignment.memberTdfIds)) {
    return assignment.memberTdfIds
      .map((id: unknown) => typeof id === 'string' ? id.trim() : '')
      .filter(Boolean);
  }
  return [];
}
