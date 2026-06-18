import type { ModelProgressItem } from '../../runtime/modelProgressProvider';

export type CurrentCardRefLike = {
  readonly clusterIndex?: unknown;
  readonly stimIndex?: unknown;
} | null | undefined;

type CardProbabilitiesLike = {
  readonly cards?: unknown;
};

type ProgressCardLike = {
  readonly canUse?: unknown;
  readonly hasBeenIntroduced?: unknown;
  readonly clusterKC?: unknown;
  readonly stims?: unknown;
};

type ProgressStimLike = {
  readonly canUse?: unknown;
  readonly probabilityEstimate?: unknown;
  readonly stimulusKC?: unknown;
  readonly clusterKC?: unknown;
  readonly hasBeenIntroduced?: unknown;
  readonly timesSeen?: unknown;
  readonly priorCorrect?: unknown;
  readonly priorIncorrect?: unknown;
};

function asCardProbabilities(value: unknown): CardProbabilitiesLike | null {
  return value && typeof value === 'object' ? value as CardProbabilitiesLike : null;
}

function asCard(value: unknown): ProgressCardLike | null {
  return value && typeof value === 'object' ? value as ProgressCardLike : null;
}

function asStim(value: unknown): ProgressStimLike | null {
  return value && typeof value === 'object' ? value as ProgressStimLike : null;
}

function normalizeProbability(value: unknown, id: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid model progress probability for ${id}`);
  }
  return parsed;
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

function isCurrent(currentCardRef: CurrentCardRefLike, clusterIndex: number, stimIndex: number): boolean {
  const currentClusterIndex = Number(currentCardRef?.clusterIndex);
  const currentStimIndex = Number(currentCardRef?.stimIndex);
  return currentClusterIndex === clusterIndex && currentStimIndex === stimIndex;
}

function resolveStableId(clusterIndex: number, stimIndex: number, stim: ProgressStimLike): string {
  if (stim.stimulusKC !== undefined && stim.stimulusKC !== null) {
    return `${clusterIndex}:${stimIndex}:${String(stim.stimulusKC)}`;
  }
  return `${clusterIndex}:${stimIndex}`;
}

function resolveStimulusKC(stim: ProgressStimLike, id: string): string | number {
  if (stim.stimulusKC === undefined || stim.stimulusKC === null) {
    throw new Error(`Model progress item ${id} is missing stimulusKC`);
  }
  if (typeof stim.stimulusKC === 'string' || typeof stim.stimulusKC === 'number') {
    return stim.stimulusKC;
  }
  throw new Error(`Model progress item ${id} has invalid stimulusKC`);
}

function resolveClusterKC(card: ProgressCardLike, stim: ProgressStimLike): string | number | undefined {
  const value = stim.clusterKC ?? card.clusterKC;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new Error('Model progress item has invalid clusterKC');
}

export function buildAdaptiveLogisticModelProgressItems(params: {
  readonly cardProbabilities: unknown;
  readonly currentCardRef?: CurrentCardRefLike;
}): ModelProgressItem[] {
  const probabilities = asCardProbabilities(params.cardProbabilities);
  const cards = Array.isArray(probabilities?.cards) ? probabilities.cards : null;
  if (!cards) {
    throw new Error('Adaptive logistic model progress requires cardProbabilities.cards');
  }

  const items: ModelProgressItem[] = [];
  for (let clusterIndex = 0; clusterIndex < cards.length; clusterIndex += 1) {
    const card = asCard(cards[clusterIndex]);
    if (!card || card.canUse === false || !Array.isArray(card.stims)) {
      continue;
    }

    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex += 1) {
      const stim = asStim(card.stims[stimIndex]);
      if (!stim || stim.canUse === false) {
        continue;
      }

      const id = resolveStableId(clusterIndex, stimIndex, stim);
      const clusterKC = resolveClusterKC(card, stim);
      items.push({
        id,
        stimulusKC: resolveStimulusKC(stim, id),
        ...(clusterKC === undefined ? {} : { clusterKC }),
        probability: normalizeProbability(stim.probabilityEstimate, id),
        introduced: isIntroduced(card, stim),
        current: isCurrent(params.currentCardRef, clusterIndex, stimIndex),
        canUse: true,
      });
    }
  }
  return items;
}
