export interface ApplyPracticeTimeUpdateParams {
  readonly cardProbabilities: any;
  readonly clusterIndex: number;
  readonly whichStim: number;
  readonly practiceTime: number;
}

export function applyPracticeTimeUpdate(params: ApplyPracticeTimeUpdateParams): void {
  const card = params.cardProbabilities.cards[params.clusterIndex];
  const stim = card.stims[params.whichStim];
  card.totalPracticeDuration += params.practiceTime;
  stim.totalPracticeDuration += params.practiceTime;
}
