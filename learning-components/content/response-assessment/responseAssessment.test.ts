import assert from 'node:assert/strict';
import {
  assessLearnerResponse,
  buildClozeStudy,
  displayResponseAnswer,
  type ResponseAssessmentPolicy,
} from './responseAssessment';

const basePolicy: ResponseAssessmentPolicy = {
  branchingEnabled: true,
  allowPhoneticMatching: false,
  checkOtherAnswers: false,
  editDistanceThreshold: 0,
};

function assess(overrides: Partial<Parameters<typeof assessLearnerResponse>[0]> = {}) {
  return assessLearnerResponse({
    userInput: 'Paris',
    answer: 'Paris',
    originalAnswer: 'Paris',
    displayedAnswer: '',
    policy: basePolicy,
    ...overrides,
  });
}

describe('response assessment contract', function() {
  it('assesses literal alternatives without treating them as regex syntax', function() {
    assert.deepEqual({ ...assess({ userInput: 'City of Light', answer: 'Paris|City of Light', originalAnswer: 'Paris|City of Light' }), displayAnswer: undefined }, {
      isCorrect: true,
      matchKind: 'exact',
      displayAnswer: undefined,
    });
    assert.equal(displayResponseAnswer('Paris|City of Light', true), 'Paris');
  });

  it('keeps authored branch feedback and correctness separate', function() {
    const correct = assess({
      userInput: 'four',
      answer: 'four|4~Correct branch;five~That is one too many',
      originalAnswer: 'four|4~Correct branch;five~That is one too many',
    });
    assert.equal(correct.isCorrect, true);
    assert.equal(correct.matchKind, 'branch');
    assert.equal(correct.authoredFeedback, 'Correct branch');
    const incorrect = assess({
      userInput: 'five',
      answer: 'four|4~Correct branch;five~That is one too many',
      originalAnswer: 'four|4~Correct branch;five~That is one too many',
    });
    assert.equal(incorrect.isCorrect, false);
    assert.equal(incorrect.matchKind, 'branch');
    assert.equal(incorrect.authoredFeedback, 'That is one too many');
  });

  it('supports edit-distance and phonetic policies explicitly', function() {
    assert.equal(assess({
      userInput: 'Pari',
      policy: { ...basePolicy, editDistanceThreshold: 0.75 },
    }).matchKind, 'close');
    assert.equal(assess({
      userInput: 'Smith',
      answer: 'Smyth',
      originalAnswer: 'Smyth',
      policy: {
        ...basePolicy,
        editDistanceThreshold: 0.99,
        allowPhoneticMatching: true,
        phoneticMatch: () => true,
      },
    }).matchKind, 'phonetic');
  });

  it('rejects a close match that exactly names another authored answer', function() {
    const result = assess({
      userInput: 'Part',
      policy: {
        ...basePolicy,
        editDistanceThreshold: 0.7,
        checkOtherAnswers: true,
        otherAnswers: ['Paris', 'Part'],
      },
    });
    assert.equal(result.isCorrect, false);
    assert.equal(result.matchKind, 'incorrect');
  });

  it('preserves case and accent policy and cloze rendering', function() {
    assert.equal(assess({ userInput: 'cafe', answer: 'Café', originalAnswer: 'Café' }).isCorrect, true);
    assert.equal(assess({
      userInput: 'cafe',
      answer: 'Café',
      originalAnswer: 'Café',
      policy: { ...basePolicy, normalization: { accentSensitive: true } },
    }).isCorrect, false);
    assert.equal(buildClozeStudy('The answer is ___.', 'Paris|City of Light', true), 'The answer is Paris.');
  });
});
