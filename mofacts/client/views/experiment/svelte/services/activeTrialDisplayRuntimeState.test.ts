import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  getAlternateDisplayIndex,
  getButtonList,
  getCurrentAnswer,
  getCurrentDisplay,
  getOriginalQuestion,
  isButtonTrial,
  resetActiveTrialDisplayRuntimeState,
  setAlternateDisplayIndex,
  setButtonList,
  setButtonTrial,
  setCurrentAnswer,
  setCurrentDisplay,
  setOriginalQuestion,
} from './activeTrialDisplayRuntimeState';

describe('activeTrialDisplayRuntimeState', function() {
  beforeEach(function() {
    resetActiveTrialDisplayRuntimeState();
  });

  afterEach(function() {
    resetActiveTrialDisplayRuntimeState();
  });

  it('owns active answer and mirrors currentAnswer to Session', function() {
    setCurrentAnswer('alpha');

    expect(getCurrentAnswer()).to.equal('alpha');
    expect(Session.get('currentAnswer')).to.equal('alpha');
  });

  it('owns alternate display index, original question, and current display', function() {
    const display = { text: 'Prompt' };

    setAlternateDisplayIndex(2);
    setOriginalQuestion('Prompt?');
    setCurrentDisplay(display);

    expect(getAlternateDisplayIndex()).to.equal(2);
    expect(Session.get('alternateDisplayIndex')).to.equal(2);
    expect(getOriginalQuestion()).to.equal('Prompt?');
    expect(getCurrentDisplay()).to.equal(display);
  });

  it('owns button trial display state', function() {
    expect(isButtonTrial()).to.equal(false);
    expect(getButtonList()).to.deep.equal([]);

    setButtonTrial(true);
    setButtonList(['a', 'b']);

    expect(isButtonTrial()).to.equal(true);
    expect(getButtonList()).to.deep.equal(['a', 'b']);

    resetActiveTrialDisplayRuntimeState();

    expect(isButtonTrial()).to.equal(false);
    expect(getButtonList()).to.deep.equal([]);
  });
});
