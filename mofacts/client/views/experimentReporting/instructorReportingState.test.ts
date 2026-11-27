import { expect } from 'chai';
import { legacyLessonReportingDeadline, parseCourseReportingDateTime } from '../../../common/lib/courseReportingTime';
import {
  findAssignmentForTdf,
  getReportingTotals,
  mergeReportingRows,
  normalizePerformanceReport,
} from './instructorReportingState';

describe('instructorReportingState', function() {
  it('keeps the server cutoff alongside the performance buckets', function() {
    const cutoff = Date.parse('2026-12-01T17:00:00-06:00');
    const timing = { assignmentDueAt: cutoff, cutoffAt: cutoff, timezone: 'America/Chicago' };
    const report = normalizePerformanceReport([
      [{ userId: 'u1', username: 'Ada', count: 2 }],
      [{ userId: 'u2', username: 'Ben', count: 1 }],
      timing,
    ]);

    expect(report.met.map((row) => row.userId)).to.deep.equal(['u1']);
    expect(report.notMet.map((row) => row.userId)).to.deep.equal(['u2']);
    expect(report.timing).to.deep.equal(timing);
  });

  it('finds the selected course assignment identity', function() {
    const assignment = findAssignmentForTdf({
      course1: [{ assignmentId: 'a1', TDFId: 'tdf1' }],
    }, 'course1', 'tdf1');
    expect(assignment?.assignmentId).to.equal('a1');
  });

  it('converts a custom cutoff using the course timezone and the offset at that time', function() {
    expect(parseCourseReportingDateTime('2026-12-01T17:00', 'America/Chicago')).to.equal(Date.parse('2026-12-01T23:00:00Z'));
    expect(parseCourseReportingDateTime('2026-12-01T17:00', 'America/Los_Angeles')).to.equal(Date.parse('2026-12-02T01:00:00Z'));
    expect(parseCourseReportingDateTime('2026-03-08T03:30', 'America/Chicago')).to.equal(Date.parse('2026-03-08T08:30:00Z'));
    expect(parseCourseReportingDateTime('2026-03-08T02:30', 'America/Chicago')).to.equal(null);
    expect(parseCourseReportingDateTime('2026-11-01T01:30', 'America/Chicago')).to.equal(null);
    expect(parseCourseReportingDateTime('2026-02-30T12:00', 'America/Chicago')).to.equal(null);
    expect(legacyLessonReportingDeadline('2026-05-06', 'America/Chicago')).to.equal(Date.parse('2026-05-06T00:00:00Z'));
  });

  it('merges both cutoff buckets into one row per learner and retains exact totals', function() {
    const splitRows = [
      { userId: 'u1', username: 'Ada', count: 2, numCorrect: 1, totalTime: 60000, percentCorrect: '50.00%', totalTimeMins: '1.000' },
      { userId: 'u1', username: 'Ada', count: 1, numCorrect: 1, totalTime: 30000, percentCorrect: '100.00%', totalTimeMins: '0.500' },
      { userId: 'u2', username: 'Ben', count: 1, numCorrect: 0, totalTime: 5, percentCorrect: '0.00%', totalTimeMins: '0.000' },
    ];
    const visible = mergeReportingRows(splitRows);
    expect(visible.map(row => [row.userId, row.count, row.percentCorrect])).to.deep.equal([
      ['u1', 3, '66.67%'], ['u2', 1, '0.00%'],
    ]);
    const totals = getReportingTotals(visible);

    expect(totals).to.deep.equal({
      count: 4,
      percentCorrect: '50.00%',
      totalTimeMins: '1.500',
    });
    expect(totals).to.deep.equal(getReportingTotals(splitRows));
  });
});
