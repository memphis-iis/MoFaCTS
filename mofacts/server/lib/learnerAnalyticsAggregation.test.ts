import { expect } from 'chai';
import { buildLearnerAnalyticsAggregates } from './learnerAnalyticsAggregation';

describe('learnerAnalyticsAggregation', function() {
  it('builds period metrics and 28 calendar days without inventing AutoTutor accuracy', function() {
    const result = buildLearnerAnalyticsAggregates({
      nowMs: Date.parse('2026-08-08T12:00:00.000Z'),
      timeZone: 'UTC',
      computePracticeTimeMs: (end, feedback) => Number(end || 0) + Number(feedback || 0),
      rows: [
        { _id: '1', TDFId: 'lesson', levelUnit: 0, levelUnitType: 'model', recordedServerTime: '2026-08-07T12:00:00.000Z', outcome: 'correct', stimuliSetId: 'set', stimulusKC: 'a', CFEndLatency: 60_000 },
        { _id: '2', TDFId: 'lesson', levelUnit: 0, levelUnitType: 'model', recordedServerTime: '2026-08-01T12:00:00.000Z', outcome: 'incorrect', stimuliSetId: 'set', stimulusKC: 'b', CFEndLatency: 120_000 },
        { _id: '3', TDFId: 'lesson', levelUnit: 1, levelUnitType: 'autotutor', recordedServerTime: '2026-08-08T12:00:00.000Z', KCId: 'force', CFEndLatency: 180_000 },
        { _id: '4', TDFId: 'lesson', levelUnit: 0, levelUnitType: 'model', modelEvidenceSource: 'assessment', recordedServerTime: '2026-08-08T12:00:00.000Z', outcome: 'correct' },
      ],
    });

    expect(result.latest28Days).to.have.length(28);
    expect(result.periods['7d']).to.deep.include({ attempts: 2, uniqueItems: 2, practiceDays: 2, activeMinutes: 4 });
    expect(result.periods['7d'].accuracy).to.deep.equal({ correct: 1, total: 1 });
    expect(result.periods['30d'].accuracy).to.deep.equal({ correct: 1, total: 2 });
    expect(result.lastPracticedAt).to.equal('2026-08-08T12:00:00.000Z');
  });

  it('omits accuracy when a study set contains only conversational practice', function() {
    const result = buildLearnerAnalyticsAggregates({
      nowMs: Date.parse('2026-08-08T12:00:00.000Z'),
      timeZone: 'UTC',
      computePracticeTimeMs: () => 60_000,
      rows: [{ TDFId: 'auto', levelUnit: 0, levelUnitType: 'autotutor', KCId: 'kc', recordedServerTime: '2026-08-08T12:00:00.000Z' }],
    });
    expect(result.periods['7d'].accuracy).to.equal(undefined);
  });
});
