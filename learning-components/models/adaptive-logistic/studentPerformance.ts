export interface StudentPerformanceState {
  count: number;
  numCorrect: number;
  numIncorrect: number;
  percentCorrect: string;
  stimsSeen: number | string;
  totalStimCount: number | string;
  totalTime: number | string;
  totalTimeDisplay: string | number;
}

function withPracticeTime(state: StudentPerformanceState, practiceTime: number): StudentPerformanceState {
  const totalTime = Number(state.totalTime) + practiceTime;
  return {
    ...state,
    totalTime,
    totalTimeDisplay: (totalTime / 60000).toFixed(1),
  };
}

export function applyAnswerToStudentPerformance(
  state: StudentPerformanceState,
  isCorrect: boolean,
  practiceTime: number,
  testType: string,
): StudentPerformanceState {
  const next = withPracticeTime({ ...state, count: state.count + 1 }, practiceTime);
  if (testType === 's') return next;
  const numCorrect = state.numCorrect + (isCorrect ? 1 : 0);
  const numIncorrect = state.numIncorrect + (isCorrect ? 0 : 1);
  return {
    ...next,
    numCorrect,
    numIncorrect,
    percentCorrect: `${((numCorrect / (numCorrect + numIncorrect)) * 100).toFixed(2)}%`,
    stimsSeen: Number(state.stimsSeen),
    totalStimCount: Number(state.totalStimCount),
  };
}
