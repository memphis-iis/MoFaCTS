import { expect } from 'chai';
import {
  classifyResumeDecision,
  LAST_ACTION,
  RESUME_DECISION,
  type LastAction,
} from '../../../../../common/constants/resumeActions';

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
  if (state.currentIndex !== null) {
    return;
  }
  if (state.nextIndex >= state.schedule.length) {
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

function timeoutCurrentCard(state: SimState): void {
  answerCurrentCard(state);
}

function applyResumeDecision(state: SimState, lastAction: LastAction): void {
  const moduleCompleted = state.nextIndex >= state.schedule.length && state.currentIndex === null;
  const decision = classifyResumeDecision({
    lastAction,
    moduleCompleted,
    showInstructions: false,
  });

  if (decision === RESUME_DECISION.HARD_STOP) {
    throw new Error(`Unexpected hard stop for lastAction=${lastAction}`);
  }
  if (decision === RESUME_DECISION.UNIT_COMPLETE) {
    return;
  }
  if (decision === RESUME_DECISION.RESUME_CURRENT_CARD) {
    if (state.currentIndex === null) {
      throw new Error('Expected a current card to resume');
    }
    return;
  }
  if (decision === RESUME_DECISION.ADVANCE_TO_NEXT_CARD) {
    return;
  }
  if (decision === RESUME_DECISION.REDIRECT_INSTRUCTIONS) {
    throw new Error('Unexpected redirect_instructions for schedule test scenario');
  }
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

function cloneState(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state));
}

describe('resume integrity (schedule mode)', function() {
  const schedule = ['A_1', 'A_2', 'A_3', 'A_4', 'A_5', 'A_6', 'A_7', 'A_8', 'A_9', 'A_10'];

  it('fresh run exports full contiguous sequence', function() {
    const state = createState(schedule);
    runToCompletion(state);
    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('resume after display-before-answer continues without skip/duplicate', function() {
    const state = createState(schedule);

    displayCurrentCard(state);
    answerCurrentCard(state); // A_1
    displayCurrentCard(state);
    answerCurrentCard(state); // A_2
    displayCurrentCard(state); // A_3 shown, not answered yet

    applyResumeDecision(state, LAST_ACTION.CARD_DISPLAYED);
    answerCurrentCard(state); // A_3
    runToCompletion(state);

    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('resume after answer-before-transition advances without skip/duplicate', function() {
    const state = createState(schedule);

    displayCurrentCard(state);
    answerCurrentCard(state); // A_1
    displayCurrentCard(state);
    answerCurrentCard(state); // A_2
    displayCurrentCard(state);
    answerCurrentCard(state); // A_3 answered before interruption

    applyResumeDecision(state, LAST_ACTION.CARD_RESPONSE_RECORDED);
    runToCompletion(state);

    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('resume after timeout advances without skip/duplicate', function() {
    const state = createState(schedule);

    displayCurrentCard(state);
    answerCurrentCard(state); // A_1
    displayCurrentCard(state);
    answerCurrentCard(state); // A_2
    displayCurrentCard(state); // A_3 displayed
    timeoutCurrentCard(state); // A_3 timed out and logged

    applyResumeDecision(state, LAST_ACTION.CARD_TIMEOUT);
    runToCompletion(state);

    assertNoSkipNoDuplicateAndOrder(state);
  });

  it('reload + session restart preserve contiguous export order', function() {
    const state = createState(schedule);

    displayCurrentCard(state);
    answerCurrentCard(state); // A_1
    displayCurrentCard(state); // A_2 displayed
    applyResumeDecision(state, LAST_ACTION.CARD_DISPLAYED);

    const reloadedState = cloneState(state);
    answerCurrentCard(reloadedState); // A_2
    displayCurrentCard(reloadedState);
    answerCurrentCard(reloadedState); // A_3
    applyResumeDecision(reloadedState, LAST_ACTION.CARD_RESPONSE_RECORDED);

    const restartedState = cloneState(reloadedState);
    runToCompletion(restartedState);
    assertNoSkipNoDuplicateAndOrder(restartedState);
  });
});
