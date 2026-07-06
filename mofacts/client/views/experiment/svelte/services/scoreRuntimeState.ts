import { ReactiveDict } from 'meteor/reactive-dict';

const scoreRuntimeState = new ReactiveDict('scoreRuntimeState');

const ScoreRuntimeKeys = Object.freeze({
  CURRENT_SCORE: 'currentScore',
  SCORING_ENABLED: 'scoringEnabled',
});

const SCORE_RUNTIME_DEFAULTS = Object.freeze({
  [ScoreRuntimeKeys.CURRENT_SCORE]: 0,
  [ScoreRuntimeKeys.SCORING_ENABLED]: undefined,
});

export function resetScoreRuntimeState(): void {
  Object.entries(SCORE_RUNTIME_DEFAULTS).forEach(([key, value]) => {
    scoreRuntimeState.set(key, value);
  });
}

export function getCurrentScore(): number {
  return (scoreRuntimeState.get(ScoreRuntimeKeys.CURRENT_SCORE) as number | undefined) || 0;
}

export function setCurrentScore(value: number): void {
  scoreRuntimeState.set(ScoreRuntimeKeys.CURRENT_SCORE, value);
}

export function getScoringEnabled(): boolean | undefined {
  return scoreRuntimeState.get(ScoreRuntimeKeys.SCORING_ENABLED) as boolean | undefined;
}

export function setScoringEnabled(value: boolean | undefined): void {
  scoreRuntimeState.set(ScoreRuntimeKeys.SCORING_ENABLED, value);
}

resetScoreRuntimeState();
