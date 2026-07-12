import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  beginLearningAttempt,
  clearCurrentLearningAttemptId,
  requireCurrentLearningAttemptId,
} from './attemptIdentity';

describe('learning attempt identity', function() {
  afterEach(function() {
    clearCurrentLearningAttemptId();
  });

  it('creates one explicit attempt id and retains it across card remounts', function() {
    const first = beginLearningAttempt('tdf-a', Date.UTC(2026, 0, 2, 3, 4, 5));
    const second = beginLearningAttempt('tdf-a', Date.UTC(2026, 0, 2, 4, 5, 6));

    expect(first).to.equal('2026-01-02T03:04:05.000Z tdf-a');
    expect(second).to.equal(first);
    expect(requireCurrentLearningAttemptId()).to.equal(first);
  });

  it('fails clearly when attempt identity has not been initialized', function() {
    Session.set('currentLearningAttemptId', undefined);
    expect(() => requireCurrentLearningAttemptId())
      .to.throw('[Learning Attempt] currentLearningAttemptId is not initialized');
  });
});
