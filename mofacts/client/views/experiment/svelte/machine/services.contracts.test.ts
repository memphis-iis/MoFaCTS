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
import {
  clearSparcRuntimeState,
  rememberSparcRuntimeHistoryRecord,
} from '../services/sparcRuntimeState';

describe('machine services contracts', function() {
  afterEach(function() {
    clearSparcRuntimeState();
  });

  it('exposes the expected actor map keys used by contentRuntimeMachine', function() {
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

  it('passes accent-sensitive delivery settings into answer evaluation', async function() {
    const result = await evaluateAnswerService({
      userAnswer: 'corazon',
      currentAnswer: 'corazón',
      originalAnswer: 'corazón',
      setspec: { lfparameter: 0 },
      deliverySettings: {
        accentSensitive: true,
      },
    });

    expect(result).to.deep.equal({
      isCorrect: false,
      matchText: 'Incorrect.',
    });
  });

  it('delegates SPARC intent evaluation and preserves the machine payload shape', async function() {
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

  it('evaluates SPARC production-rule classifications and messages through the unit engine', async function() {
    const priorRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      userId: 'user-1',
      levelUnit: 2,
      sparc: {
        pageKey: 'sparc-fractions-addition',
        sourceAddress: {
          pageKey: 'sparc-fractions-addition',
          nodeId: 'root',
        },
      },
    };
    rememberSparcRuntimeHistoryRecord(priorRecord);

    const result = await evaluateAnswerService({
      tdfId: 'tdf-1',
      userId: 'user-1',
      unitId: 2,
      engine: {
        evaluateSparcTrialDisplayProductionRuleEvents(params: unknown) {
          expect(params).to.have.nested.property('pageKey', 'sparc-fractions-addition');
          expect(params).to.have.deep.property('priorHistoryRecords', [priorRecord]);
          return {
            document: { id: 'sparc-fractions-addition' },
            events: [],
            evaluations: [{
              execution: { firings: [], facts: [], cycles: 0 },
              transition: {
                writes: [{
                  target: {
                    pageKey: 'sparc-fractions-addition',
                    nodeId: 'node-feedback',
                  },
                  key: 'message',
                  value: 'Use a common denominator before adding numerators.',
                }],
              },
            }],
            classifications: ['buggy'],
            messages: [{
              messageType: 'buggy',
              text: 'Use a common denominator before adding numerators.',
            }],
            credits: [],
          };
        },
      },
      currentDisplay: {
        pageKey: 'sparc-fractions-addition',
        nodes: [],
        productionRules: [{
          id: 'fractions.buggy-premature-add-numerators',
          when: [],
          then: [],
        }],
      },
      sparcResult: {
        timestamp: 1,
        submittedNodes: {
          'node-sum-result-top': '2',
        },
      },
    });

    expect(result).to.deep.equal({
      isCorrect: false,
      matchText: 'Use a common denominator before adding numerators.',
      sparcNodeValues: {
        'node-feedback': 'Use a common denominator before adding numerators.',
      },
      sparcFeedbackMessage: 'Use a common denominator before adding numerators.',
      sparcFeedbackType: 'buggy',
      sparcClassification: 'buggy',
    });
  });

  it('requires SPARC engine production-rule evaluation support for production-rule displays', async function() {
    let rejectionMessage = '';

    try {
      await evaluateAnswerService({
        engine: {},
        currentDisplay: {
          pageKey: 'sparc-fractions-addition',
          nodes: [],
          productionRules: [{
            id: 'fractions.complete-reduced-path',
            when: [],
            then: [],
          }],
        },
        sparcResult: {
          timestamp: 1,
          submittedNodes: {
            'node-done-button': '-1',
          },
        },
      });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
    }

    expect(rejectionMessage).to.equal('[SPARC] Production-rule display requires SPARC session engine evaluation support');
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

