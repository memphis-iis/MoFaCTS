import { expect } from 'chai';
import { deriveAssessmentScheduleCursor } from './assessmentResume';

type SimState = {
  schedule: string[];
  exported: string[];
  nextIndex: number;
  currentIndex: number | null;
};

function createState(schedule: string[]): SimState {
  return {
    schedule: [...schedule],
    exported: [],
    nextIndex: 0,
    currentIndex: null,
  };
}

function displayCurrentCard(state: SimState): void {
  if (state.currentIndex !== null || state.nextIndex >= state.schedule.length) {
    return;
  }
  state.currentIndex = state.nextIndex;
}

function answerCurrentCard(state: SimState): void {
  if (state.currentIndex === null) {
    throw new Error('Cannot answer without a displayed card');
  }
  const item = state.schedule[state.currentIndex];
  if (typeof item !== 'string') {
    throw new Error(`Missing schedule item at index ${state.currentIndex}`);
  }
  state.exported.push(item);
  state.nextIndex = state.currentIndex + 1;
  state.currentIndex = null;
}

function resumeFromCompletedHistory(state: SimState): void {
  state.nextIndex = deriveAssessmentScheduleCursor(state.exported.length);
  state.currentIndex = null;
}

function runToCompletion(state: SimState): void {
  while (state.nextIndex < state.schedule.length) {
    displayCurrentCard(state);
    answerCurrentCard(state);
  }
}

function assertNoSkipNoDuplicateAndOrder(state: SimState): void {
  expect(state.exported.length).to.equal(state.schedule.length);
  expect(new Set(state.exported).size).to.equal(state.exported.length);
  expect(state.exported).to.deep.equal(state.schedule);
}

describe('resume integrity (schedule mode)', function() {
  const schedule = ['A_1', 'A_2', 'A_3', 'A_4', 'A_5', 'A_6', 'A_7', 'A_8', 'A_9', 'A_10'];

  it('fresh run exports full contiguous sequence', function() {
    const state = createState(schedule);
    runToCompletion(state);
    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('history count resumes at the displayed-but-unanswered schedule item', function() {
    const state = createState(schedule);

    for (let i = 0; i < 5; i += 1) {
      displayCurrentCard(state);
      answerCurrentCard(state);
    }
    displayCurrentCard(state); // A_6 shown, not answered, so it is not in history/export.

    resumeFromCompletedHistory(state);

    expect(state.nextIndex).to.equal(5);
    expect(state.schedule[state.nextIndex]).to.equal('A_6');

    runToCompletion(state);
    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('history count resumes after the last completed schedule item', function() {
    const state = createState(schedule);

    displayCurrentCard(state);
    answerCurrentCard(state);
    displayCurrentCard(state);
    answerCurrentCard(state);

    resumeFromCompletedHistory(state);

    expect(state.nextIndex).to.equal(2);
    expect(state.schedule[state.nextIndex]).to.equal('A_3');

    runToCompletion(state);
    assertNoSkipNoDuplicateAndOrder(state);
  });
});
