import assert from 'node:assert/strict';
import { applyPreparedInteractionStepState } from './interactionStepAssembly';

describe('applyPreparedInteractionStepState', function() {
  it('writes the prepared current answer through the named runtime capability', function() {
    const sessionWrites: Record<string, unknown> = {};
    let runtimeCurrentAnswer: string | undefined;

    const newExperimentState = applyPreparedInteractionStepState({
      cardIndex: 0,
      whichStim: 0,
      probFunctionParameters: undefined,
      currentAnswer: 'alpha',
      originalDisplay: { text: 'Alpha?' },
      currentDisplay: { text: 'Alpha?' },
      newExperimentState: {
        originalQuestion: 'Alpha?',
        currentAnswer: 'alpha',
      },
    }, {
      setSessionValue(key, value) {
        sessionWrites[key] = value;
      },
      setCurrentAnswer(value) {
        runtimeCurrentAnswer = value;
      },
      setAlternateDisplayIndex() {},
      setOriginalQuestion() {},
    });

    assert.equal(sessionWrites.currentAnswer, 'alpha');
    assert.equal(runtimeCurrentAnswer, 'alpha');
    assert.deepEqual(newExperimentState, {
      originalQuestion: 'Alpha?',
      currentAnswer: 'alpha',
    });
  });
});
