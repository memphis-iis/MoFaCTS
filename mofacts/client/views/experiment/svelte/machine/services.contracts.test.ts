import { expect } from 'chai';
import {
  createServices,
  getFeedbackTimeoutRemainingMs,
  getMainTimeoutRemainingMs,
  readyPromptDelayService,
  prestimulusDelayService,
  questionAudioGateService,
  evaluateAnswerService,
} from './services';

describe('machine services contracts', function() {
  it('exposes the expected actor map keys used by cardMachine', function() {
    const services = createServices();

    expect(services).to.have.property('historyLoggingService');
    expect(services).to.have.property('experimentStateService');
    expect(services).to.have.property('selectCardService');
    expect(services).to.have.property('updateEngineService');
    expect(services).to.have.property('prepareIncomingTrialService');
    expect(services).to.have.property('ttsService');
    expect(services).to.have.property('speechRecognitionService');
    expect(services).to.have.property('evaluateAnswerService');
    expect(services).to.have.property('readyPromptDelayService');
    expect(services).to.have.property('prestimulusDelayService');
    expect(services).to.have.property('questionAudioGateService');
  });

  it('readyPromptDelayService returns delay contract payload', async function() {
    const result = await readyPromptDelayService({
      deliverySettings: { readyPromptStringDisplayTime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('prestimulusDelayService returns delay contract payload', async function() {
    const result = await prestimulusDelayService({
      deliverySettings: { prestimulusdisplaytime: '0' },
    });

    expect(result).to.deep.equal({ delayMs: 0 });
  });

  it('questionAudioGateService skips when no audio payload exists', async function() {
    const result = await questionAudioGateService({
      currentDisplay: { text: 'no audio' },
      deliverySettings: {},
    });

    expect(result).to.deep.equal({ skipped: true });
  });

  it('evaluates H5P correctness from part outcomes rather than the completion placeholder', async function() {
    const result = await evaluateAnswerService({
      userAnswer: '__H5P_COMPLETED__',
      currentAnswer: '__H5P_COMPLETED__',
      h5pResult: {
        contentId: 'activity-1',
        batchId: 'batch-1',
        completed: true,
        events: [
          { eventIndex: 0, correct: true },
          { eventIndex: 1, correct: false },
        ],
      },
    });

    expect(result).to.deep.equal({
      isCorrect: false,
      matchText: '10',
    });
  });

  it('evaluates SPARC path-scoped SAI intents using the best active path', async function() {
    const result = await evaluateAnswerService({
      currentDisplay: {
        response: {
          gradingMode: 'sai-path-intent',
          evaluation: {
            trimWhitespace: true,
            mathNormalize: true,
          },
          intentByPath: [{
            path: 'lcd-12',
            intentByNode: [
              { node: 'firstDen', expected: '12', type: 'numeric' },
              { node: 'answerNum', expected: '5', type: 'numeric' },
              { node: 'answerDen', expected: '12', type: 'numeric' },
            ],
          }, {
            path: 'common-denominator-24',
            intentByNode: [
              { node: 'firstDen', expected: '24', type: 'numeric' },
              { node: 'answerNum', expected: '10', type: 'numeric' },
              { node: 'answerDen', expected: '24', type: 'numeric' },
              { node: 'finalNum', expected: '5', type: 'numeric' },
              { node: 'finalDen', expected: '12', type: 'numeric' },
            ],
          }],
        },
      },
      sparcResult: {
        timestamp: 1,
        submittedNodes: {
          firstDen: '24',
          answerNum: '10',
          answerDen: '24',
          finalNum: '5',
          finalDen: '12',
        },
      },
    });

    expect(result).to.deep.equal({
      isCorrect: true,
      matchText: '11111',
      sparcPath: 'common-denominator-24',
    });
  });

  it('evaluates SPARC dependency intents with accepted SAI input variants', async function() {
    const result = await evaluateAnswerService({
      currentDisplay: {
        response: {
          gradingMode: 'sai-dependency-intent',
          scoredNodes: ['resultValue'],
          evaluation: {
            trimWhitespace: true,
            allowScientificNotation: true,
          },
          intentByNode: [{
            node: 'resultValue',
            expected: '0.0106',
            acceptedValues: ['0.0106', '.0106', '1.06E-02'],
            type: 'scientific',
          }],
        },
      },
      sparcResult: {
        timestamp: 1,
        submittedNodes: {
          resultValue: '1.06E-02',
        },
      },
    });

    expect(result).to.deep.equal({
      isCorrect: true,
      matchText: '1',
    });
  });

  it('returns authored SPARC feedback matches through behaviorRefs', async function() {
    const result = await evaluateAnswerService({
      currentDisplay: {
        behaviorRefs: {
          firstDenConv: 'firstDen',
        },
        behavior: {
          feedback: [{
            id: 'added-denominators',
            when: {
              selection: 'firstDenConv',
              action: 'UpdateTextArea',
              input: '10',
            },
            message: 'Choose a denominator that both denominators divide into.',
          }],
        },
        response: {
          gradingMode: 'sai-dependency-intent',
          scoredNodes: ['firstDen'],
          evaluation: {
            trimWhitespace: true,
            mathNormalize: true,
          },
          intentByNode: [{
            node: 'firstDen',
            expected: '12',
            type: 'numeric',
          }],
        },
      },
      sparcResult: {
        timestamp: 1,
        submittedNodes: {
          firstDen: '10',
        },
      },
    });

    expect(result).to.deep.equal({
      isCorrect: false,
      matchText: '0',
      sparcFeedbackId: 'added-denominators',
      sparcFeedbackMessage: 'Choose a denominator that both denominators divide into.',
    });
  });

  it('includes fade-out lead time in study countdown envelopes', function() {
    const remaining = getFeedbackTimeoutRemainingMs({
      testType: 's',
      deliverySettings: { purestudy: '30000' },
    }, 28000, 2000);

    expect(remaining).to.equal(0);
  });

  it('includes fade-out lead time in regular feedback countdown envelopes', function() {
    const remaining = getFeedbackTimeoutRemainingMs({
      testType: 'd',
      feedbackTimeoutMs: 10000,
    }, 7000, 2000);

    expect(remaining).to.equal(1000);
  });

  it('anchors response timeout to reveal start until input activity resets it', function() {
    const fromReveal = getMainTimeoutRemainingMs({
      testType: 'd',
      deliverySettings: { drill: '10000' },
      timestamps: { trialStart: 1000 },
    }, 4000);
    const fromReset = getMainTimeoutRemainingMs({
      testType: 'd',
      deliverySettings: { drill: '10000' },
      timestamps: { trialStart: 1000, timeoutStart: 3500 },
    }, 4000);

    expect(fromReveal).to.equal(7000);
    expect(fromReset).to.equal(9500);
  });
});

