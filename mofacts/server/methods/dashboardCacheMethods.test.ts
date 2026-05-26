import { expect } from 'chai';
import { computeCacheStats, computeSummaryStats, computeUsageSummary, createDashboardCacheMethods } from './dashboardCacheMethods';

const disabledRedisBoundary = {
  enabled: false,
  async withLock<T>(_key: string, _ttlMs: number, work: () => Promise<T>) {
    return await work();
  }
};

describe('dashboardCacheMethods', function() {
  it('computeCacheStats calculates aggregate metrics', function() {
    const history = [
      {
        _id: 'h1',
        outcome: 'correct',
        levelUnitType: 'model',
        CFEndLatency: 2000,
        CFFeedbackLatency: 500,
        itemId: 'item-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h2',
        outcome: 'incorrect',
        levelUnitType: 'model',
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
    expect(stats.itemsPracticedApplies).to.equal(true);
    expect(stats.overallAccuracy).to.equal(50);
    expect(stats.lastPracticeTimestamp).to.equal(new Date('2026-02-11T10:00:00.000Z').getTime());
  });

  it('computeCacheStats includes assessment rows in trial and accuracy metrics', function() {
    const stats = computeCacheStats([
      {
        _id: 'assessment-1',
        outcome: 'correct',
        levelUnitType: 'schedule',
        CFEndLatency: 4000,
        CFFeedbackLatency: -1,
        itemId: 'assessment-item-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'assessment-2',
        outcome: 'incorrect',
        levelUnitType: 'schedule',
        CFEndLatency: 3000,
        CFFeedbackLatency: -1,
        itemId: 'assessment-item-b',
        recordedServerTime: new Date('2026-02-11T10:00:00.000Z')
      }
    ], 'Assessment Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.totalTrials).to.equal(2);
    expect(stats.correctTrials).to.equal(1);
    expect(stats.incorrectTrials).to.equal(1);
    expect(stats.overallAccuracy).to.equal(50);
    expect(stats.itemsPracticedCount).to.equal(0);
    expect(stats.itemsPracticedApplies).to.equal(false);
    expect(stats.totalSessions).to.equal(2);
  });

  it('computeCacheStats counts H5P exercise part rows without double-counting the summary row', function() {
    const stats = computeCacheStats([
      {
        _id: 'h5p-summary',
        outcome: 'incorrect',
        levelUnitType: 'schedule',
        CFEndLatency: 10000,
        CFFeedbackLatency: 0,
        h5p: { eventType: 'summary' },
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h5p-part-1',
        outcome: 'correct',
        levelUnitType: 'schedule',
        CFEndLatency: 10000,
        CFFeedbackLatency: 0,
        h5p: { eventType: 'part', latencyMs: 1200 },
        recordedServerTime: new Date('2026-02-10T10:00:01.000Z')
      },
      {
        _id: 'h5p-part-2',
        outcome: 'incorrect',
        levelUnitType: 'schedule',
        CFEndLatency: 10000,
        CFFeedbackLatency: 0,
        h5p: { eventType: 'part', latencyMs: 800 },
        recordedServerTime: new Date('2026-02-10T10:00:02.000Z')
      }
    ], 'H5P Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.totalTrials).to.equal(2);
    expect(stats.correctTrials).to.equal(1);
    expect(stats.incorrectTrials).to.equal(1);
    expect(stats.overallAccuracy).to.equal(50);
    expect(stats.totalTimeMs).to.equal(2000);
    expect(stats.itemsPracticedApplies).to.equal(false);
  });

  it('computeCacheStats uses latest AutoTutor progress per unit session as the accuracy measure', function() {
    const firstNote = JSON.stringify({ progress: 0.25 });
    const latestNote = JSON.stringify({ progress: 0.75 });
    const secondSessionNote = JSON.stringify({ progress: 0.5 });
    const stats = computeCacheStats([
      {
        _id: 'auto-1',
        outcome: 'incorrect',
        levelUnitType: 'autotutor',
        levelUnit: 0,
        sessionID: 'session-a',
        CFEndLatency: 5000,
        CFFeedbackLatency: 0,
        CFNote: firstNote,
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'auto-2',
        outcome: 'incorrect',
        levelUnitType: 'autotutor',
        levelUnit: 0,
        sessionID: 'session-a',
        CFEndLatency: 6000,
        CFFeedbackLatency: 0,
        CFNote: latestNote,
        recordedServerTime: new Date('2026-02-10T10:01:00.000Z')
      },
      {
        _id: 'auto-3',
        outcome: 'incorrect',
        levelUnitType: 'autotutor',
        levelUnit: 1,
        sessionID: 'session-b',
        CFEndLatency: 4000,
        CFFeedbackLatency: 0,
        CFNote: secondSessionNote,
        recordedServerTime: new Date('2026-02-11T10:01:00.000Z')
      }
    ], 'AutoTutor Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.totalTrials).to.equal(3);
    expect(stats.correctTrials).to.equal(0);
    expect(stats.incorrectTrials).to.equal(0);
    expect(stats.overallAccuracy).to.equal(62.5);
    expect(stats.totalTimeMinutes).to.equal(0.3);
    expect(stats.itemsPracticedApplies).to.equal(false);
    expect(stats.totalSessions).to.equal(2);
  });

  it('computeCacheStats uses the latest trial history timestamp for recency', function() {
    const history = [
      {
        _id: 'h1',
        outcome: 'correct',
        recordedServerTime: new Date('2026-02-11T10:00:00.000Z')
      },
      {
        _id: 'h2',
        outcome: 'correct',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h3',
        outcome: 'correct',
        time: new Date('2026-02-12T10:00:00.000Z').getTime()
      }
    ];

    const stats = computeCacheStats(history, 'Demo', () => 0);

    expect(stats.lastPracticeTimestamp).to.equal(new Date('2026-02-12T10:00:00.000Z').getTime());
    expect(stats.lastPracticeDate?.toISOString()).to.equal('2026-02-12T10:00:00.000Z');
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
        lastPracticeTimestamp: new Date('2026-02-12T00:00:00.000Z').getTime(),
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
        lastPracticeTimestamp: new Date('2026-02-13T00:00:00.000Z').getTime(),
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
        lastPracticeTimestamp: new Date('2026-02-12T00:00:00.000Z').getTime(),
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
        lastPracticeTimestamp: new Date('2026-02-13T00:00:00.000Z').getTime(),
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
        lastPracticeTimestamp: 0,
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
    const lockKeys: string[] = [];

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
      canViewDashboardTdf: () => true,
      redisBoundary: {
        enabled: true,
        async withLock<T>(key: string, _ttlMs: number, work: () => Promise<T>) {
          lockKeys.push(key);
          return await work();
        }
      }
    });

    const result = await methods.updateDashboardCacheForTdf.call({ userId }, 'tdfA');

    expect(result.success).to.equal(true);
    expect(lockKeys).to.deep.equal(['dashboard-cache:update:learner-1:tdfA']);
    expect(lastModifier.$set).to.not.have.property('learnerTdfConfigs');
    expect(cacheDoc.learnerTdfConfigs.tdfA.overrides.setspec.audioPromptMode).to.equal('feedback');
  });

  it('resetAdminLessonProgress clears admin history, experiment state, and root cache stats for a condition family', async function() {
    const userId = 'admin-1';
    const docs = {
      root: {
        _id: 'root',
        content: {
          fileName: 'root.json',
          tdfs: {
            tutor: {
              setspec: {
                lessonname: 'Root Lesson',
                condition: ['condition-a.json'],
                conditionTdfIds: ['condition-a']
              }
            }
          }
        }
      },
      child: {
        _id: 'condition-a',
        content: {
          fileName: 'condition-a.json',
          tdfs: { tutor: { setspec: { lessonname: 'Condition A' } } }
        }
      }
    };
    const removedSelectors: any[] = [];
    const stateRemovedSelectors: any[] = [];
    let cacheDoc: any = {
      _id: 'cache-1',
      userId,
      tdfStats: {
        root: {
          displayName: 'Root Lesson',
          totalTrials: 3,
          correctTrials: 2,
          incorrectTrials: 1,
          totalTimeMs: 1000,
          totalTimeMinutes: 0.1,
          itemsPracticedCount: 2,
          totalSessions: 1,
          overallAccuracy: 66.7,
          firstPracticeDate: new Date('2026-05-01T00:00:00.000Z'),
          lastPracticeDate: new Date('2026-05-01T00:00:00.000Z'),
          lastPracticeTimestamp: new Date('2026-05-01T00:00:00.000Z').getTime(),
          lastProcessedHistoryId: null,
          lastProcessedTimestamp: null
        },
        other: {
          displayName: 'Other Lesson',
          totalTrials: 1,
          correctTrials: 1,
          incorrectTrials: 0,
          totalTimeMs: 100,
          totalTimeMinutes: 0.1,
          itemsPracticedCount: 1,
          totalSessions: 1,
          overallAccuracy: 100,
          firstPracticeDate: new Date('2026-05-02T00:00:00.000Z'),
          lastPracticeDate: new Date('2026-05-02T00:00:00.000Z'),
          lastPracticeTimestamp: new Date('2026-05-02T00:00:00.000Z').getTime(),
          lastProcessedHistoryId: null,
          lastProcessedTimestamp: null
        }
      },
      learnerTdfConfigs: {
        root: {
          source: { tdfId: 'root', unitCount: 0, unitSignature: [] },
          overrides: { setspec: { audioPromptMode: 'feedback' } }
        }
      }
    };

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
      Roles: { userIsInRoleAsync: async () => true },
      Histories: {
        removeAsync: async (selector: any) => {
          removedSelectors.push(selector);
          return 2;
        },
        find: () => ({ fetchAsync: async () => [] }),
        rawCollection: () => ({ distinct: async () => [] })
      },
      GlobalExperimentStates: {
        removeAsync: async (selector: any) => {
          stateRemovedSelectors.push(selector);
          return 1;
        }
      },
      Tdfs: {
        findOneAsync: async (selector: any) => {
          if (selector._id === 'root') return docs.root;
          if (selector._id === 'condition-a') return docs.child;
          return null;
        },
        find: (selector: any) => ({
          fetchAsync: async () => {
            if (selector.$or?.some((entry: any) => entry._id?.$in?.includes('condition-a') || entry['content.fileName']?.$in?.includes('condition-a.json'))) {
              return [docs.child];
            }
            return [];
          }
        })
      },
      UserDashboardCache: {
        findOneAsync: async () => cacheDoc,
        updateAsync: async (_selector: any, modifier: any) => {
          cacheDoc = {
            ...cacheDoc,
            ...(modifier.$set || {})
          };
        },
        upsertAsync: async () => undefined
      },
      usersCollection: { findOneAsync: async () => ({ _id: userId }) },
      serverConsole: () => undefined,
      computePracticeTimeMs: (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0),
      canViewDashboardTdf: () => true,
      redisBoundary: disabledRedisBoundary
    });

    const result = await methods.resetAdminLessonProgress.call({ userId }, 'root');

    expect(result.success).to.equal(true);
    expect(result.cacheTdfIds).to.deep.equal(['root']);
    expect(removedSelectors[0].TDFId.$in).to.include.members(['root', 'root.json', 'condition-a', 'condition-a.json']);
    expect(stateRemovedSelectors[0].$or).to.deep.include({ TDFId: { $in: removedSelectors[0].TDFId.$in } });
    expect(cacheDoc.tdfStats).to.not.have.property('root');
    expect(cacheDoc.tdfStats).to.have.property('other');
    expect(cacheDoc.learnerTdfConfigs).to.have.property('root');
  });
});
