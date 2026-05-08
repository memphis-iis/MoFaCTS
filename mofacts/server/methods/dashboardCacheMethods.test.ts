import { expect } from 'chai';
import { computeCacheStats, computeSummaryStats, computeUsageSummary } from './dashboardCacheMethods';

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

  it('computeUsageSummary derives admin usage metrics from cached TDF stats', function() {
    const usageSummary = computeUsageSummary({
      tdfA: {
        displayName: 'A',
        totalTrials: 4,
        correctTrials: 3,
        incorrectTrials: 1,
        totalTimeMs: 120000,
        totalTimeMinutes: 2,
        itemsPracticedCount: 8,
        totalSessions: 2,
        recentOutcomes: [],
        overallAccuracy: 75,
        last10Accuracy: 75,
        firstPracticeDate: new Date('2026-02-12T00:00:00.000Z'),
        lastPracticeDate: new Date('2026-02-12T00:00:00.000Z'),
        lastProcessedHistoryId: null,
        lastProcessedTimestamp: null
      },
      tdfB: {
        displayName: 'B',
        totalTrials: 6,
        correctTrials: 3,
        incorrectTrials: 3,
        totalTimeMs: 60000,
        totalTimeMinutes: 1,
        itemsPracticedCount: 4,
        totalSessions: 4,
        recentOutcomes: [],
        overallAccuracy: 50,
        last10Accuracy: 50,
        firstPracticeDate: new Date('2026-02-13T00:00:00.000Z'),
        lastPracticeDate: new Date('2026-02-13T00:00:00.000Z'),
        lastProcessedHistoryId: null,
        lastProcessedTimestamp: null
      },
      tdfZero: {
        displayName: 'Zero',
        totalTrials: 0,
        correctTrials: 0,
        incorrectTrials: 0,
        totalTimeMs: 999999,
        totalTimeMinutes: 999,
        itemsPracticedCount: 99,
        totalSessions: 99,
        recentOutcomes: [],
        overallAccuracy: 0,
        last10Accuracy: 0,
        firstPracticeDate: null,
        lastPracticeDate: null,
        lastProcessedHistoryId: null,
        lastProcessedTimestamp: null
      }
    });

    expect(usageSummary.totalTrials).to.equal(10);
    expect(usageSummary.weightedAccuracy).to.equal(60);
    expect(usageSummary.totalTimeMinutes).to.equal(3);
    expect(usageSummary.averageSessionDays).to.equal(3);
    expect(usageSummary.averageItemsPracticed).to.equal(6);
    expect(usageSummary.practicedSystemCount).to.equal(2);
    expect(new Date(usageSummary.lastActivityDate!).toISOString()).to.equal('2026-02-13T00:00:00.000Z');
  });
});
