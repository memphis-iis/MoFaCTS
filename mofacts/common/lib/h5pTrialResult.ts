import type { H5PTrialResult } from '../types/h5p';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`H5P trial result requires ${fieldName}`);
  }
  return value.trim();
}

function optionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`H5P trial result ${fieldName} must be finite`);
  }
  return value;
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`H5P trial result ${fieldName} must be boolean`);
  }
  return value;
}

function normalizeEvents(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error('H5P trial result requires events array');
  }
  return value.map((event, index) => {
    if (!isPlainObject(event)) {
      throw new Error(`H5P trial result event at index ${index} must be an object`);
    }
    return { ...event };
  });
}

export function normalizeH5PTrialResult(
  value: unknown,
  expectedContentId?: string
): H5PTrialResult {
  if (!isPlainObject(value)) {
    throw new Error('H5P trial result must be an object');
  }

  const contentId = requireNonEmptyString(value.contentId, 'contentId');
  const expected = typeof expectedContentId === 'string' ? expectedContentId.trim() : '';
  if (expected && contentId !== expected) {
    throw new Error('H5P trial result contentId does not match current display');
  }

  const batchId = requireNonEmptyString(value.batchId, 'batchId');
  if (typeof value.completed !== 'boolean') {
    throw new Error('H5P trial result completed must be boolean');
  }

  const normalized: H5PTrialResult = {
    contentId,
    batchId,
    completed: value.completed,
    events: normalizeEvents(value.events),
  };

  if (typeof value.library === 'string' && value.library.trim()) {
    normalized.library = value.library.trim();
  }
  if (typeof value.widgetType === 'string' && value.widgetType.trim()) {
    normalized.widgetType = value.widgetType.trim();
  }

  const passed = optionalBoolean(value.passed, 'passed');
  if (passed !== undefined) {
    normalized.passed = passed;
  }

  const score = optionalFiniteNumber(value.score, 'score');
  if (score !== undefined) {
    normalized.score = score;
  }

  const maxScore = optionalFiniteNumber(value.maxScore, 'maxScore');
  if (maxScore !== undefined) {
    normalized.maxScore = maxScore;
  }

  const scaledScore = optionalFiniteNumber(value.scaledScore, 'scaledScore');
  if (scaledScore !== undefined) {
    normalized.scaledScore = scaledScore;
  }

  if ('responseSummary' in value) {
    normalized.responseSummary = value.responseSummary;
  }

  return normalized;
}
