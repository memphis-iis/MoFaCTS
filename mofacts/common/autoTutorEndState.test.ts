import { expect } from 'chai';
import {
  applyAutoTutorEndReason,
  getAutoTutorHistoryAction,
  isAutoTutorEndReason,
  type AutoTutorEndState,
} from '../../learning-components/units/autotutor/AutoTutorEndState';

function createState(): AutoTutorEndState {
  return {
    completed: false,
    mastered: false,
    endReason: 'in_progress',
    stoppedByCost: false,
  };
}

describe('AutoTutor end state', function() {
  it('maps end reasons to completion, mastery, and cost-cap flags', function() {
    const state = createState();

    applyAutoTutorEndReason(state, 'mastery');
    expect(state).to.deep.equal({
      completed: true,
      mastered: true,
      endReason: 'mastery',
      stoppedByCost: false,
    });

    applyAutoTutorEndReason(state, 'cost_cap');
    expect(state).to.deep.equal({
      completed: true,
      mastered: false,
      endReason: 'cost_cap',
      stoppedByCost: true,
    });

    applyAutoTutorEndReason(state, 'in_progress');
    expect(state).to.deep.equal(createState());
  });

  it('maps explicit end states to compressed-history actions', function() {
    expect(getAutoTutorHistoryAction(createState())).to.equal('autotutor-turn');

    expect(getAutoTutorHistoryAction({
      completed: true,
      mastered: true,
      endReason: 'mastery',
      stoppedByCost: false,
    })).to.equal('autotutor-complete');

    expect(getAutoTutorHistoryAction({
      completed: true,
      mastered: false,
      endReason: 'max_turns',
      stoppedByCost: false,
    })).to.equal('autotutor-ended-max_turns');

    expect(getAutoTutorHistoryAction({
      completed: true,
      mastered: false,
      endReason: 'cost_cap',
      stoppedByCost: true,
    })).to.equal('autotutor-ended-cost_cap');
  });

  it('fails clearly when completion flags contradict the end reason', function() {
    expect(() => getAutoTutorHistoryAction({
      completed: true,
      mastered: false,
      endReason: 'in_progress',
      stoppedByCost: false,
    })).to.throw('AutoTutor completed state has invalid end reason: in_progress');
  });

  it('recognizes only declared end reasons', function() {
    expect(isAutoTutorEndReason('mastery')).to.equal(true);
    expect(isAutoTutorEndReason('timeout')).to.equal(false);
    expect(isAutoTutorEndReason(null)).to.equal(false);
  });
});
