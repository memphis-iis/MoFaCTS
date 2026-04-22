import { expect } from 'chai';
import { EVENTS, SUPPORTED_TRIAL_TYPES, TRIAL_TYPES } from './constants';

describe('machine constants contracts', function() {
  it('keeps supported trial type set aligned with force-correct/timed-prompt flow', function() {
    expect(SUPPORTED_TRIAL_TYPES.has(TRIAL_TYPES.STUDY)).to.equal(true);
    expect(SUPPORTED_TRIAL_TYPES.has(TRIAL_TYPES.DRILL)).to.equal(true);
    expect(SUPPORTED_TRIAL_TYPES.has(TRIAL_TYPES.TEST)).to.equal(true);
    expect(SUPPORTED_TRIAL_TYPES.has(TRIAL_TYPES.FORCE_CORRECT)).to.equal(true);
    expect(SUPPORTED_TRIAL_TYPES.has(TRIAL_TYPES.TIMED_PROMPT)).to.equal(true);
  });

  it('keeps lifecycle/video event names stable for machine payload contracts', function() {
    expect(EVENTS.START).to.equal('START');
    expect(EVENTS.SUBMIT).to.equal('SUBMIT');
    expect(EVENTS.SKIP_STUDY).to.equal('SKIP_STUDY');
    expect(EVENTS.INCOMING_READY).to.equal('INCOMING_READY');
    expect(EVENTS.VIDEO_CHECKPOINT).to.equal('VIDEO_CHECKPOINT');
    expect(EVENTS.VIDEO_ENDED).to.equal('VIDEO_ENDED');
    expect(EVENTS.VIDEO_CONTINUE).to.equal('VIDEO_CONTINUE');
    expect(EVENTS.ERROR).to.equal('ERROR');
  });
});

