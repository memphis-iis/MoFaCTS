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
});
