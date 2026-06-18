export interface ApplyAnswerUpdateParams {
  readonly cardProbabilities: any;
  readonly cards: any[];
  readonly selectedClusterIndex: number;
  readonly currentStimIndex: number;
  readonly whichStim: number;
  readonly practiceTime: number;
  readonly wasCorrect: boolean;
  readonly testType: string;
  readonly answerText: string;
  readonly onMissingResponseMetrics: () => void;
}

export function applyAnswerUpdate(params: ApplyAnswerUpdateParams): void {
  const card = params.cards[params.selectedClusterIndex];

  for (let i = 0; i < params.cards.length; i++) {
    const otherCard = params.cards[i];
    if (otherCard.firstSeen > 0) {
      if (i != params.selectedClusterIndex) {
        otherCard.otherPracticeTime += params.practiceTime;
        for (const otherStim of otherCard.stims) {
          otherStim.otherPracticeTime += params.practiceTime;
        }
      } else {
        for (let j = 0; j < otherCard.stims.length; j++) {
          const otherStim = otherCard.stims[j];
          if (j != params.currentStimIndex) {
            otherStim.otherPracticeTime += params.practiceTime;
          }
        }
      }
    }
  }

  const stim = card.stims[params.whichStim];
  stim.totalPracticeDuration += params.practiceTime;
  stim.allTimeTotalPracticeDuration += params.practiceTime;
  stim.timesSeen += 1;

  if (params.testType === "s") {
    return;
  }

  params.cardProbabilities.numQuestionsAnswered += 1;
  params.cardProbabilities.numQuestionsAnsweredCurrentSession += 1;
  if (params.wasCorrect) {
    params.cardProbabilities.numCorrectAnswers += 1;
  }

  if (params.wasCorrect) {
    card.priorCorrect += 1;
    card.allTimeCorrect += 1;
    stim.priorCorrect += 1;
    stim.curSessionPriorCorrect += 1;
    stim.allTimeCorrect += 1;
    stim.crowdStimSuccessCount = Number(stim.crowdStimSuccessCount || 0) + 1;
  } else {
    card.priorIncorrect += 1;
    card.allTimeIncorrect += 1;
    stim.priorIncorrect += 1;
    stim.curSessionPriorIncorrect += 1;
    stim.allTimeIncorrect += 1;
    stim.crowdStimFailureCount = Number(stim.crowdStimFailureCount || 0) + 1;
  }
  stim.crowdStimTotalTests = Number(stim.crowdStimTotalTests || 0) + 1;

  card.outcomeStack.push(params.wasCorrect ? 1 : 0);
  stim.outcomeStack.push(params.wasCorrect ? 1 : 0);

  if (!params.answerText) {
    return;
  }

  let resp;
  if (params.answerText in params.cardProbabilities.responses) {
    resp = params.cardProbabilities.responses[params.answerText];
    if (params.wasCorrect) {
      resp.priorCorrect += 1;
      resp.allTimeCorrect += 1;
    } else {
      resp.priorIncorrect += 1;
      resp.allTimeIncorrect += 1;
    }

    resp.outcomeStack.push(params.wasCorrect ? 1 : 0);
  } else {
    params.onMissingResponseMetrics();
  }
}
