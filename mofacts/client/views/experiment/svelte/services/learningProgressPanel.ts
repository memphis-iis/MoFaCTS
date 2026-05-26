export type LearningProgressBand = 'at-or-above-threshold' | 'below-threshold';

export type LearningProgressPanelRow = {
  id: string;
  index: number;
  probability: number;
  percent: number;
  band: LearningProgressBand;
  introduced: boolean;
  current: boolean;
};

export type LearningProgressPanelStats = {
  totalItems: number;
  atOrAboveThreshold: number;
  belowThreshold: number;
  introducedItems: number;
  unintroducedItems: number;
};

export type LearningProgressPanelSnapshot = {
  available: boolean;
  reason?: string;
  threshold: number;
  thresholdPercent: number;
  meanProbability: number;
  meanPercent: number;
  stats: LearningProgressPanelStats;
  rows: LearningProgressPanelRow[];
};

type ProgressEngineLike = {
  unitType?: unknown;
  currentCardRef?: {
    clusterIndex?: unknown;
    stimIndex?: unknown;
  } | null;
  getCardProbabilitiesNoCalc?: () => unknown;
};

type CardProbabilitiesLike = {
  cards?: unknown;
};

type ProgressCardLike = {
  canUse?: unknown;
  hasBeenIntroduced?: unknown;
  stims?: unknown;
};

type ProgressStimLike = {
  canUse?: unknown;
  probabilityEstimate?: unknown;
  stimulusKC?: unknown;
  hasBeenIntroduced?: unknown;
  timesSeen?: unknown;
  priorCorrect?: unknown;
  priorIncorrect?: unknown;
};

type SnapshotOptions = {
  hiddenItems?: unknown[];
};

const DEFAULT_THRESHOLD = 0.8;

function makeStats(rows: LearningProgressPanelRow[], threshold: number): LearningProgressPanelStats {
  const atOrAboveThreshold = rows.filter((row) => row.probability >= threshold).length;
  const introducedItems = rows.filter((row) => row.introduced).length;
  return {
    totalItems: rows.length,
    atOrAboveThreshold,
    belowThreshold: rows.length - atOrAboveThreshold,
    introducedItems,
    unintroducedItems: rows.length - introducedItems,
  };
}

function unavailableSnapshot(reason: string, threshold: number): LearningProgressPanelSnapshot {
  return {
    available: false,
    reason,
    threshold,
    thresholdPercent: Math.round(threshold * 1000) / 10,
    meanProbability: 0,
    meanPercent: 0,
    stats: makeStats([], threshold),
    rows: [],
  };
}

function resolveThreshold(settings: Record<string, unknown> | null | undefined): number {
  const parsed = Number(settings?.optimalThreshold);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_THRESHOLD;
  }
  if (parsed <= 0 || parsed >= 1) {
    return DEFAULT_THRESHOLD;
  }
  return parsed;
}

function asEngine(value: unknown): ProgressEngineLike | null {
  return value && typeof value === 'object' ? value as ProgressEngineLike : null;
}

function asCardProbabilities(value: unknown): CardProbabilitiesLike | null {
  return value && typeof value === 'object' ? value as CardProbabilitiesLike : null;
}

function asCard(value: unknown): ProgressCardLike | null {
  return value && typeof value === 'object' ? value as ProgressCardLike : null;
}

function asStim(value: unknown): ProgressStimLike | null {
  return value && typeof value === 'object' ? value as ProgressStimLike : null;
}

function isHiddenStim(stim: ProgressStimLike, hiddenKeys: Set<string>): boolean {
  if (stim.stimulusKC === undefined || stim.stimulusKC === null) {
    return false;
  }
  return hiddenKeys.has(String(stim.stimulusKC));
}

function isIntroduced(card: ProgressCardLike, stim: ProgressStimLike): boolean {
  if (stim.hasBeenIntroduced === true || card.hasBeenIntroduced === true) {
    return true;
  }
  const timesSeen = Number(stim.timesSeen);
  const priorCorrect = Number(stim.priorCorrect);
  const priorIncorrect = Number(stim.priorIncorrect);
  return [timesSeen, priorCorrect, priorIncorrect].some((value) => Number.isFinite(value) && value > 0);
}

function normalizeProbability(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < 0 || parsed > 1) {
    return null;
  }
  return parsed;
}

function isCurrentRow(engine: ProgressEngineLike, clusterIndex: number, stimIndex: number): boolean {
  const currentClusterIndex = Number(engine.currentCardRef?.clusterIndex);
  const currentStimIndex = Number(engine.currentCardRef?.stimIndex);
  return currentClusterIndex === clusterIndex && currentStimIndex === stimIndex;
}

export function isLearningProgressPanelEngine(
  engine: ProgressEngineLike | null | undefined,
): engine is ProgressEngineLike {
  return engine?.unitType === 'model';
}

export function buildLearningProgressPanelSnapshot(
  engineValue: unknown,
  deliverySettings: Record<string, unknown> | null | undefined,
  options: SnapshotOptions = {},
): LearningProgressPanelSnapshot {
  const threshold = resolveThreshold(deliverySettings);
  const engine = asEngine(engineValue);
  if (!isLearningProgressPanelEngine(engine)) {
    return unavailableSnapshot('Progress is available for adaptive learning sessions only.', threshold);
  }
  if (typeof engine.getCardProbabilitiesNoCalc !== 'function') {
    return unavailableSnapshot('The learning engine has not exposed item progress yet.', threshold);
  }

  const probabilities = asCardProbabilities(engine.getCardProbabilitiesNoCalc());
  const cards = Array.isArray(probabilities?.cards) ? probabilities.cards : null;
  if (!cards) {
    return unavailableSnapshot('Item progress is not ready yet.', threshold);
  }

  const hiddenKeys = new Set((options.hiddenItems || []).map((item) => String(item)));
  const rows: LearningProgressPanelRow[] = [];
  let invalidProbabilityCount = 0;

  for (let clusterIndex = 0; clusterIndex < cards.length; clusterIndex += 1) {
    const card = asCard(cards[clusterIndex]);
    if (!card || card.canUse === false || !Array.isArray(card.stims)) {
      continue;
    }

    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex += 1) {
      const stim = asStim(card.stims[stimIndex]);
      if (!stim || stim.canUse === false || isHiddenStim(stim, hiddenKeys)) {
        continue;
      }

      const probability = normalizeProbability(stim.probabilityEstimate);
      if (probability === null) {
        invalidProbabilityCount += 1;
        continue;
      }

      rows.push({
        id: `${clusterIndex}:${stimIndex}`,
        index: rows.length + 1,
        probability,
        percent: Math.round(probability * 1000) / 10,
        band: probability >= threshold ? 'at-or-above-threshold' : 'below-threshold',
        introduced: isIntroduced(card, stim),
        current: isCurrentRow(engine, clusterIndex, stimIndex),
      });
    }
  }

  if (rows.length === 0 && invalidProbabilityCount > 0) {
    return unavailableSnapshot('Item probability estimates are not ready yet.', threshold);
  }
  if (rows.length === 0) {
    return unavailableSnapshot('No visible learning items are available for progress display.', threshold);
  }

  const meanProbability = rows.reduce((sum, row) => sum + row.probability, 0) / rows.length;
  return {
    available: true,
    threshold,
    thresholdPercent: Math.round(threshold * 1000) / 10,
    meanProbability,
    meanPercent: Math.round(meanProbability * 1000) / 10,
    stats: makeStats(rows, threshold),
    rows,
  };
}
