export type StimulusCrowdStat = {
  readonly stimulusKC: string | number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly totalCount: number;
};

type StimLike = {
  stimulusKC?: unknown;
  crowdStimSuccessCount?: number;
  crowdStimFailureCount?: number;
  crowdStimTotalTests?: number;
};

function normalizeIdentity(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error('Stimulus crowd stats require non-blank stimulusKC');
}

function normalizeCount(value: unknown, fieldName: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Stimulus crowd stats row has invalid ${fieldName}`);
  }
  return numeric;
}

export function collectStimulusKCsForCrowdStats(stimClusters: any[]): Array<string | number> {
  const seen = new Set<string>();
  const values: Array<string | number> = [];
  for (const cluster of stimClusters) {
    const stims = Array.isArray(cluster?.stims) ? cluster.stims : [];
    for (const stim of stims) {
      const stimulusKC = (stim as StimLike).stimulusKC;
      const key = normalizeIdentity(stimulusKC);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push(stimulusKC as string | number);
    }
  }
  return values;
}

export function applyStimulusCrowdStatsToCards(params: {
  readonly cards: any[];
  readonly crowdStats: StimulusCrowdStat[];
}): void {
  const statsByStimulusKC = new Map<string, StimulusCrowdStat>();
  for (const stat of params.crowdStats) {
    const key = normalizeIdentity(stat.stimulusKC);
    statsByStimulusKC.set(key, {
      stimulusKC: stat.stimulusKC,
      correctCount: normalizeCount(stat.correctCount, 'correctCount'),
      incorrectCount: normalizeCount(stat.incorrectCount, 'incorrectCount'),
      totalCount: normalizeCount(stat.totalCount, 'totalCount'),
    });
  }

  for (const card of params.cards) {
    const stims = Array.isArray(card?.stims) ? card.stims : [];
    for (const stim of stims as StimLike[]) {
      const stat = statsByStimulusKC.get(normalizeIdentity(stim.stimulusKC));
      const correctCount = stat?.correctCount || 0;
      const incorrectCount = stat?.incorrectCount || 0;
      const totalCount = stat?.totalCount || 0;
      if (totalCount !== correctCount + incorrectCount) {
        throw new Error('Stimulus crowd stats totalCount must equal correctCount + incorrectCount');
      }
      stim.crowdStimSuccessCount = correctCount;
      stim.crowdStimFailureCount = incorrectCount;
      stim.crowdStimTotalTests = totalCount;
    }
  }
}
