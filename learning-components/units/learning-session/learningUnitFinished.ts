export interface LearningUnitFinishedParams {
  readonly session: any;
  readonly deliverySettings: any;
  readonly numQuestionsAnsweredCurrentSession: any;
  readonly unitStartTimestamp: number;
  readonly getCurrentStudentPerformance: () => any;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function learningUnitFinished(params: LearningUnitFinishedParams): boolean {
  const minSecs = Number(params.deliverySettings.displayMinSeconds || 0);
  const maxSecs = Number(params.deliverySettings.displayMaxSeconds || 0);
  const maxTrials = parseInt(params.session.maxTrials || 0);
  const numTrialsSoFar = params.numQuestionsAnsweredCurrentSession || 0;
  const practicetimer = params.deliverySettings.practicetimer;

  if (maxTrials > 0 && numTrialsSoFar >= maxTrials) {
    return true;
  }

  // Display timers are completed by UI flow outside the model engine.
  if (minSecs > 0.0 || maxSecs > 0.0) {
    return false;
  }

  const practiceSeconds = Number(params.deliverySettings.practiceseconds || 0);
  if (practiceSeconds < 1.0) {
    params.log(2, 'No Practice Time Found and display timer: user must quit with Continue button');
    return false;
  }

  let unitElapsedTime = 0;
  if (practicetimer === 'clock-based') {
    unitElapsedTime = params.getCurrentStudentPerformance().totalTime / 1000.0;
  } else {
    unitElapsedTime = (Date.now() - params.unitStartTimestamp) / 1000.0;
  }
  params.log(2, 'Model practice check', unitElapsedTime, '>', practiceSeconds);
  return unitElapsedTime > practiceSeconds;
}
