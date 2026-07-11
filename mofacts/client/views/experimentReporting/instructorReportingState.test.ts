import { expect } from 'chai';
import {
  findAssignmentForTdf,
  getReportingTotals,
  normalizePerformanceBuckets,
  resolveSelectedDueDate,
  toDateInputValue,
  toDateMillis,
} from './instructorReportingState';

describe('instructorReportingState', function() {
  it('normalizes class performance method buckets', function() {
    const buckets = normalizePerformanceBuckets([
      [{ userId: 'u1', username: 'Ada', count: 2, percentCorrect: '50.00%', totalTimeMins: '1.000' }],
      [{ userId: 'u2', username: 'Ben', count: 1, percentCorrect: '100.00%', totalTimeMins: '0.500' }],
    ]);

    expect(buckets.met.map((row) => row.userId)).to.deep.equal(['u1']);
    expect(buckets.notMet.map((row) => row.userId)).to.deep.equal(['u2']);
  });

  it('finds assignment due dates before TDF fallback dates', function() {
    const assignment = findAssignmentForTdf({
      course1: [{ assignmentId: 'a1', TDFId: 'tdf1', dueAt: '2026-02-03' }],
    }, 'course1', 'tdf1');
    const fallbackTdf = {
      _id: 'tdf1',
      content: { tdfs: { tutor: { setspec: { duedate: '2026-03-04' } } } },
    };

    expect(resolveSelectedDueDate(assignment, fallbackTdf)).to.equal('2026-02-03');
    expect(resolveSelectedDueDate(null, fallbackTdf)).to.equal('2026-03-04');
  });

  it('formats date input values and rejects invalid dates', function() {
    expect(toDateInputValue('2026-05-06')).to.equal('2026-05-06');
    expect(toDateMillis('not a date')).to.equal(false);
    expect(toDateMillis('2026-05-06')).to.be.a('number');
  });

  it('derives weighted reporting totals from visible rows', function() {
    const totals = getReportingTotals([
      { userId: 'u1', username: 'Ada', count: 2, percentCorrect: '50.00%', totalTimeMins: '1.000' },
      { userId: 'u2', username: 'Ben', count: 1, percentCorrect: '100.00%', totalTimeMins: '0.500' },
    ]);

    expect(totals).to.deep.equal({
      count: 3,
      percentCorrect: '66.67%',
      totalTimeMins: '1.500',
    });
  });
});
