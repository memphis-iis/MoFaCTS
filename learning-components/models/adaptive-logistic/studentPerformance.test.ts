import assert from 'node:assert/strict';
import {
  applyAnswerToStudentPerformance,
  type StudentPerformanceState,
} from './studentPerformance';

const initial: StudentPerformanceState = {
  count: 0,
  numCorrect: 0,
  numIncorrect: 0,
  percentCorrect: 'N/A',
  stimsSeen: '1',
  totalStimCount: '2',
  totalTime: 0,
  totalTimeDisplay: '0.0',
};

describe('student performance arithmetic', function() {
  it('updates scored answer totals without mutating the input', function() {
    const updated = applyAnswerToStudentPerformance(initial, true, 30000, 'd');
    assert.deepEqual(updated, {
      ...initial,
      count: 1,
      numCorrect: 1,
      percentCorrect: '100.00%',
      stimsSeen: 1,
      totalStimCount: 2,
      totalTime: 30000,
      totalTimeDisplay: '0.5',
    });
    assert.equal(initial.count, 0);
  });

  it('adds study practice time without scoring it', function() {
    const study = applyAnswerToStudentPerformance(initial, false, 15000, 's');
    assert.equal(study.count, 1);
    assert.equal(study.numIncorrect, 0);
    assert.equal(study.totalTimeDisplay, '0.3');
  });
});
