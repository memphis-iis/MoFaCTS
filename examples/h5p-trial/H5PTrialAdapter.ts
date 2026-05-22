export interface H5PScoreEvent {
  readonly maxScore: number;
  readonly rawScore: number;
  readonly response?: unknown;
}

export interface H5PTrialResult {
  readonly correct: boolean;
  readonly scoreRatio: number;
  readonly response: unknown;
}

export function adaptH5PScoreEvent(event: H5PScoreEvent): H5PTrialResult {
  if (!Number.isFinite(event.maxScore) || event.maxScore <= 0) {
    throw new Error(`H5P score event requires a positive maxScore; received ${String(event.maxScore)}`);
  }
  if (!Number.isFinite(event.rawScore) || event.rawScore < 0) {
    throw new Error(`H5P score event requires a non-negative rawScore; received ${String(event.rawScore)}`);
  }

  const scoreRatio = Math.min(event.rawScore / event.maxScore, 1);

  return {
    correct: scoreRatio >= 1,
    scoreRatio,
    response: event.response ?? null,
  };
}
