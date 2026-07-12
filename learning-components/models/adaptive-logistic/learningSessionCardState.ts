import { stripSpacesAndLowerCase } from '../../content/response-normalization/responseKey';

export interface CurrentLearningCardInfo {
  testType: string;
  clusterIndex: number;
  whichStim: number;
  forceButtonTrial: boolean;
  probabilityEstimate: number;
}

export interface CurrentLearningCardInfoTracker {
  readonly currentCardInfo: CurrentLearningCardInfo;
  readonly setCurrentCardInfo: (clusterIndex: any, whichStim: any, forceButtonTrial?: any) => void;
  readonly findCurrentCardInfo: () => CurrentLearningCardInfo;
}

export function createCurrentLearningCardInfoTracker(params: {
  readonly getCardProbabilities: () => any;
  readonly getStimParameterArray: (clusterIndex: any, whichStim: any) => any[];
  readonly log: (level: number, ...args: unknown[]) => void;
}): CurrentLearningCardInfoTracker {
  const currentCardInfo: CurrentLearningCardInfo = {
    testType: 'd',
    clusterIndex: -1,
    whichStim: -1,
    forceButtonTrial: false,
    probabilityEstimate: -1,
  };

  return {
    currentCardInfo,

    setCurrentCardInfo(clusterIndex: any, whichStim: any, forceButtonTrial: any = false) {
      const cardProbabilities = params.getCardProbabilities();
      currentCardInfo.clusterIndex = clusterIndex;
      currentCardInfo.whichStim = whichStim;
      currentCardInfo.forceButtonTrial = forceButtonTrial;
      currentCardInfo.probabilityEstimate = cardProbabilities.cards[clusterIndex].stims[whichStim].probabilityEstimate;
      params.log(1, 'MODEL UNIT card (selection: any) => ',
          'cluster-idx:', clusterIndex,
          'whichStim:', whichStim,
          'forceButtonTrial:', forceButtonTrial,
          'parameter', params.getStimParameterArray(clusterIndex, whichStim),
      );
    },

    findCurrentCardInfo() {
      return currentCardInfo;
    },
  };
}

export function recordLearningCardAdminMetrics(params: {
  readonly cardProbabilities: any;
  readonly cardIndex: any;
  readonly whichStim: any;
  readonly card: any;
  readonly stim: any;
  readonly correctAnswer: any;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly displayify: (value: any) => any;
  readonly log: (level: number, ...args: unknown[]) => void;
}) {
  const secs = (t: any) => t / 1000.0;

  params.log(1, '>>>BEGIN METRICS>>>>>>>\n',
  'Overall user (stats: any) => ',
      'total responses:', params.cardProbabilities.numQuestionsAnswered,
      'total correct responses:', params.cardProbabilities.numCorrectAnswers,
  );

  params.log(1, 'Model selected card:', params.card);
  params.log(1, 'Model selected stim:', params.stim);

  const elapsedStr = function(t: any) {
    return t < 1 ? 'Never Seen' : secs(Date.now() - t);
  };
  params.log(1,
      'Card First Seen:', elapsedStr(params.card.firstSeen),
      'Card Last Seen:', elapsedStr(params.card.lastSeen),
      'Total time in other practice:', secs(params.card.otherPracticeTime),
      'Stim First Seen:', elapsedStr(params.stim.firstSeen),
      'Stim Last Seen:', elapsedStr(params.stim.lastSeen),
      'Stim Total time in other practice:', secs(params.stim.otherPracticeTime),
  );

  const responseText = stripSpacesAndLowerCase(params.getDisplayAnswerText(params.correctAnswer));
  if (responseText && responseText in params.cardProbabilities.responses) {
    params.log(1, 'Response is', responseText, params.displayify(params.cardProbabilities.responses[responseText]));
  }

  params.log(1, '<<<END   METRICS<<<<<<<');
}
