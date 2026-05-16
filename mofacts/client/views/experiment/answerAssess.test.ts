import { expect } from 'chai';
import { Answers } from './answerAssess';

describe('answerAssess', function() {
  it('matches answers without caring about accent marks', async function() {
    const result = await Answers.answerIsCorrect(
      'él',
      'el',
      'el',
      '',
      { lfparameter: 0 }
    );

    expect(result.isCorrect).to.equal(true);
  });

  it('does not include the correct answer in the default incorrect feedback message', async function() {
    const result = await Answers.answerIsCorrect(
      'Lyon',
      'Paris',
      'Paris',
      '',
      { lfparameter: 0 }
    );

    expect(result.isCorrect).to.equal(false);
    expect(result.matchText).to.equal('Incorrect.');
  });
});
