import type { UnitEngineSessionReadKey, UnitEngineSessionWriteKey } from '../../units/UnitEngineSessionKeys';

export interface CommitPreparedSelectionParams {
  readonly selection: any;
  readonly cardProbabilities: any;
  readonly context: {
    readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
    readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
    readonly setQuestionIndex: (index: number) => void;
    readonly log: (level: number, ...args: unknown[]) => void;
  };
  readonly resolveSelectionTestType: (card: any, stim: any) => string;
  readonly buildCurrentOwnerToken: (cardRef: any) => string;
  readonly setCurrentCardInfo: (cardIndex: any, whichStim: any) => void;
  readonly findCurrentCardInfo: () => any;
  readonly applyPreparedCardQuestionAndAnswerGlobals: (preparedState: any) => any;
  readonly setRuntimeCurrentPreparedState: (preparedState: any) => void;
  readonly setRuntimeCurrentCardRef: (cardRef: any) => void;
  readonly setRuntimeCurrentCardOwnerToken: (ownerToken: any) => void;
  readonly updateCardAndStimData: (cardIndex: any, whichStim: any) => void;
  readonly recordAdminMetrics: (cardIndex: any, whichStim: any, card: any, stim: any) => void;
}

export function commitPreparedSelection(params: CommitPreparedSelectionParams): any {
  const cardIndex = params.selection.clusterIndex;
  const whichStim = params.selection.stimIndex;

  const card = params.cardProbabilities.cards[cardIndex];
  const stim = card.stims[whichStim];

  params.context.log(2, 'selectNextCard indices:', cardIndex, whichStim, params.selection.indices);

  stim.previousCalculatedProbabilities.push(stim.probabilityEstimate);
  card.previousCalculatedProbabilities.push(stim.probabilityEstimate);

  params.context.setSessionValue('currentStimProbFunctionParameters', stim.probFunctionParameters);
  params.context.setSessionValue('clusterIndex', cardIndex);

  let newExperimentState: any = {
    clusterIndex: cardIndex,
    shufIndex: cardIndex,
    lastTimeStamp: Date.now(),
    whichStim: whichStim,
  };

  params.setCurrentCardInfo(cardIndex, whichStim);
  params.context.log(2, 'select next card:', cardIndex, whichStim);
  params.context.log(2, 'currentCardInfo:', JSON.parse(JSON.stringify(params.findCurrentCardInfo())));

  const preparedState = params.selection?.preparedState;
  if (!preparedState) {
    throw new Error('Model selection commit requires preparedState');
  }
  const stateChanges = params.applyPreparedCardQuestionAndAnswerGlobals(preparedState);
  params.setRuntimeCurrentPreparedState(preparedState);
  params.context.log(2, 'selectNextCard,', params.context.getSessionValue('clozeQuestionParts'), stateChanges);
  newExperimentState = Object.assign(newExperimentState, stateChanges);

  const testType = params.selection?.testType || params.resolveSelectionTestType(card, stim);
  params.context.setSessionValue('testType', testType);
  newExperimentState.testType = testType;
  newExperimentState.questionIndex = 1;
  const currentCardRef = {
    clusterIndex: cardIndex,
    stimIndex: whichStim,
  };
  params.setRuntimeCurrentCardRef(currentCardRef);
  params.setRuntimeCurrentCardOwnerToken(params.selection?.ownerToken || params.buildCurrentOwnerToken(currentCardRef));

  params.context.setQuestionIndex(0);
  params.updateCardAndStimData(cardIndex, whichStim);
  params.recordAdminMetrics(cardIndex, whichStim, card, stim);

  for (let index = 0; index < params.cardProbabilities.cards.length; index++) {
    const otherCard = params.cardProbabilities.cards[index];
    if (index != cardIndex && otherCard.hasBeenIntroduced) {
      otherCard.trialsSinceLastSeen += 1;
    }
  }

  return newExperimentState;
}
