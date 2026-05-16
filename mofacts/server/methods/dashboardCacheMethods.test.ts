import { expect } from 'chai';
import { computeCacheStats, computeSummaryStats, computeUsageSummary, createDashboardCacheMethods } from './dashboardCacheMethods';

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
        overallAccuracy: 80,
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
        overallAccuracy: 60,
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
        overallAccuracy: 75,
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
        overallAccuracy: 50,
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
        overallAccuracy: 0,
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

  it('updateDashboardCacheForTdf preserves learner TDF configs', async function() {
    const userId = 'learner-1';
    let cacheDoc: any = {
      userId,
      version: 1,
      tdfStats: {},
      learnerTdfConfigs: {
        tdfA: {
          source: { tdfId: 'tdfA', unitCount: 0, unitSignature: [] },
          overrides: { setspec: { audioPromptMode: 'feedback' } }
        }
      }
    };
    let lastModifier: any = null;

    const methods = createDashboardCacheMethods({
      Meteor: {
        Error: class MeteorError extends Error {
          error: string;
          constructor(error: string, reason?: string) {
            super(reason || error);
            this.error = error;
          }
        }
      },
      Roles: { userIsInRoleAsync: async () => false },
      Histories: {
        find: () => ({
          fetchAsync: async () => [
            {
              _id: 'h1',
              userId,
              TDFId: 'tdfA',
              outcome: 'correct',
              CFEndLatency: 1000,
              CFFeedbackLatency: 500,
              itemId: 'item-1',
              recordedServerTime: new Date('2026-05-01T00:00:00.000Z'),
              levelUnitType: 'model'
            }
          ]
        }),
        rawCollection: () => ({ distinct: async () => [] })
      },
      Tdfs: {
        findOneAsync: async (selector: any) => {
          if (selector._id === 'tdfA') {
            return {
              _id: 'tdfA',
              content: {
                fileName: 'tdf-a.json',
                tdfs: { tutor: { setspec: { lessonname: 'Lesson A' } } }
              }
            };
          }
          return null;
        },
        find: () => ({ fetchAsync: async () => [] })
      },
      UserDashboardCache: {
        findOneAsync: async () => cacheDoc,
        upsertAsync: async (_selector: any, modifier: any) => {
          lastModifier = modifier;
          cacheDoc = {
            ...cacheDoc,
            ...(modifier.$set || {})
          };
        }
      },
      usersCollection: { findOneAsync: async () => ({ _id: userId }) },
      serverConsole: () => undefined,
      computePracticeTimeMs: (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0),
      canViewDashboardTdf: () => true
    });

    const result = await methods.updateDashboardCacheForTdf.call({ userId }, 'tdfA');

    expect(result.success).to.equal(true);
    expect(lastModifier.$set).to.not.have.property('learnerTdfConfigs');
    expect(cacheDoc.learnerTdfConfigs.tdfA.overrides.setspec.audioPromptMode).to.equal('feedback');
  });
});
