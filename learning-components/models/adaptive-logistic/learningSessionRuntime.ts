import type { LearningComponentContext } from '../../runtime/LearningComponentContext';

export interface BuildNextCardSelectionParams {
  readonly indices: any;
  readonly options?: any;
  readonly cardProbabilities: any;
  readonly context: LearningComponentContext;
  readonly calculateIndices: (options?: any) => Promise<any> | any;
  readonly resolveSelectionTestType: (card: any, stim: any) => string;
  readonly buildPreparedCardQuestionAndAnswerGlobals: (
    cardIndex: any,
    whichStim: any,
    probFunctionParameters: any,
    options?: any,
  ) => Promise<any>;
}

function buildPreparationDiagnostic(
  context: LearningComponentContext,
  card: any,
  stim: any,
  clusterIndex: any,
  stimIndex: any,
  testType: string,
): Record<string, unknown> {
  const currentDeliverySettings = context.getDeliverySettings();
  return {
    currentTdfName: context.getSessionValue('currentTdfName') || null,
    currentTdfId: context.getSessionValue('currentTdfId') || null,
    currentRootTdfId: context.getSessionValue('currentRootTdfId') || null,
    currentStimuliSetId: context.getSessionValue('currentStimuliSetId') || null,
    currentUnitNumber: context.getSessionValue('currentUnitNumber') ?? null,
    currentUnitName: context.getSessionValue('currentTdfUnit')?.unitname || null,
    clusterIndex,
    stimIndex,
    studyFirst: currentDeliverySettings.studyFirst,
    studyOnlyFields: currentDeliverySettings.studyOnlyFields || null,
    drillFields: currentDeliverySettings.drillFields || null,
    cardHasBeenIntroduced: card.hasBeenIntroduced,
    stimHasBeenIntroduced: stim.hasBeenIntroduced,
    stimAvailable: stim.available || null,
    resolvedTestType: testType,
  };
}

export async function buildNextCardSelection(params: BuildNextCardSelectionParams): Promise<any> {
  let indices = params.indices;
  const options = params.options || {};

  if (indices === undefined || indices === null) {
    params.context.log(2, 'indices unset, calculating now');
    indices = await params.calculateIndices(options);
  }

  if (!indices) {
    return null;
  }

  const newClusterIndex = indices.clusterIndex;
  const newStimIndex = indices.stimIndex;

  if (newClusterIndex === -1 || newStimIndex === -1) {
    return null;
  }

  const card = params.cardProbabilities.cards[newClusterIndex];
  const stim = card.stims[newStimIndex];
  const testType = params.resolveSelectionTestType(card, stim);
  const preparationDiagnostic = buildPreparationDiagnostic(
    params.context,
    card,
    stim,
    newClusterIndex,
    newStimIndex,
    testType,
  );
  params.context.setSessionValue('firstCardPreparationDiagnostic', {
    stage: 'beforeBuildPreparedCard',
    capturedAt: Date.now(),
    ...preparationDiagnostic,
  });
  params.context.log(1, '[Unit Engine] First-card preparation diagnostic', preparationDiagnostic);

  let preparedState;
  try {
    preparedState = await params.buildPreparedCardQuestionAndAnswerGlobals(
      newClusterIndex,
      newStimIndex,
      stim.probFunctionParameters,
      { testType },
    );
  } catch (error) {
    const errorRecord = error instanceof Error ? error : null;
    const failureDiagnostic = {
      error,
      ...preparationDiagnostic,
    };
    params.context.setSessionValue('firstCardPreparationDiagnostic', {
      stage: 'buildPreparedCardFailed',
      capturedAt: Date.now(),
      ...failureDiagnostic,
      errorMessage: errorRecord?.message || String(error),
      errorStack: errorRecord?.stack || null,
    });
    params.context.log(1, '[Unit Engine] First-card preparation failed', failureDiagnostic);
    throw error;
  }

  const completedDiagnostic = {
    currentTdfName: params.context.getSessionValue('currentTdfName') || null,
    currentTdfId: params.context.getSessionValue('currentTdfId') || null,
    currentStimuliSetId: params.context.getSessionValue('currentStimuliSetId') || null,
    currentUnitNumber: params.context.getSessionValue('currentUnitNumber') ?? null,
    currentUnitName: params.context.getSessionValue('currentTdfUnit')?.unitname || null,
    clusterIndex: newClusterIndex,
    stimIndex: newStimIndex,
    resolvedTestType: testType,
    currentDisplayKeys: Object.keys(preparedState?.currentDisplay || {}),
    hasDisplayText: Boolean(preparedState?.currentDisplay?.text),
    hasDisplayClozeText: Boolean(preparedState?.currentDisplay?.clozeText),
    hasDisplayAudio: Boolean(preparedState?.currentDisplay?.audioSrc),
    hasDisplayImage: Boolean(preparedState?.currentDisplay?.imgSrc),
    hasCurrentAnswer: Boolean(preparedState?.currentAnswer),
  };
  params.context.setSessionValue('firstCardPreparationDiagnostic', {
    stage: 'buildPreparedCardCompleted',
    capturedAt: Date.now(),
    ...completedDiagnostic,
  });
  params.context.log(1, '[Unit Engine] First-card preparation completed', completedDiagnostic);

  return {
    indices,
    clusterIndex: newClusterIndex,
    stimIndex: newStimIndex,
    currentCardRef: {
      clusterIndex: newClusterIndex,
      stimIndex: newStimIndex,
    },
    preparedState,
    testType,
    ownerToken: options?.ownerToken || null,
    createdAt: Date.now(),
  };
}
