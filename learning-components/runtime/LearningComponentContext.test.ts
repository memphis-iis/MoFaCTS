import assert from 'node:assert/strict';
import {
  createLearningComponentRuntimeContext,
  getLearningComponentCapabilitySet,
} from './LearningComponentContext';

describe('LearningComponentContext capabilities', function() {
  it('requires card-state runtimes to expose question index updates', function() {
    assert.throws(
      () => getLearningComponentCapabilitySet({
        cardState: {} as never,
      }),
      /Runtime capability "cardState" is missing required functions: setQuestionIndex/,
    );
  });

  it('declares card-state capability when the unit state runtime shape is present', function() {
    const context = createLearningComponentRuntimeContext({
      cardState: {
        setQuestionIndex() {},
      },
    });

    assert.equal(context.capabilities.has('card-state'), true);
  });

  it('requires adaptive-model runtimes to expose model-practice update application', function() {
    assert.throws(
      () => getLearningComponentCapabilitySet({
        adaptiveModel: {} as never,
      }),
      /Runtime capability "adaptiveModel" is missing required functions: applyModelPracticeUpdate, queryModelPracticeState/,
    );
  });

  it('declares adaptive-model capability when the model-practice runtime shape is present', function() {
    const context = createLearningComponentRuntimeContext({
      adaptiveModel: {
        applyModelPracticeUpdate() {
          return {
            record: {},
          };
        },
        queryModelPracticeState() {
          return undefined;
        },
      },
    });

    assert.equal(context.capabilities.has('adaptive-model'), true);
  });
});
