const PROLIFIC_ID_PATTERN = /^[a-f\d]{24}$/i;

export type ProlificExperimentEntry =
  | { mode: 'automatic'; participantId: string }
  | { mode: 'manual'; reason: 'missing' | 'invalid' | 'study-mismatch' };

function queryValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveProlificExperimentEntry(
  experimentTarget: unknown,
  queryParams: Record<string, unknown> | null | undefined
): ProlificExperimentEntry {
  const target = queryValue(experimentTarget);
  const participantId = queryValue(queryParams?.PROLIFIC_PID);
  const studyId = queryValue(queryParams?.STUDY_ID);

  if (!participantId || !studyId) {
    return { mode: 'manual', reason: 'missing' };
  }
  if (
    !PROLIFIC_ID_PATTERN.test(target) ||
    !PROLIFIC_ID_PATTERN.test(participantId) ||
    !PROLIFIC_ID_PATTERN.test(studyId)
  ) {
    return { mode: 'manual', reason: 'invalid' };
  }
  if (target.toLowerCase() !== studyId.toLowerCase()) {
    return { mode: 'manual', reason: 'study-mismatch' };
  }

  return { mode: 'automatic', participantId };
}
