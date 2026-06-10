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
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h2',
        outcome: 'incorrect',
        levelUnitType: 'model',
        CFEndLatency: 3000,
        CFFeedbackLatency: 800,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-b',
        clusterKC: 'cluster-a',
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

  it('getPracticeDashboardSnapshot returns compact display rows from cached stats', async function() {
    const userId = 'learner-1';
    const lessonDoc = {
      _id: 'tdfA',
      stimuliSetId: 'stim-set-a',
      ownerId: 'teacher-1',
      content: {
        fileName: 'lesson-a.json',
        isMultiTdf: false,
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson A',
              tags: ['math'],
              userselect: 'true',
              speechOutOfGrammarFeedback: 'Try one of the listed answers',
              audioInputEnabled: 'true',
              enableAudioPromptAndFeedback: 'false'
            },
          }
        }
      }
    };
    const tdfFindOptions: any[] = [];
    const queryCounts = {
      tdfsFind: 0,
      usersFindOne: 0,
      cacheFindOne: 0,
      sectionUserMapFind: 0,
      sectionsFind: 0,
      assignmentsFind: 0
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
      Roles: { userIsInRoleAsync: async () => false },
      Histories: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async () => null,
        rawCollection: () => ({ distinct: async () => [] })
      },
      Tdfs: {
        find: (_selector: any, options: any) => {
          queryCounts.tdfsFind++;
          tdfFindOptions.push(options);
          return { fetchAsync: async () => [lessonDoc] };
        },
        findOneAsync: async () => null
      },
      Assignments: { find: () => { queryCounts.assignmentsFind++; return { fetchAsync: async () => [] }; } },
      Sections: { find: () => { queryCounts.sectionsFind++; return { fetchAsync: async () => [] }; } },
      SectionUserMap: { find: () => { queryCounts.sectionUserMapFind++; return { fetchAsync: async () => [] }; } },
      UserDashboardCache: {
        findOneAsync: async () => {
          queryCounts.cacheFindOne++;
          return ({
          userId,
          tdfStats: {
            tdfA: {
              displayName: 'Lesson A',
              totalTrials: 2,
              correctTrials: 1,
              incorrectTrials: 1,
              totalTimeMs: 90000,
              totalTimeMinutes: 1.5,
              itemsPracticedCount: 2,
              itemsPracticedApplies: true,
              totalSessions: 1,
              overallAccuracy: 50,
              accuracyApplies: true,
              firstPracticeDate: new Date('2026-06-01T00:00:00.000Z'),
              lastPracticeDate: new Date('2026-06-01T00:00:00.000Z'),
              lastPracticeTimestamp: new Date('2026-06-01T00:00:00.000Z').getTime(),
              lastProcessedHistoryId: 'h2',
              lastProcessedTimestamp: new Date('2026-06-01T00:00:00.000Z')
            }
          },
          learnerTdfConfigs: {
            tdfA: {
              source: { tdfId: 'tdfA', unitCount: 1, unitSignature: [] },
              overrides: { setspec: { audioPromptMode: 'feedback' } }
            }
          }
        });
        }
      },
      usersCollection: {
        findOneAsync: async () => {
          queryCounts.usersFindOne++;
          return { _id: userId, accessedTDFs: [], speechAPIKey: 'sr', textToSpeechAPIKey: 'tts' };
        }
      },
      serverConsole: () => {},
      computePracticeTimeMs: (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0),
      canViewDashboardTdf: () => true,
      redisBoundary: disabledRedisBoundary
    });

    const snapshot = await (methods as any).getPracticeDashboardSnapshot.call({ userId });

    expect(snapshot.version).to.equal(1);
    expect(snapshot.lessons).to.have.length(1);
    expect(snapshot.lessons[0]).to.include({
      TDFId: 'tdfA',
      displayName: 'Lesson A',
      currentStimuliSetId: 'stim-set-a',
      hasConfigurableSettings: true,
      isUsed: true
    });
    expect(snapshot.lessons[0].progress).to.include({
      attempts: 2,
      accuracy: 50,
      totalTimeMinutes: 1.5,
      itemsPracticed: 2,
      totalPracticeItems: null
    });
    expect(snapshot.lessons[0].totalTrials).to.equal(undefined);
    expect(snapshot.lessons[0].overallAccuracy).to.equal(undefined);
    expect(snapshot.lessons[0].totalPracticeItems).to.equal(undefined);
    expect(snapshot.lessons[0].learnerConfig.overrides.setspec.audioPromptMode).to.equal('feedback');
    expect(snapshot.lessons[0].content).to.equal(undefined);
    expect(JSON.stringify(tdfFindOptions)).not.to.include('unit');
    expect(queryCounts).to.deep.equal({
      tdfsFind: 2,
      usersFindOne: 1,
      cacheFindOne: 1,
      sectionUserMapFind: 1,
      sectionsFind: 0,
      assignmentsFind: 0
    });
  });

  it('does not count legacy model itemId as canonical practiced stimulus identity', function() {
    const stats = computeCacheStats([
      {
        _id: 'legacy-item-id',
        outcome: 'correct',
        levelUnitType: 'model',
        CFEndLatency: 2000,
        CFFeedbackLatency: 500,
        itemId: 'legacy-cruft',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      }
    ], 'Legacy Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.itemsPracticedCount).to.equal(0);
    expect(stats.itemsPracticedApplies).to.equal(false);
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

  it('computeCacheStats does not compute an accuracy percentage for AutoTutor rows', function() {
    const stats = computeCacheStats([
      {
        _id: 'auto-1',
        outcome: 'incorrect',
        levelUnitType: 'autotutor',
        levelUnit: 0,
        sessionID: 'session-a',
        CFEndLatency: 5000,
        CFFeedbackLatency: 0,
        CFNote: JSON.stringify({ progress: 0.25 }),
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
        CFNote: JSON.stringify({ progress: 0.75 }),
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
        CFNote: JSON.stringify({ progress: 0.5 }),
        recordedServerTime: new Date('2026-02-11T10:01:00.000Z')
      }
    ], 'AutoTutor Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.totalTrials).to.equal(3);
    expect(stats.correctTrials).to.equal(0);
    expect(stats.incorrectTrials).to.equal(0);
    expect(stats.accuracyApplies).to.equal(false);
    expect(stats.overallAccuracy).to.equal(null);
    expect(stats.accuracyWeightedCorrect).to.equal(undefined);
    expect(stats.accuracyWeightedTotal).to.equal(undefined);
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
        accuracyApplies: true,
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
        accuracyApplies: true,
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
        accuracyApplies: true,
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
        accuracyApplies: true,
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
        overallAccuracy: null,
        accuracyApplies: false,
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
              stimuliSetId: 'set-a',
              stimulusKC: 'stim-a',
              clusterKC: 'cluster-a',
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

  it('ensureDashboardCacheCurrent rebuilds a current-version cache when newer history exists', async function() {
    const userId = 'learner-1';
    let cacheDoc: any = {
      userId,
      version: 3,
      tdfStats: {},
      lastUpdated: new Date('2026-05-01T00:00:00.000Z')
    };
    const lockKeys: string[] = [];
    const historyRows = [
      {
        _id: 'h1',
        userId,
        TDFId: 'tdfA',
        outcome: 'correct',
        CFEndLatency: 1000,
        CFFeedbackLatency: 500,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        recordedServerTime: new Date('2026-05-01T00:01:00.000Z'),
        levelUnitType: 'model'
      }
    ];

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
        findOneAsync: async () => historyRows[0],
        find: () => ({
          fetchAsync: async () => historyRows
        }),
        rawCollection: () => ({ distinct: async () => ['tdfA'] })
      },
      Tdfs: {
        findOneAsync: async () => null,
        find: (selector: any) => ({
          fetchAsync: async () => {
            if (selector?._id?.$in) {
              return [{
                _id: 'tdfA',
                content: {
                  fileName: 'tdf-a.json',
                  tdfs: { tutor: { setspec: { lessonname: 'Lesson A' } } }
                }
              }];
            }
            return [];
          }
        })
      },
      UserDashboardCache: {
        findOneAsync: async () => cacheDoc,
        upsertAsync: async (_selector: any, modifier: any) => {
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

    const result = await methods.ensureDashboardCacheCurrent.call({ userId });

    expect(result).to.deep.include({
      success: true,
      action: 'refreshed',
      reason: 'history-newer',
      tdfCount: 1
    });
    expect(lockKeys).to.deep.equal([
      'dashboard-cache:ensure:learner-1',
      'dashboard-cache:initialize:learner-1'
    ]);
    expect(cacheDoc.tdfStats.tdfA.totalTrials).to.equal(1);
    expect(cacheDoc.summary.totalTrialsAllTime).to.equal(1);
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
