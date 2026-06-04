import { expect } from 'chai';
import { findCueLeaks, forbiddenAnswerTerms } from './aiContentCueValidation';
import type { AiLessonOutput } from './aiContentTypes';

describe('aiContentCueValidation', function() {
  it('flags whole answer words in learner-visible prompt text', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'A bright blue jay with a crest and bold wings.' },
        response: { correctResponse: 'Blue Jay' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['blue', 'jay']);
  });

  it('flags partial answer-word leakage without requiring the full answer phrase', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'A bright yellow songbird found near wet thickets.' },
        response: { correctResponse: 'Yellow Warbler' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['yellow']);
  });

  it('matches only whole normalized tokens so CO2 does not leak numeric answer 2', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'How many CO2 molecules are released per turn of the cycle?' },
        response: { correctResponse: '2' },
      }],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });

  it('supports explicit allowed terms as an escape hatch', function() {
    expect(forbiddenAnswerTerms('Red-bellied Woodpecker', { allowedTerms: ['red'] }))
      .to.deep.equal(['bellied', 'woodpecker']);
  });
});
