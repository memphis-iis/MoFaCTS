import assert from 'node:assert/strict';
import { evaluateSparcTrialDisplayResponse } from './sparcTrialDisplayEvaluation';

describe('evaluateSparcTrialDisplayResponse', function() {
  it('evaluates path-scoped SAI intents using the best active path', function() {
    const result = evaluateSparcTrialDisplayResponse({
      display: {
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
      result: {
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

    assert.deepEqual(result, {
      isCorrect: true,
      matchText: '11111',
      sparcPath: 'common-denominator-24',
    });
  });

  it('evaluates dependency intents with accepted SAI input variants', function() {
    const result = evaluateSparcTrialDisplayResponse({
      display: {
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
      result: {
        timestamp: 1,
        submittedNodes: {
          resultValue: '1.06E-02',
        },
      },
    });

    assert.deepEqual(result, {
      isCorrect: true,
      matchText: '1',
    });
  });

  it('returns authored feedback matches through behaviorRefs', function() {
    const result = evaluateSparcTrialDisplayResponse({
      display: {
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
      result: {
        timestamp: 1,
        submittedNodes: {
          firstDen: '10',
        },
      },
    });

    assert.deepEqual(result, {
      isCorrect: false,
      matchText: '0',
      sparcFeedbackId: 'added-denominators',
      sparcFeedbackMessage: 'Choose a denominator that both denominators divide into.',
    });
  });

  it('preserves unsupported grading mode errors', function() {
    assert.throws(
      () => evaluateSparcTrialDisplayResponse({
        display: {
          response: {
            gradingMode: 'unknown-mode',
          },
        },
        result: {
          timestamp: 1,
          submittedNodes: {},
        },
      }),
      /\[SPARC\] Unsupported grading mode: unknown-mode/,
    );
  });
});
