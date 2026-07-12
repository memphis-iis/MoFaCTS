export interface ApplyAnswerUpdateParams {
  readonly cardProbabilities: any;
  readonly cards: any[];
  readonly selectedClusterIndex: number;
  readonly currentStimIndex: number;
  readonly whichStim: number;
  readonly practiceTime: number;
  readonly timestamp: number;
  readonly wasCorrect: boolean;
  readonly testType: string;
  readonly answerText: string;
  readonly onMissingResponseMetrics: () => void;
}

export function applyAnswerUpdate(params: ApplyAnswerUpdateParams): void {
  if (!Number.isFinite(params.timestamp) || params.timestamp < 1) {
    throw new Error('Adaptive logistic answer update requires a valid event timestamp');
  }
  const card = params.cards[params.selectedClusterIndex];
  const stim = card.stims[params.whichStim];
  const response = params.answerText
    ? params.cardProbabilities.responses?.[params.answerText]
    : undefined;

  for (const target of [card, stim, response]) {
    if (!target) {
      continue;
    }
    target.lastSeen = params.timestamp;
    if (!Number.isFinite(Number(target.firstSeen)) || Number(target.firstSeen) < 1) {
      target.firstSeen = params.timestamp;
    }
    if (!Array.isArray(target.timeHistory)) {
      throw new Error('Adaptive logistic answer update requires initialized timeHistory');
    }
    target.timeHistory.push(params.timestamp);
  }
  card.hasBeenIntroduced = true;
  stim.hasBeenIntroduced = true;
  card.trialsSinceLastSeen = 0;

  for (let i = 0; i < params.cards.length; i++) {
    const otherCard = params.cards[i];
    if (i !== params.selectedClusterIndex && otherCard.hasBeenIntroduced) {
      otherCard.trialsSinceLastSeen += 1;
    }
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

  stim.totalPracticeDuration += params.practiceTime;
  stim.allTimeTotalPracticeDuration += params.practiceTime;
  stim.timesSeen += 1;

  if (params.testType === "s") {
    card.priorStudy += 1;
    stim.priorStudy += 1;
    if (response) {
      response.priorStudy += 1;
    }
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

  if (response) {
    if (params.wasCorrect) {
      response.priorCorrect += 1;
      response.allTimeCorrect += 1;
    } else {
      response.priorIncorrect += 1;
      response.allTimeIncorrect += 1;
    }

    response.outcomeStack.push(params.wasCorrect ? 1 : 0);
  } else {
    params.onMissingResponseMetrics();
  }
}
