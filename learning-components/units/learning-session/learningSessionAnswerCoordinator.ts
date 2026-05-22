import { stripSpacesAndLowerCase } from '../../content/response-normalization/responseKey';
import { applyAnswerUpdate } from './model/answerUpdates';

export async function applyLearningSessionAnswer(params: {
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly selectedClusterIndex: any;
  readonly whichStim: any;
  readonly currentStimIndex: any;
  readonly wasCorrect: any;
  readonly practiceTime: any;
  readonly testType: string;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly updateCurStudentPerformance: (wasCorrect: any, practiceTime: any, testType: any) => void;
  readonly displayify: (value: any) => any;
  readonly log: (level: number, ...args: unknown[]) => void;
}) {
  const cards = params.cardProbabilities.cards;
  const cluster = params.stimClusters[params.selectedClusterIndex];
  const card = cards[params.selectedClusterIndex];

  params.log(1, 'cardAnswered, card: ', card, 'clusterIndex: ', params.selectedClusterIndex);

  const stim = card.stims[params.whichStim];
  const answerText = stripSpacesAndLowerCase(params.getDisplayAnswerText(
    cluster.stims[params.currentStimIndex].correctResponse));

  params.updateCurStudentPerformance(params.wasCorrect, params.practiceTime, params.testType);

  const currentStimProbability = stim.probabilityEstimate;

  params.log(2, 'cardAnswered, curTrialInfo:', currentStimProbability, card, stim);

  applyAnswerUpdate({
    cardProbabilities: params.cardProbabilities,
    cards,
    selectedClusterIndex: params.selectedClusterIndex,
    currentStimIndex: params.currentStimIndex,
    whichStim: params.whichStim,
    practiceTime: params.practiceTime,
    wasCorrect: params.wasCorrect,
    testType: params.testType,
    answerText,
    onMissingResponseMetrics: () => params.log(1, 'COULD NOT STORE RESPONSE METRICS',
        answerText,
        params.currentStimIndex,
        params.displayify(cluster.stims[params.currentStimIndex].correctResponse),
        params.displayify(params.cardProbabilities.responses)),
  });
}
