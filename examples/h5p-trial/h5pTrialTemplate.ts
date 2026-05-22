export interface H5PScoreEvent {
  readonly score: number;
  readonly maxScore: number;
  readonly response: string;
  readonly durationMs: number;
}

export interface TrialResult {
  readonly response: string;
  readonly wasCorrect: boolean;
  readonly practiceTimeMs: number;
}

export function convertH5PScoreEvent(event: H5PScoreEvent): TrialResult {
  if (!Number.isFinite(event.maxScore) || event.maxScore <= 0) {
    throw new Error("H5P score event must include a positive maxScore.");
  }

  if (!Number.isFinite(event.score) || event.score < 0) {
    throw new Error("H5P score event must include a non-negative score.");
  }

  return {
    response: event.response,
    wasCorrect: event.score >= event.maxScore,
    practiceTimeMs: event.durationMs,
  };
}
