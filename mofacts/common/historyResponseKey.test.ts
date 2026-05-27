import { expect } from 'chai';
import {
  getHistoryCorrectAnswer,
  getHistoryResponseKey,
} from '../../learning-components/content/response-normalization/historyResponseKey';
import {
  getHistoryCorrectAnswer as getAppHistoryCorrectAnswer,
  getHistoryResponseKey as getAppHistoryResponseKey,
} from './history/historyResponseKey';

describe('history response key normalization', function() {
  it('uses the first tilde-delimited answer variant for learning-session resume matching', function() {
    expect(getHistoryCorrectAnswer(' Alpha ~ Beta ')).to.equal('Alpha ');
    expect(getHistoryResponseKey(
      ' Alpha ~ Beta ',
      (answer) => ` ${answer} `,
      (answer) => answer.replace(/ /g, '').toLowerCase(),
    )).to.equal('alpha');
  });

  it('keeps the app compatibility facade aligned with the component-owned helper', function() {
    const rawResponse = ' answer one ~ answer two ';
    const display = (answer: string) => answer.toUpperCase();
    const normalize = (answer: string) => answer.replace(/ /g, '').toLowerCase();

    expect(getAppHistoryCorrectAnswer(rawResponse)).to.equal(getHistoryCorrectAnswer(rawResponse));
    expect(getAppHistoryResponseKey(rawResponse, display, normalize))
      .to.equal(getHistoryResponseKey(rawResponse, display, normalize));
  });
});
