import { expect } from 'chai';
import { computeCacheStats, computeSummaryStats } from './dashboardCacheMethods';

describe('dashboardCacheMethods', function() {
  it('computeCacheStats calculates aggregate metrics', function() {
    const history = [
      {
        _id: 'h1',
        outcome: 'correct',
        CFEndLatency: 2000,
        CFFeedbackLatency: 500,
        itemId: 'item-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h2',
        outcome: 'incorrect',
        CFEndLatency: 3000,
        CFFeedbackLatency: 800,
        itemId: 'item-b',
        recordedServerTime: new Date('2026-02-11T10:00:00.000Z')
      }
    ];

    const stats = computeCacheStats(history, 'Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.displayName).to.equal('Demo');
    expect(stats.totalTrials).to.equal(2);
    expect(stats.correctTrials).to.equal(1);
    expect(stats.incorrectTrials).to.equal(1);
    expect(stats.totalTimeMs).to.equal(6300);
    expect(stats.itemsPracticedCount).to.equal(2);
    expect(stats.overallAccuracy).to.equal(50);
  });

  it('computeSummaryStats combines multiple TDF stats', function() {
    const summary = computeSummaryStats({
      tdfA: {
        displayName: 'A',
        totalTrials: 5,
        correctTrials: 4,
        incorrectTrials: 1,
        totalTimeMs: 15000,
        totalTimeMinutes: 0.25,
        itemsPracticedCount: 5,
        totalSessions: 1,
        recentOutcomes: [],
        overallAccuracy: 80,
        last10Accuracy: 80,
        firstPracticeDate: new Date('2026-02-12T00:00:00.000Z'),
        lastPracticeDate: new Date('2026-02-12T00:00:00.000Z'),
        lastProcessedHistoryId: null,
        lastProcessedTimestamp: null
      },
      tdfB: {
        displayName: 'B',
        totalTrials: 5,
        correctTrials: 3,
        incorrectTrials: 2,
        totalTimeMs: 10000,
        totalTimeMinutes: 0.1667,
        itemsPracticedCount: 5,
        totalSessions: 1,
        recentOutcomes: [],
        overallAccuracy: 60,
        last10Accuracy: 60,
        firstPracticeDate: new Date('2026-02-13T00:00:00.000Z'),
        lastPracticeDate: new Date('2026-02-13T00:00:00.000Z'),
        lastProcessedHistoryId: null,
        lastProcessedTimestamp: null
      }
    });

    expect(summary.totalTdfsAttempted).to.equal(2);
    expect(summary.totalTrialsAllTime).to.equal(10);
    expect(summary.totalTimeAllTime).to.equal(25000);
    expect(summary.overallAccuracyAllTime).to.equal(70);
    expect(new Date(summary.lastActivityDate!).toISOString()).to.equal('2026-02-13T00:00:00.000Z');
  });
});
