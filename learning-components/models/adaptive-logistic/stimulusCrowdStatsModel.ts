import { createStimulusKey, type StimulusItemIdentity } from '../../runtime/historyStimulusIdentity';

export type StimulusCrowdStat = {
  readonly stimuliSetId: string | number;
  readonly stimulusKC: string | number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly totalCount: number;
};

type StimLike = {
  stimuliSetId?: unknown;
  stimulusKC?: unknown;
  crowdStimSuccessCount?: number;
  crowdStimFailureCount?: number;
  crowdStimTotalTests?: number;
};

function normalizeCount(value: unknown, fieldName: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Stimulus crowd stats row has invalid ${fieldName}`);
  }
  return numeric;
}

function requireIdentityValue(value: unknown, fieldName: string): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`Stimulus crowd stats require non-blank ${fieldName}`);
}

export function collectStimulusIdentitiesForCrowdStats(stimClusters: any[]): StimulusItemIdentity[] {
  const seen = new Set<string>();
  const values: StimulusItemIdentity[] = [];
  for (const cluster of stimClusters) {
    const stims = Array.isArray(cluster?.stims) ? cluster.stims : [];
    for (const stim of stims) {
      const stimulusKC = requireIdentityValue((stim as StimLike).stimulusKC, 'stimulusKC');
      const stimuliSetId = requireIdentityValue((stim as StimLike).stimuliSetId, 'stimuliSetId');
      const key = createStimulusKey({ stimuliSetId, stimulusKC });
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push({ stimuliSetId, stimulusKC });
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
    const key = createStimulusKey(stat);
    statsByStimulusKC.set(key, {
      stimulusKC: stat.stimulusKC,
      stimuliSetId: stat.stimuliSetId,
      correctCount: normalizeCount(stat.correctCount, 'correctCount'),
      incorrectCount: normalizeCount(stat.incorrectCount, 'incorrectCount'),
      totalCount: normalizeCount(stat.totalCount, 'totalCount'),
    });
  }

  for (const card of params.cards) {
    const stims = Array.isArray(card?.stims) ? card.stims : [];
    for (const stim of stims as StimLike[]) {
      const stat = statsByStimulusKC.get(createStimulusKey({
        stimuliSetId: requireIdentityValue(stim.stimuliSetId, 'stimuliSetId'),
        stimulusKC: requireIdentityValue(stim.stimulusKC, 'stimulusKC'),
      }));
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
