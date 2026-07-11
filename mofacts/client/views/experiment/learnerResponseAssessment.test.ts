import { expect } from 'chai';
import {
  assessAppLearnerResponse,
  buildClozeStudyText,
  getDisplayAnswerText,
} from './learnerResponseAssessment';

function answerIsCorrect(
  userInput: string,
  answer: string,
  originalAnswer: string,
  displayedAnswer: string,
  setspec: Record<string, unknown>,
  normalization: { caseSensitive?: boolean; accentSensitive?: boolean } = {},
) {
  return assessAppLearnerResponse({
    userInput,
    answer,
    originalAnswer,
    displayedAnswer,
    editDistanceThreshold: setspec.lfparameter,
    branchingEnabled: false,
    allowPhoneticMatching: false,
    checkOtherAnswers: false,
    otherAnswers: [],
    normalization,
  });
}

describe('learnerResponseAssessment', function() {
  it('accepts exact learner responses for every initial target language', async function() {
    const cases = [
      ['heart', 'heart'],
      ['中文', '中文'],
      ['हृदय', 'हृदय'],
      ['corazón', 'corazón'],
      ['قلب', 'قلب'],
      ['élève', 'élève'],
      ['বাংলা', 'বাংলা'],
      ['ação', 'ação'],
      ['bahasa', 'bahasa'],
      ['دل', 'دل'],
    ] as const;

    for (const [learnerAnswer, authoredAnswer] of cases) {
      const result = await answerIsCorrect(
        learnerAnswer,
        authoredAnswer,
        authoredAnswer,
        '',
        { lfparameter: 0 },
      );

      expect(result.isCorrect).to.equal(true);
    }
  });

  it('matches answers without caring about accent marks', async function() {
    const result = await answerIsCorrect('él', 'el', 'el', '', { lfparameter: 0 });
    expect(result.isCorrect).to.equal(true);
  });

  it('matches composed and decomposed accents through answer assessment', async function() {
    const result = await answerIsCorrect('cafe\u0301', 'café', 'café', '', { lfparameter: 0 });
    expect(result.isCorrect).to.equal(true);
  });

  it('can require accent-sensitive matching when requested', async function() {
    const result = await answerIsCorrect(
      'corazon',
      'corazón',
      'corazón',
      '',
      { lfparameter: 0 },
      { accentSensitive: true },
    );
    expect(result.isCorrect).to.equal(false);
  });

  it('matches non-Latin responses exactly after Unicode normalization', async function() {
    const result = await answerIsCorrect('हृदय', 'हृदय', 'हृदय', '', { lfparameter: 0 });
    expect(result.isCorrect).to.equal(true);
  });

  it('matches Mandarin Chinese pipe-delimited alternatives without whitespace assumptions', async function() {
    const result = await answerIsCorrect('汉语', '中文|汉语', '中文|汉语', '', { lfparameter: 0 });
    expect(result.isCorrect).to.equal(true);
  });

  it('matches Bengali and right-to-left responses as literal Unicode text', async function() {
    const bengali = await answerIsCorrect('বাংলা', 'বাংলা', 'বাংলা', '', { lfparameter: 0 });
    const arabic = await answerIsCorrect('قلب', 'قلب', 'قلب', '', { lfparameter: 0 });
    const urdu = await answerIsCorrect('دل', 'دل', 'دل', '', { lfparameter: 0 });

    expect(bengali.isCorrect).to.equal(true);
    expect(arabic.isCorrect).to.equal(true);
    expect(urdu.isCorrect).to.equal(true);
  });

  it('supports accent policy for Portuguese answers', async function() {
    const accentInsensitive = await answerIsCorrect('acao', 'ação', 'ação', '', { lfparameter: 0 });
    const accentSensitive = await answerIsCorrect(
      'acao',
      'ação',
      'ação',
      '',
      { lfparameter: 0 },
      { accentSensitive: true },
    );

    expect(accentInsensitive.isCorrect).to.equal(true);
    expect(accentSensitive.isCorrect).to.equal(false);
  });

  it('does not include the correct answer in the default incorrect feedback message', async function() {
    const result = await answerIsCorrect('Lyon', 'Paris', 'Paris', '', { lfparameter: 0 });
    expect(result.isCorrect).to.equal(false);
    expect(result.matchText).to.equal('Incorrect.');
  });

  it('uses only the first pipe-delimited answer for learner-facing display', function() {
    expect(getDisplayAnswerText('Choong Moo one|Choong Moo 1')).to.equal('Choong Moo one');
  });

  it('uses only the first pipe-delimited answer in cloze study text', function() {
    expect(buildClozeStudyText('Practice ___ now.', 'Choong Moo one|Choong Moo 1'))
      .to.equal('Practice Choong Moo one now.');
  });

  it('still matches pipe-delimited alternatives during answer evaluation', async function() {
    const result = await answerIsCorrect(
      'Choong Moo 1',
      'Choong Moo one|Choong Moo 1',
      'Choong Moo one|Choong Moo 1',
      '',
      { lfparameter: 0 },
    );
    expect(result.isCorrect).to.equal(true);
  });

  it('matches hyphenated pipe-delimited alternatives during answer evaluation', async function() {
    const result = await answerIsCorrect(
      'Hwa-Rang one',
      'Hwa-Rang one|Hwa-Rang 1',
      'Hwa-Rang one|Hwa-Rang 1',
      '',
      { lfparameter: 0 },
    );
    expect(result.isCorrect).to.equal(true);
  });
});
