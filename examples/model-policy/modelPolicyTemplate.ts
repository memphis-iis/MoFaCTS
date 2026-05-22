export interface CandidateCard {
  readonly id: string;
  readonly probabilityCorrect: number;
  readonly hidden: boolean;
}

export interface ModelPolicy {
  readonly name: string;
  selectNext(candidates: readonly CandidateCard[]): CandidateCard;
}

export function createClosestToTargetPolicy(targetProbability: number): ModelPolicy {
  if (!Number.isFinite(targetProbability) || targetProbability < 0 || targetProbability > 1) {
    throw new Error("targetProbability must be a finite number between 0 and 1.");
  }

  return {
    name: "closest-to-target",

    selectNext(candidates) {
      const visible = candidates.filter((candidate) => !candidate.hidden);
      if (visible.length === 0) {
        throw new Error("Cannot select from an empty visible candidate set.");
      }

      return visible.reduce((best, candidate) => {
        const bestDistance = Math.abs(best.probabilityCorrect - targetProbability);
        const candidateDistance = Math.abs(candidate.probabilityCorrect - targetProbability);
        return candidateDistance < bestDistance ? candidate : best;
      });
    },
  };
}
