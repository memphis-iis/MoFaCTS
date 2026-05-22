export interface ResolveSelectionTestTypeParams {
  readonly card: any;
  readonly stim: any;
  readonly deliverySettings: any;
  readonly random: () => number;
  readonly log: (...args: unknown[]) => void;
}

export function resolveSelectionTestType(params: ResolveSelectionTestTypeParams): string {
  const { card, stim, deliverySettings } = params;
  let testType = 'd';
  const studyFirstProbability = Number(deliverySettings.studyFirst || 0);
  const shouldShowStudyFirst = !card.hasBeenIntroduced &&
    studyFirstProbability > 0 &&
    (studyFirstProbability >= 1 || params.random() < studyFirstProbability);
  if (shouldShowStudyFirst) {
    params.log('STUDY FOR FIRST TRIAL !!!', studyFirstProbability);
    testType = 's';
  } else if (stim.available) {
    params.log('Trial type set by probability function to: ', stim.available);
    if (stim.available == 'drill')
      testType = 'd';
    else if (stim.available == 'study')
      testType = 's';
    else if (stim.available == 'test')
      testType = 't';
  }
  return testType;
}
