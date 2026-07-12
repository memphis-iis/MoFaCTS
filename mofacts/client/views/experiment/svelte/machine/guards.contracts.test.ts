import { expect } from 'chai';
import { Session } from 'meteor/session';
import { resetAudioState, setAudioPromptMode } from '../../../../lib/state/audioState';
import {
  isSupportedTrialType,
  isUnsupportedTrialType,
  needsForceCorrectPrompt,
  isCorrectForceCorrection,
  needsFeedback,
  noFeedback,
  unitFinished,
  canEngineUsePreparedAdvance,
  canUsePreparedAdvance,
  canAcceptVideoCheckpoint,
  isSoftError,
  isHardError,
  hasQuestionAudio,
  feedbackReadyForTts,
  feedbackReadyWithoutTts,
  isVideoSession,
  ttsEnabled,
  trialDisplaySuppressesStandardTimeout,
  trialRevealStarted,
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
    resetAudioState();
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

  it('lets self-hosted H5P own feedback inside the activity frame', function() {
    const h5pDrill = makeArgs({
      context: {
        testType: 'd',
        currentDisplay: {
          h5p: {
            sourceType: 'self-hosted',
            contentId: 'h5p-tester-multichoice-001',
            packageAssetId: 'multiple-choice-713.h5p',
            library: 'H5P.MultiChoice 1.16',
            completionPolicy: 'xapi-completed',
            scorePolicy: 'record-only',
          },
        },
      },
    });

    expect(needsFeedback(h5pDrill)).to.equal(false);
    expect(noFeedback(h5pDrill)).to.equal(true);
  });

  it('suppresses the standard response timeout for H5P and production-rule SPARC displays', function() {
    const h5pDisplay = makeArgs({
      context: {
        currentDisplay: {
          h5p: {
            sourceType: 'self-hosted',
            contentId: 'h5p-tester-multichoice-001',
            packageAssetId: 'multiple-choice-713.h5p',
            library: 'H5P.MultiChoice 1.16',
          },
        },
      },
    });
    const sparcProductionRuleDisplay = makeArgs({
      context: {
        currentDisplay: {
          pageKey: 'sparc-fractions-addition',
          nodes: [],
          productionRules: [],
        },
      },
    });
    const sparcPlainDisplay = makeArgs({
      context: {
        currentDisplay: {
          pageKey: 'sparc-static-display',
          nodes: [],
        },
      },
    });

    expect(trialDisplaySuppressesStandardTimeout(h5pDisplay)).to.equal(true);
    expect(trialDisplaySuppressesStandardTimeout(sparcProductionRuleDisplay)).to.equal(true);
    expect(trialDisplaySuppressesStandardTimeout(sparcPlainDisplay)).to.equal(false);
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

  it('routes generated question TTS only when spoken audio mode allows questions', function() {
    setAudioPromptMode('silent');
    expect(ttsEnabled(makeArgs())).to.equal(false);

    setAudioPromptMode('feedback');
    expect(ttsEnabled(makeArgs())).to.equal(false);

    setAudioPromptMode('question');
    expect(ttsEnabled(makeArgs())).to.equal(true);

    setAudioPromptMode('all');
    expect(ttsEnabled(makeArgs())).to.equal(true);
  });

  it('routes generated feedback TTS only when spoken audio mode allows feedback', function() {
    const args = makeArgs({
      context: {
        feedbackRevealStarted: true,
        feedbackSuppressed: false,
        feedbackText: 'Correct.',
      },
    });

    setAudioPromptMode('silent');
    expect(feedbackReadyForTts(args)).to.equal(false);
    expect(feedbackReadyWithoutTts(args)).to.equal(true);

    setAudioPromptMode('question');
    expect(feedbackReadyForTts(args)).to.equal(false);
    expect(feedbackReadyWithoutTts(args)).to.equal(true);

    setAudioPromptMode('feedback');
    expect(feedbackReadyForTts(args)).to.equal(true);
    expect(feedbackReadyWithoutTts(args)).to.equal(false);

    setAudioPromptMode('all');
    expect(feedbackReadyForTts(args)).to.equal(true);
    expect(feedbackReadyWithoutTts(args)).to.equal(false);
  });

  it('treats a positive trialStart as the response-timeout reveal gate', function() {
    expect(trialRevealStarted(makeArgs({ context: { timestamps: { trialStart: 0 } } }))).to.equal(false);
    expect(trialRevealStarted(makeArgs({ context: { timestamps: { trialStart: 1234 } } }))).to.equal(true);
  });

  it('allows prepared advance for schedule and model card sessions', function() {
    expect(canEngineUsePreparedAdvance({ unitType: 'model' })).to.equal(true);
    expect(canEngineUsePreparedAdvance({ unitType: 'schedule' })).to.equal(true);
    expect(canEngineUsePreparedAdvance({ unitType: 'video' })).to.equal(false);
    expect(canEngineUsePreparedAdvance(null)).to.equal(false);

    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'model' } } }))).to.equal(true);
    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'schedule' } } }))).to.equal(true);
    expect(canUsePreparedAdvance(makeArgs({ context: { engine: { unitType: 'video' } } }))).to.equal(false);
  });

  it('uses the session surface adapter for machine video-session guards', function() {
    Session.set('currentTdfUnit', { learningsession: {} });
    expect(isVideoSession(makeArgs({ context: { deliverySettings: { isVideoSession: true } } }))).to.equal(false);
    expect(canUsePreparedAdvance(makeArgs({
      context: {
        engine: { unitType: 'model' },
        deliverySettings: { isVideoSession: true },
      },
    }))).to.equal(true);

    Session.set('isVideoSession', true);
    expect(isVideoSession(makeArgs())).to.equal(false);

    Session.set('currentTdfUnit', { videosession: {} });
    expect(isVideoSession(makeArgs())).to.equal(true);
  });

  it('accepts only configured video checkpoint mappings', function() {
    Session.set('currentTdfUnit', { videosession: {} });
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

