import { isDeepStrictEqual } from 'node:util';
import { assertCanonicalHistoryEnvelope, isAssessmentHistoryCopy } from '../../common/historyEnvelope';
import { reconstructLearningStateFromHistory } from '../../common/lib/historyReconstruction';
import { readSharedModelPracticeEvent } from '../../../learning-components/runtime/modelPracticeHistoryExchange';

type Row = Record<string, unknown>;
const PAIR_FIELDS = ['userId', 'TDFId', 'sessionID', 'levelUnit', 'time', 'problemStartTime'] as const;
const COPY_DIFFERENCES = new Set(['_id', 'eventId', 'recordedServerTime', 'levelUnitType']);

export function assessmentOriginalScope(copy: Row): Row {
  const scope: Row = { levelUnitType: 'schedule' };
  for (const field of PAIR_FIELDS) {
    if (copy[field] === undefined || copy[field] === null || copy[field] === '') {
      throw new Error('Assessment copy lacks a required pairing field');
    }
    scope[field] = copy[field];
  }
  return scope;
}

function authoredPayload(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !COPY_DIFFERENCES.has(key)));
}

export function compareAssessmentCopy(copy: Row, candidates: Row[]): 'matched' | 'missing' | 'conflicting' | 'ambiguous' | 'invalid' {
  let scope: Row;
  try { scope = assessmentOriginalScope(copy); } catch { return 'invalid'; }
  const originals = candidates.filter((row) => Object.entries(scope).every(([key, value]) => isDeepStrictEqual(row[key], value)));
  if (originals.length === 0) return 'missing';
  // Multiple originals must be investigated even when only one payload matches.
  if (originals.length !== 1) return 'ambiguous';
  const original = originals[0]!;
  if (!isDeepStrictEqual(authoredPayload(copy), authoredPayload(original))) return 'conflicting';
  try {
    assertCanonicalHistoryEnvelope(original);
    if (!readSharedModelPracticeEvent(original)) return 'invalid';
    reconstructLearningStateFromHistory([original]);
  } catch { return 'invalid'; }
  return 'matched';
}

/** Read-only adapter contract. Pages use a fixed upper _id and ascending _id order. */
export async function auditAssessmentHistoryCopies(deps: {
  readPage: (afterId: unknown, limit: number) => Promise<Row[]>;
  readOriginals: (scopes: Row[], limit: number) => Promise<Row[]>;
}, options: { maxRecords: number; pageSize?: number }) {
  const pageSize = options.pageSize ?? 100;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000
      || !Number.isSafeInteger(options.maxRecords) || options.maxRecords < 1) {
    throw new Error('Audit limits must be positive integers; page size must not exceed 1000');
  }
  const result = { scanned: 0, copies: 0, matched: 0, missing: 0, conflicting: 0, ambiguous: 0,
    invalid: 0, candidateLimitExceeded: 0, complete: false, passed: false };
  let afterId: unknown;
  while (result.scanned < options.maxRecords) {
    const rows = await deps.readPage(afterId, Math.min(pageSize, options.maxRecords - result.scanned));
    if (rows.length === 0) { result.complete = true; break; }
    const nextId = rows.at(-1)?._id;
    if (nextId === undefined || isDeepStrictEqual(nextId, afterId)) throw new Error('Audit cursor failed to advance');
    afterId = nextId;
    result.scanned += rows.length;
    const copies = rows.filter(isAssessmentHistoryCopy);
    result.copies += copies.length;
    const validCopies: Row[] = [];
    const scopes: Row[] = [];
    for (const copy of copies) {
      try { scopes.push(assessmentOriginalScope(copy)); validCopies.push(copy); }
      catch { result.invalid++; }
    }
    if (scopes.length > 0) {
      const candidateLimit = pageSize * 2;
      const originals = await deps.readOriginals(scopes, candidateLimit + 1);
      if (originals.length > candidateLimit) result.candidateLimitExceeded++;
      else for (const copy of validCopies) result[compareAssessmentCopy(copy, originals)]++;
    }
  }
  if (!result.complete) result.complete = (await deps.readPage(afterId, 1)).length === 0;
  result.passed = result.complete && result.matched === result.copies && result.candidateLimitExceeded === 0;
  return result;
}
