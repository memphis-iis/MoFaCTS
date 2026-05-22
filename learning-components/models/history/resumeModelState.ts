export interface ApplyResumeModelStateParams {
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly reconstructed: any;
  readonly getHistoryCorrectAnswer: (rawResponse: unknown) => string;
  readonly getHistoryResponseKey: (rawResponse: unknown) => string;
}

export function applyResumeModelState(params: ApplyResumeModelStateParams): number {
  const cards = params.cardProbabilities.cards;

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    const clusterState = params.reconstructed.clusterState[String(card.clusterKC)];
    if (clusterState) {
      Object.assign(card, clusterState);
    }

    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
      const stim = card.stims[stimIndex];
      const stimulusState = params.reconstructed.stimulusState[String(stim.stimulusKC)];
      if (stimulusState) {
        Object.assign(stim, stimulusState);
      }
    }
  }

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
      const rawResponse = params.stimClusters[cardIndex]?.stims?.[stimIndex]?.correctResponse;
      const correctAnswer = params.getHistoryCorrectAnswer(rawResponse);
      const responseKey = params.getHistoryResponseKey(rawResponse);
      const responseState = params.reconstructed.responseState[String(correctAnswer)];
      if (responseKey && responseState && params.cardProbabilities.responses[responseKey]) {
        Object.assign(params.cardProbabilities.responses[responseKey], responseState);
      }
    }
  }

  let numVisibleCards = 0;
  for (let i = 0; i < params.cardProbabilities.cards.length; i++) {
    if (params.cardProbabilities.cards[i].canUse) {
      numVisibleCards += params.cardProbabilities.cards[i].stims.length;
    }
  }

  Object.assign(params.cardProbabilities, {
    numQuestionsAnswered: params.reconstructed.numQuestionsAnswered,
    numQuestionsAnsweredCurrentSession: params.reconstructed.numQuestionsAnsweredCurrentSession,
    numCorrectAnswers: params.reconstructed.numCorrectAnswers,
  });

  return numVisibleCards;
}
