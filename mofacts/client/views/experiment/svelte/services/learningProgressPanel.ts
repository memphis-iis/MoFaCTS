import type {
  ModelProgressItem,
  ModelProgressProvider,
} from '../../../../../../learning-components/runtime/modelProgressProvider';
import type {
  CurrentCardRefLike,
} from '../../../../../../learning-components/models/adaptive-logistic/modelProgressProvider';
import {
  buildAdaptiveLogisticModelProgressItems,
} from '../../../../../../learning-components/models/adaptive-logistic/modelProgressProvider';

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
  getModelProgressItems?: ModelProgressProvider['getModelProgressItems'];
  getCardProbabilitiesNoCalc?: () => unknown;
  currentCardRef?: CurrentCardRefLike;
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

function isHiddenModelProgressItem(item: ModelProgressItem, hiddenKeys: Set<string>): boolean {
  if (item.stimulusKC === undefined || item.stimulusKC === null) {
    return false;
  }
  return hiddenKeys.has(String(item.stimulusKC));
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

export function isLearningProgressPanelEngine(
  engine: ProgressEngineLike | null | undefined,
): engine is ProgressEngineLike {
  return typeof engine?.getModelProgressItems === 'function'
    || typeof engine?.getCardProbabilitiesNoCalc === 'function';
}

function getModelProgressItemsForEngine(engine: ProgressEngineLike): readonly ModelProgressItem[] {
  if (typeof engine.getModelProgressItems === 'function') {
    return engine.getModelProgressItems();
  }
  if (typeof engine.getCardProbabilitiesNoCalc === 'function') {
    return buildAdaptiveLogisticModelProgressItems({
      cardProbabilities: engine.getCardProbabilitiesNoCalc(),
      currentCardRef: engine.currentCardRef,
    });
  }
  throw new Error('Progress requires a model-progress provider.');
}

export function buildLearningProgressPanelSnapshot(
  engineValue: unknown,
  deliverySettings: Record<string, unknown> | null | undefined,
  options: SnapshotOptions = {},
): LearningProgressPanelSnapshot {
  const threshold = resolveThreshold(deliverySettings);
  const engine = asEngine(engineValue);
  if (!isLearningProgressPanelEngine(engine)) {
    return unavailableSnapshot('Progress requires a model-progress provider.', threshold);
  }
  const hiddenKeys = new Set((options.hiddenItems || []).map((item) => String(item)));
  const rows: LearningProgressPanelRow[] = [];
  let invalidProbabilityCount = 0;
  let items: readonly ModelProgressItem[];

  try {
    items = getModelProgressItemsForEngine(engine);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Model progress provider failed.';
    return unavailableSnapshot(message, threshold);
  }

  if (!Array.isArray(items)) {
    return unavailableSnapshot('Model progress provider returned malformed progress items.', threshold);
  }

  for (const item of items) {
    if (item.canUse === false || isHiddenModelProgressItem(item, hiddenKeys)) {
      continue;
    }

    const probability = normalizeProbability(item.probability);
    if (probability === null) {
      invalidProbabilityCount += 1;
      continue;
    }

    rows.push({
      id: item.id,
      index: rows.length + 1,
      probability,
      percent: Math.round(probability * 1000) / 10,
      band: probability >= threshold ? 'at-or-above-threshold' : 'below-threshold',
      introduced: item.introduced,
      current: item.current,
    });
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
