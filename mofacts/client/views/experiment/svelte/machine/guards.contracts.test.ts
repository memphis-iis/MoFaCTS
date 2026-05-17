import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  isSupportedTrialType,
  isUnsupportedTrialType,
  needsForceCorrectPrompt,
  isCorrectForceCorrection,
  unitFinished,
  canUsePreparedAdvance,
  canAcceptVideoCheckpoint,
  isSoftError,
  isHardError,
  hasQuestionAudio,
} from './guards';

function makeArgs(overrides: { context?: Record<string, unknown>; event?: Record<string, unknown> } = {}) {
  return {
    context: {
      testType: 'd',
      currentAnswer: 'answer',
      isCorrect: false,
      unitFinished: false,
      currentDisplay: {},
      deliverySettings: {},
      ...overrides.context,
    },
    event: {
      type: 'SUBMIT',
      ...overrides.event,
    },
  };
}

describe('machine guard contracts', function() {
  afterEach(function() {
    Session.set('isVideoSession', false);
    Session.set('videoCheckpoints', null);
  });

  it('accepts supported trial types and rejects unknown trial types', function() {
    expect(isSupportedTrialType(makeArgs({ context: { testType: 's' } }))).to.equal(true);
    expect(isSupportedTrialType(makeArgs({ context: { testType: 'd' } }))).to.equal(true);
    expect(isSupportedTrialType(makeArgs({ context: { testType: 't' } }))).to.equal(true);
    expect(isSupportedTrialType(makeArgs({ context: { testType: 'h' } }))).to.equal(true);
    expect(isSupportedTrialType(makeArgs({ context: { testType: 'm' } }))).to.equal(true);
    expect(isSupportedTrialType(makeArgs({ context: { testType: 'n' } }))).to.equal(true);

    expect(isSupportedTrialType(makeArgs({ context: { testType: 'x' } }))).to.equal(false);
    expect(isUnsupportedTrialType(makeArgs({ context: { testType: 'x' } }))).to.equal(true);
  });

  it('enforces force-correct payload assumptions', function() {
    const matching = makeArgs({
      context: { currentAnswer: 'Paris' },
      event: { userAnswer: 'paris' },
    });
    const nonMatching = makeArgs({
      context: { currentAnswer: 'Paris' },
      event: { userAnswer: 'london' },
    });

    expect(isCorrectForceCorrection(matching)).to.equal(true);
    expect(isCorrectForceCorrection(nonMatching)).to.equal(false);
  });

  it('requires force-correct prompt only until a review entry is captured', function() {
    const pending = makeArgs({
      context: {
        testType: 'd',
        isCorrect: false,
        deliverySettings: { forceCorrection: true },
        reviewEntry: '',
      },
    });
    const completed = makeArgs({
      context: {
        testType: 'd',
        isCorrect: false,
        deliverySettings: { forceCorrection: true },
        reviewEntry: 'answer',
      },
    });

    expect(needsForceCorrectPrompt(pending)).to.equal(true);
    expect(needsForceCorrectPrompt(completed)).to.equal(false);
  });

  it('treats CARD_SELECTED unitFinished payload as authoritative', function() {
    const doneFromEvent = makeArgs({
      context: { unitFinished: false },
      event: { type: 'CARD_SELECTED', unitFinished: true },
    });
    const fallbackToContext = makeArgs({
      context: { unitFinished: true },
      event: { type: 'CARD_SELECTED', unitFinished: false },
    });

    expect(unitFinished(doneFromEvent)).to.equal(true);
    expect(unitFinished(fallbackToContext)).to.equal(true);
  });

  it('maps soft and hard errors by source contract', function() {
    expect(isSoftError(makeArgs({ event: { type: 'ERROR', source: 'speechRecognition' } }))).to.equal(true);
    expect(isHardError(makeArgs({ event: { type: 'ERROR', source: 'selectNextCard' } }))).to.equal(true);
    expect(isHardError(makeArgs({ event: { type: 'ERROR', source: 'unknown-source' } }))).to.equal(true);
  });

  it('detects question-audio payload', function() {
    expect(hasQuestionAudio(makeArgs({ context: { currentDisplay: { audioSrc: '/audio/test.mp3' } } }))).to.equal(true);
    expect(hasQuestionAudio(makeArgs({ context: { currentDisplay: { text: 'no-audio' } } }))).to.equal(false);
  });

  it('allows prepared advance for schedule and model card sessions', function() {
    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'model' } } }))).to.equal(true);
    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'schedule' } } }))).to.equal(true);
    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'video' } } }))).to.equal(false);
  });

  it('accepts only configured video checkpoint mappings', function() {
    Session.set('isVideoSession', true);
    Session.set('videoCheckpoints', {
      times: [69, 115],
      questions: [3, 7],
    });

    expect(canAcceptVideoCheckpoint(makeArgs({
      event: { type: 'VIDEO_CHECKPOINT', checkpointIndex: 0, questionIndex: 3 },
    }))).to.equal(true);
    expect(canAcceptVideoCheckpoint(makeArgs({
      event: { type: 'VIDEO_CHECKPOINT', checkpointIndex: 0, questionIndex: 7 },
    }))).to.equal(false);
    expect(canAcceptVideoCheckpoint(makeArgs({
      event: { type: 'VIDEO_CHECKPOINT', checkpointIndex: 2, questionIndex: 7 },
    }))).to.equal(false);
  });
});

