export function buildHiddenItemKeySet(hiddenItems: unknown[]): Set<string> {
  const hiddenItemKeys = new Set<string>();
  for (const item of hiddenItems || []) {
    if (item === null || item === undefined) {
      continue;
    }
    if (typeof item === "object" && item !== null && "KCId" in item) {
      hiddenItemKeys.add(String((item as { KCId?: unknown }).KCId));
      continue;
    }
    hiddenItemKeys.add(String(item));
  }
  return hiddenItemKeys;
}

export function shouldExcludeCurrentCard(
  clusterIndex: number,
  stimIndex: number,
  selectionOptions: { excludeCurrentCardRef?: { clusterIndex: number; stimIndex: number } } | undefined,
): boolean {
  const excludedRef = selectionOptions?.excludeCurrentCardRef;
  if (!excludedRef) {
    return false;
  }

  return excludedRef.clusterIndex === clusterIndex && excludedRef.stimIndex === stimIndex;
}

function resolveConfiguredOptimalThreshold(currentDeliverySettings: Record<string, any>): number | null {
  const threshold = Number(currentDeliverySettings?.optimalThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    return null;
  }
  return threshold;
}

export function selectCardClosestToOptimalProbability(
  cards: any[],
  hiddenItems: unknown[],
  currentDeliverySettings: Record<string, any>,
  selectionOptions: { excludeCurrentCardRef?: { clusterIndex: number; stimIndex: number } } | undefined = {},
): { clusterIndex: number; stimIndex: number } {
  const hiddenItemKeys = buildHiddenItemKeySet(hiddenItems);
  let currentMin = 50.0;
  let clusterIndex = -1;
  let stimIndex = -1;
  let optimalProb;
  const forceSpacing = currentDeliverySettings.forceSpacing;
  const minTrialDistance = forceSpacing ? 1 : -1;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.canUse || !(card.trialsSinceLastSeen > minTrialDistance)) {
      continue;
    }
    for (let j = 0; j < card.stims.length; j++) {
      const stim = card.stims[j];
      if (shouldExcludeCurrentCard(i, j, selectionOptions)) continue;
      if (hiddenItemKeys.has(String(stim.stimulusKC)) || !stim.canUse) continue;
      const parameters = stim.parameter;
      const configuredThreshold = resolveConfiguredOptimalThreshold(currentDeliverySettings);
      optimalProb = configuredThreshold !== null
        ? Math.log(configuredThreshold / (1 - configuredThreshold)) || false
        : false;
      if (!optimalProb) optimalProb = Math.log(parameters[1] / (1 - parameters[1])) || false;
      if (!optimalProb) {
        throw new Error("NO OPTIMAL PROBABILITY SPECIFIED IN STIM, THROWING ERROR");
      }
      const dist = Math.abs(Math.log(Number(stim.probabilityEstimate) / (1 - Number(stim.probabilityEstimate))) - Number(optimalProb));
      if (dist < currentMin) {
        currentMin = dist;
        clusterIndex = i;
        stimIndex = j;
      }
    }
  }

  return { clusterIndex, stimIndex };
}

export function selectCardBelowOptimalProbability(
  cards: any[],
  hiddenItems: unknown[],
  currentDeliverySettings: Record<string, any>,
  selectionOptions: { excludeCurrentCardRef?: { clusterIndex: number; stimIndex: number } } | undefined = {},
): { clusterIndex: number; stimIndex: number } {
  const hiddenItemKeys = buildHiddenItemKeySet(hiddenItems);
  let currentMax = 0;
  let clusterIndex = -1;
  let stimIndex = -1;
  const forceSpacing = currentDeliverySettings.forceSpacing;
  const minTrialDistance = forceSpacing ? 1 : -1;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.canUse || !(card.trialsSinceLastSeen > minTrialDistance)) {
      continue;
    }
    for (let j = 0; j < card.stims.length; j++) {
      const stim = card.stims[j];
      if (shouldExcludeCurrentCard(i, j, selectionOptions)) continue;
      if (hiddenItemKeys.has(String(stim.stimulusKC)) || !stim.canUse) continue;
      const parameters = stim.parameter;
      let thresholdCeiling = parameters[1];
      const configuredThreshold = resolveConfiguredOptimalThreshold(currentDeliverySettings);
      if (configuredThreshold !== null) {
        thresholdCeiling = configuredThreshold;
      }
      if (!thresholdCeiling) {
        if (configuredThreshold === null) {
          throw new Error("Missing deliverySettings.optimalThreshold while selecting a card below optimal probability.");
        }
      }
      if (stim.probabilityEstimate > currentMax && stim.probabilityEstimate < thresholdCeiling) {
        currentMax = stim.probabilityEstimate;
        clusterIndex = i;
        stimIndex = j;
      }
    }
  }
  return { clusterIndex, stimIndex };
}
