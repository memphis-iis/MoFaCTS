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

  it('can require accent-sensitive matching when requested', async function() {
    const result = await Answers.answerIsCorrect(
      'corazon',
      'corazón',
      'corazón',
      '',
      { lfparameter: 0 },
      { accentSensitive: true }
    );

    expect(result.isCorrect).to.equal(false);
  });

  it('matches non-Latin responses exactly after Unicode normalization', async function() {
    const result = await Answers.answerIsCorrect(
      'हृदय',
      'हृदय',
      'हृदय',
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

  it('uses only the first pipe-delimited answer for learner-facing display', function() {
    expect(Answers.getDisplayAnswerText('Choong Moo one|Choong Moo 1')).to.equal('Choong Moo one');
  });

  it('uses only the first pipe-delimited answer in cloze study text', function() {
    expect(Answers.clozeStudy('Practice ___ now.', 'Choong Moo one|Choong Moo 1'))
      .to.equal('Practice Choong Moo one now.');
  });

  it('still matches pipe-delimited alternatives during answer evaluation', async function() {
    const result = await Answers.answerIsCorrect(
      'Choong Moo 1',
      'Choong Moo one|Choong Moo 1',
      'Choong Moo one|Choong Moo 1',
      '',
      { lfparameter: 0 }
    );

    expect(result.isCorrect).to.equal(true);
  });

  it('matches hyphenated pipe-delimited alternatives during answer evaluation', async function() {
    const result = await Answers.answerIsCorrect(
      'Hwa-Rang one',
      'Hwa-Rang one|Hwa-Rang 1',
      'Hwa-Rang one|Hwa-Rang 1',
      '',
      { lfparameter: 0 }
    );

    expect(result.isCorrect).to.equal(true);
  });
});
