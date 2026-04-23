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
