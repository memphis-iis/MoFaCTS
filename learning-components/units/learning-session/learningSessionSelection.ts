import {
  selectCardBelowOptimalProbability,
  selectCardClosestToOptimalProbability,
} from './model/selectionPolicy';

export interface SelectLearningSessionIndicesParams {
  readonly unitMode: string;
  readonly cards: any[];
  readonly hiddenItems: unknown[];
  readonly deliverySettings: Record<string, unknown>;
  readonly options?: any;
  readonly calculateCardProbabilities: () => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export async function selectLearningSessionIndices(
  params: SelectLearningSessionIndicesParams,
): Promise<{ clusterIndex: number; stimIndex: number }> {
  params.calculateCardProbabilities();
  const selectionOptions = {
    excludeCurrentCardRef: params.options?.excludeCurrentCardRef || null,
  };
  const runSelection = (selectorOptions: any) => {
    let indices;
    switch (params.unitMode) {
      case 'thresholdCeiling':
        params.log(1, 'selectCardBelowOptimalProbability');
        indices = selectCardBelowOptimalProbability(
          params.cards,
          params.hiddenItems,
          params.deliverySettings,
          selectorOptions,
        );
        params.log(2, 'thresholdCeiling, indicies:', JSON.parse(JSON.stringify(indices)));
        if (indices.clusterIndex === -1) {
          params.log(2, 'thresholdCeiling did not produce a card; trying min probability distance policy');
          params.log(1, 'selectCardClosestToOptimalProbability');
          indices = selectCardClosestToOptimalProbability(
            params.cards,
            params.hiddenItems,
            params.deliverySettings,
            selectorOptions,
          );
        }
        return indices;
      case 'distance':
        params.log(1, 'selectCardClosestToOptimalProbability');
        return selectCardClosestToOptimalProbability(
          params.cards,
          params.hiddenItems,
          params.deliverySettings,
          selectorOptions,
        );
      default:
        params.log(1, 'selectCardClosestToOptimalProbability');
        return selectCardClosestToOptimalProbability(
          params.cards,
          params.hiddenItems,
          params.deliverySettings,
          selectorOptions,
        );
    }
  };

  let indices = runSelection(selectionOptions);
  if (indices.clusterIndex === -1 && selectionOptions.excludeCurrentCardRef) {
    params.log(
      2,
      '[EARLY LOCK] Retrying selection without current-card exclusion after constrained selection produced no card',
      selectionOptions.excludeCurrentCardRef,
    );
    indices = runSelection({ excludeCurrentCardRef: null });
  }
  return indices;
}
