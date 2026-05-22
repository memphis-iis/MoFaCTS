export interface ProbabilityCandidate {
  readonly id: string;
  readonly probabilityEstimate: number;
  readonly hidden?: boolean;
}

export interface ProbabilityPolicyResult {
  readonly id: string;
  readonly probabilityEstimate: number;
}

export function selectClosestProbabilityCandidate(
  candidates: ProbabilityCandidate[],
  targetProbability: number,
): ProbabilityPolicyResult {
  const visibleCandidates = candidates.filter((candidate) => !candidate.hidden);
  if (!visibleCandidates.length) {
    throw new Error('Model policy requires at least one visible candidate');
  }

  let best = visibleCandidates[0]!;
  let bestDistance = Math.abs(best.probabilityEstimate - targetProbability);

  for (const candidate of visibleCandidates.slice(1)) {
    const distance = Math.abs(candidate.probabilityEstimate - targetProbability);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return {
    id: best.id,
    probabilityEstimate: best.probabilityEstimate,
  };
}
