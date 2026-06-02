import { createProbabilityFunctionHelpers } from './probabilityFunctions';

export interface CalculateSingleProbabilityParams {
  readonly cardProbabilities: any;
  readonly cardIndex: any;
  readonly stimIndex: any;
  readonly sequenceIndex: any;
  readonly stimCluster: any;
  readonly probabilityFunction: (p: any, pFunc: any) => any;
  readonly deliverySettings: any;
  readonly overallOutcomeHistory: any;
  readonly overallStudyHistory: any;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly normalizeResponseText: (answer: string) => string;
  readonly legacyFloat: (value: any) => number;
  readonly log: (...args: unknown[]) => void;
}

function secs(t: any) {
  return t / 1000.0;
}

function elapsed(t: any) {
  return t < 1 ? 0 : secs(Date.now() - t);
}

// Given a single item from cardProbabilities, calculate the current probability.
// The caller owns storage and any model mutations.
export function calculateSingleProbability(params: CalculateSingleProbabilityParams): any {
  const card = params.cardProbabilities.cards[params.cardIndex];
  const stim = card.stims[params.stimIndex];

  // Store parameters in an object for easy logging/debugging.
  const p: any = {};

  const pFunc = createProbabilityFunctionHelpers(params.log);

  p.i = params.sequenceIndex;

  // Current Indices
  p.clusterIndex = params.cardIndex;
  p.stimIndex = params.stimIndex;
  p.pFunc = pFunc;

  // Top-level metrics
  p.userTotalResponses = params.cardProbabilities.numQuestionsAnswered;
  p.userCorrectResponses = params.cardProbabilities.numCorrectAnswers;

  // Instruction metrics
  p.instructionQuestionResult = card.instructionQuestionResult;

  // Card/cluster metrics
  p.questionSuccessCount = card.priorCorrect;
  p.questionFailureCount = card.priorIncorrect;
  p.questionTotalTests = p.questionSuccessCount + p.questionFailureCount;
  p.questionStudyTrialCount = card.priorStudy;
  p.questionSecsSinceLastShown = elapsed(card.lastSeen);
  p.questionSecsSinceFirstShown = elapsed(card.firstSeen);
  p.questionSecsPracticingOthers = secs(card.otherPracticeTime);
  p.questionTimeHistory = JSON.parse(JSON.stringify(card.timeHistory || []));
  p.questionSpacingLagged = pFunc.spacingLagged(p.questionTimeHistory);

  // Stimulus/cluster-version metrics
  p.stimSecsSinceLastShown = elapsed(stim.lastSeen);
  p.stimSecsSinceFirstShown = elapsed(stim.firstSeen);
  p.stimSecsPracticingOthers = secs(stim.otherPracticeTime);
  p.stim = params.stimCluster.stims[params.stimIndex];

  p.stimSuccessCount = stim.priorCorrect;
  p.stimFailureCount = stim.priorIncorrect;
  p.stimTotalTests = p.stimSuccessCount + p.stimFailureCount;
  p.crowdStimSuccessCount = stim.crowdStimSuccessCount || 0;
  p.crowdStimFailureCount = stim.crowdStimFailureCount || 0;
  p.crowdStimTotalTests = stim.crowdStimTotalTests || 0;
  p.stimStudyTrialCount = stim.priorStudy;
  p.stimTimeHistory = JSON.parse(JSON.stringify(stim.timeHistory || []));
  p.stimSpacingLagged = pFunc.spacingLagged(p.stimTimeHistory);
  const stimAnswer = params.stimCluster.stims[params.stimIndex].correctResponse;
  let answerText = params.getDisplayAnswerText(stimAnswer).toLowerCase();
  p.stimResponseText = params.normalizeResponseText(answerText);
  answerText = answerText.replace(/\./g, '_');
  p.answerText = answerText;

  p.resp = params.cardProbabilities.responses[p.stimResponseText];
  p.responseSuccessCount = p.resp.priorCorrect;
  p.responseFailureCount = p.resp.priorIncorrect;
  p.responseOutcomeHistory = JSON.parse(JSON.stringify(p.resp.outcomeStack));
  p.responseSecsSinceLastShown = elapsed(p.resp.lastSeen);
  p.responseStudyTrialCount = p.resp.priorStudy;
  p.responseTotalTests = p.responseSuccessCount + p.responseFailureCount;
  p.responseTimeHistory = JSON.parse(JSON.stringify(p.resp.timeHistory || []));
  p.responseSpacingLagged = pFunc.spacingLagged(p.responseTimeHistory);

  p.stimParameters = params.stimCluster.stims[params.stimIndex].params.split(',').map((x: any) => params.legacyFloat(x));
  if (params.deliverySettings.optimalThreshold) {
    p.stimParameters[1] = params.deliverySettings.optimalThreshold;
  }

  p.clusterPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(card.previousCalculatedProbabilities));
  p.clusterOutcomeHistory = JSON.parse(JSON.stringify(card.outcomeStack));

  p.stimPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(stim.previousCalculatedProbabilities));
  p.stimOutcomeHistory = JSON.parse(JSON.stringify(stim.outcomeStack));
  if (typeof p.stimOutcomeHistory === 'string') {
    p.stimOutcomeHistory = p.stimOutcomeHistory.split(',');
  }

  p.overallOutcomeHistory = params.overallOutcomeHistory;
  p.overallStudyHistory = params.overallStudyHistory;

  return params.probabilityFunction(p, pFunc);
}

export interface CalculateCardProbabilitiesParams {
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly unitClusterList: any[];
  readonly probabilityFunction: (p: any, pFunc: any) => any;
  readonly deliverySettings: any;
  readonly overallOutcomeHistory: any;
  readonly overallStudyHistory: any;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly normalizeResponseText: (answer: string) => string;
  readonly legacyFloat: (value: any) => number;
  readonly log: (...args: unknown[]) => void;
}

// Mutates the existing card/stim probability model in place, matching the legacy engine contract.
export function calculateCardProbabilities(params: CalculateCardProbabilitiesParams): void {
  let count = 0;
  let parms;
  const ptemp: any = [];
  const tdfDebugLog: any = [];

  for (const clusterIndex of params.unitClusterList) {
    const card = params.cardProbabilities.cards[clusterIndex];
    const stimCluster = params.stimClusters[clusterIndex];
    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
      const stim = card.stims[stimIndex];
      parms = calculateSingleProbability({
        cardProbabilities: params.cardProbabilities,
        cardIndex: clusterIndex,
        stimIndex,
        sequenceIndex: count,
        stimCluster,
        probabilityFunction: params.probabilityFunction,
        deliverySettings: params.deliverySettings,
        overallOutcomeHistory: params.overallOutcomeHistory,
        overallStudyHistory: params.overallStudyHistory,
        getDisplayAnswerText: params.getDisplayAnswerText,
        normalizeResponseText: params.normalizeResponseText,
        legacyFloat: params.legacyFloat,
        log: params.log,
      });
      tdfDebugLog.push(parms.debugLog);

      stim.available = parms.available;
      if (typeof stim.available == "string" && (stim.available == "true" || stim.available == "false")) {
        stim.available = stim.available == "true";
      }
      stim.canUse = stim.available || stim.available === undefined;
      stim.probabilityEstimate = parms.probability;
      stim.probFunctionParameters = parms;
      if (typeof stim.probabilityEstimate !== "number") {
        throw 'Error: Probability Estimate is undefined or NaN.';
      }
      ptemp[count] = Math.round(10000 * parms.probability) / 10000;
      count++;
    }
  }
  params.log('calculateCardProbabilities', JSON.stringify(ptemp));
}
