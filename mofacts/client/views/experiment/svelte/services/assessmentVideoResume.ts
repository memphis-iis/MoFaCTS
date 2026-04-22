function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasScheduleArtifactForUnit(
  experimentState: Record<string, unknown> | null | undefined,
  unitNumber: number
): boolean {
  return !!experimentState?.schedule && toNonNegativeInteger(experimentState?.scheduleUnitNumber) === toNonNegativeInteger(unitNumber);
}

export function assertAssessmentScheduleArtifactForUnit(
  experimentState: Record<string, unknown> | null | undefined,
  unitNumber: number
): void {
  if (!hasScheduleArtifactForUnit(experimentState, unitNumber)) {
    throw new Error(
      `Assessment resume requires a persisted schedule artifact for unit ${toNonNegativeInteger(unitNumber)}`
    );
  }
}

export function deriveAssessmentQuestionIndex(
  completedTrialCount: unknown
): number {
  return toNonNegativeInteger(completedTrialCount);
}

export function deriveAssessmentScheduleCursor(
  completedTrialCount: unknown
): number {
  return deriveAssessmentQuestionIndex(completedTrialCount);
}

export function assertAssessmentScheduleBounds(
  scheduleLength: unknown,
  completedTrialCount: unknown
): void {
  const length = toNonNegativeInteger(scheduleLength);
  const questionIndex = deriveAssessmentQuestionIndex(completedTrialCount);

  if (questionIndex > length) {
    throw new Error(
      `Assessment resume history exceeds schedule bounds (completed=${questionIndex}, scheduleLength=${length})`
    );
  }

  if (questionIndex < 0 || questionIndex > length) {
    throw new Error(
      `Assessment resume next-card pointer is out of bounds (questionIndex=${questionIndex}, scheduleLength=${length})`
    );
  }
}

type VideoResumeAnchor = {
  resumeStartTime: number;
  resumeCheckpointIndex: number;
};

export function resolveVideoResumeAnchor(
  checkpointTimes: unknown,
  completedCheckpointQuestionCount: unknown
): VideoResumeAnchor | null {
  if (!Array.isArray(checkpointTimes) || checkpointTimes.length === 0) {
    return null;
  }

  const completedCount = toNonNegativeInteger(completedCheckpointQuestionCount);
  if (completedCount <= 0) {
    return null;
  }

  if (completedCount > checkpointTimes.length) {
    throw new Error(
      `Video resume history exceeds checkpoint bounds (completed=${completedCount}, checkpoints=${checkpointTimes.length})`
    );
  }

  const checkpointIndex = completedCount;
  const checkpointTime = toFiniteNumber(checkpointTimes[completedCount - 1]);
  if (checkpointTime === null) {
    throw new Error(`Video checkpoint time is invalid at index ${completedCount - 1}`);
  }

  return {
    resumeStartTime: checkpointTime,
    resumeCheckpointIndex: checkpointIndex,
  };
}
