import { expect } from 'chai';
import {
  applyDashboardHistoryRecordToStats,
  computeCacheStats,
  computeSummaryStats,
  computeUsageSummary,
  createDashboardCacheMethods,
} from './dashboardCacheMethods';
import { DASHBOARD_CACHE_VERSION } from './dashboardCacheShared';

const disabledRedisBoundary = {
  enabled: false,
  async withLock<T>(_key: string, _ttlMs: number, work: () => Promise<T>) {
    return await work();
  }
};

function createDashboardMethodsFixture(overrides: Partial<Parameters<typeof createDashboardCacheMethods>[0]> = {}) {
  const collection = { find: () => ({ fetchAsync: async () => [] }), findOneAsync: async () => null,
    updateAsync: async () => undefined, upsertAsync: async () => undefined };
  return createDashboardCacheMethods({
    Meteor: { Error: class MeteorError extends Error {
      error: string;
      constructor(error: string, reason?: string) { super(reason || error); this.error = error; }
    } },
    Roles: { userIsInRoleAsync: async () => false },
    refreshDashboardHistory: async () => ({ success: true, action: 'current', tdfCount: 0 }),
    removeLessonHistory: async () => { throw new Error('Unexpected history deletion in dashboard fixture'); },
    Tdfs: collection,
    UserDashboardCache: collection,
    usersCollection: { findOneAsync: async () => ({ _id: 'synthetic-user' }) },
    DynamicSettings: collection,
    serverConsole: () => undefined,
    canViewDashboardTdf: () => true,
    getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard fixture'); },
    redisBoundary: disabledRedisBoundary,
    ...overrides,
  });
}

describe('dashboardCacheMethods', function() {
  it('counts one assessed dialogue response across sparse checkpoints and bundled turns', function() {
    const event = { eventId: 'answer-1', type: 'response-submitted' };
    const rows = ['submission', 'assessment:score:kc', 'assessment:evidence:kc', 'assessment', 'decision', 'feedback', 'primitive:richContent', 'primitive:explanation', 'primitive:question', 'cycle']
      .map((stage, index) => ({ _id: String(index), levelUnitType: 'sparc', time: 1000,
        sparc: { stateTransition: { transitionId: `${event.eventId}:${stage}`, event } } }));
    const reduce = (records: typeof rows) => records.reduce((stats, row) => applyDashboardHistoryRecordToStats(stats, row, 'Lesson', () => 0), undefined as ReturnType<typeof computeCacheStats> | undefined);
    expect(computeCacheStats(rows, 'Lesson', () => 0).totalTrials).to.equal(1);
    expect(reduce(rows)?.totalTrials).to.equal(1);
    expect(reduce(rows.filter(row => !row.sparc.stateTransition.transitionId.includes(':assessment:')))?.totalTrials).to.equal(1);
    const bundled = { ...rows[0]!, sparc: { stateTransition: { transitionId: 'answer-2:dialogue-turn', event: { eventId: 'answer-2', type: 'response-submitted' } } } };
    expect(computeCacheStats([...rows, bundled], 'Lesson', () => 0).totalTrials).to.equal(2);
    expect(computeCacheStats([{ ...bundled, sparc: { stateTransition: { ...bundled.sparc.stateTransition, event: { eventId: 'answer-2', type: 'document-loaded' } } } }], 'Lesson', () => 0).totalTrials).to.equal(0);
  });

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
              audioPromptMode: 'silent'
            },
            unit: [
              { learningsession: {} }
            ],
          }
        }
      }
    };
    const tdfFindOptions: any[] = [];
    const queryCounts = {
      tdfsFind: 0,
      usersFindOne: 0,
      usersFind: 0,
      cacheFindOne: 0,
      sectionUserMapFind: 0,
      sectionsFind: 0,
      assignmentsFind: 0
    };
    const methods = createDashboardMethodsFixture({
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
          userId, version: DASHBOARD_CACHE_VERSION, lastUpdated: new Date(),
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
        },
        find: () => {
          queryCounts.usersFind++;
          return {
            fetchAsync: async () => [{
              _id: 'teacher-1',
              profile: {
                displayName: 'Professor Ada',
                avatarType: 'icon',
                avatarIconId: 'graduate',
              },
            }],
          };
        },
      },
      DynamicSettings: { findOneAsync: async () => null },
      serverConsole: () => {},
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    const snapshot = await (methods as any).getPracticeDashboardSnapshot.call({ userId });

    expect(snapshot.version).to.equal(4);
    expect(snapshot.creators).to.deep.equal([{
      displayName: 'Professor Ada',
      avatarType: 'icon',
      avatarIconId: 'graduate',
      avatarImageData: null,
    }]);
    expect(snapshot.lessons).to.have.length(1);
    expect(snapshot.lessons[0]).to.include({
      TDFId: 'tdfA',
      displayName: 'Lesson A',
      creatorIndex: 0,
      currentStimuliSetId: 'stim-set-a',
      hasConfigurableSettings: true,
      hasLearnerConfigurableSettings: true,
      blocksEligible: true,
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
    expect(JSON.stringify(tdfFindOptions)).to.include('content.tdfs.tutor.unit.learningsession');
    expect(queryCounts).to.deep.equal({
      tdfsFind: 2,
      usersFindOne: 1,
      usersFind: 1,
      cacheFindOne: 1,
      sectionUserMapFind: 1,
      sectionsFind: 0,
      assignmentsFind: 0
    });
  });

  for (const selector of ['sparcsession', 'autotutorsession']) {
    it(`keeps ${selector} dashboard metadata readable without advertising student learner settings`, async function() {
      const userId = 'learner-1';
      const lessonDoc = {
        _id: 'tdfAuto',
        stimuliSetId: 'stim-set-auto',
        ownerId: 'teacher-1',
        content: {
          fileName: 'autotutor.json',
          isMultiTdf: false,
          tdfs: {
            tutor: {
              setspec: {
                lessonname: 'AutoTutor',
                tags: [],
                userselect: 'true',
                audioInputEnabled: 'false',
                audioPromptMode: 'silent'
              },
              unit: [
                { [selector]: {} }
              ],
            }
          }
        }
      };
      const methods = createDashboardMethodsFixture({
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
        Tdfs: {
          find: () => ({ fetchAsync: async () => [lessonDoc] }),
          findOneAsync: async () => null
        },
        Assignments: { find: () => ({ fetchAsync: async () => [] }) },
        Sections: { find: () => ({ fetchAsync: async () => [] }) },
        SectionUserMap: { find: () => ({ fetchAsync: async () => [] }) },
        UserDashboardCache: {
          findOneAsync: async () => ({
            userId, version: DASHBOARD_CACHE_VERSION, lastUpdated: new Date(),
            tdfStats: {},
            learnerTdfConfigs: {}
          })
        },
        usersCollection: {
          findOneAsync: async () => ({ _id: userId, accessedTDFs: [] }),
          find: () => ({
            fetchAsync: async () => [{
              _id: 'teacher-1',
              profile: { displayName: 'Professor Ada', avatarType: 'initials' },
            }],
          }),
        },
        DynamicSettings: { findOneAsync: async () => null },
        serverConsole: () => {},
        canViewDashboardTdf: () => true,
        getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
        redisBoundary: disabledRedisBoundary
      });

      const snapshot = await (methods as any).getPracticeDashboardSnapshot.call({ userId });

      expect(snapshot.lessons).to.have.length(1);
      expect(snapshot.lessons[0]).to.include({
        TDFId: 'tdfAuto',
        firstContentUnitType: selector === 'sparcsession' ? 'sparc' : 'autotutor',
        hasConfigurableSettings: selector === 'sparcsession',
        hasLearnerConfigurableSettings: false
      });
    });
  }

  it('adds cached feature metadata from first content unit and configured key alternatives', async function() {
    const userId = 'learner-1';
    const lessonDoc = {
      _id: 'tdfVideo',
      stimuliSetId: 'stim-set-video',
      ownerId: 'teacher-1',
      content: {
        fileName: 'video.json',
        isMultiTdf: false,
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Video Lesson',
              tags: [],
              userselect: 'true',
              audioInputEnabled: 'true',
              audioPromptMode: 'feedback',
              speechAPIKey: 'encrypted-tdf-speech'
            },
            unit: [
              { unitinstructions: { text: 'Read first' } },
              { videosession: {} },
              { learningsession: {} }
            ],
          }
        }
      }
    };
    const sparcDoc = {
      _id: 'tdfSparc',
      stimuliSetId: 'stim-set-sparc',
      ownerId: 'teacher-1',
      content: {
        fileName: 'sparc.json',
        isMultiTdf: false,
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'SPARC Lesson',
              tags: [],
              userselect: 'true',
              audioInputEnabled: 'false',
              audioPromptMode: 'silent'
            },
            unit: [
              { unitinstructions: 'Warmup' },
              { sparcsession: {} }
            ],
          }
        }
      }
    };
    const conditionRootDoc = {
      _id: 'tdfConditionRoot',
      stimuliSetId: 'stim-set-root',
      ownerId: userId,
      conditionCounts: [2, 1],
      content: {
        fileName: 'condition-root.json',
        isMultiTdf: true,
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Condition Root',
              tags: [],
              userselect: 'true',
              audioInputEnabled: 'false',
              audioPromptMode: 'silent',
              condition: ['condition-a.json', 'condition-b.json'],
              conditionTdfIds: ['condition-a', 'condition-b']
            },
            unit: [
              { unitinstructions: { text: 'Root directions' } },
              { learningsession: {} }
            ],
          }
        }
      }
    };
    const queryCounts = {
      tdfsFind: 0,
      usersFindOne: 0,
      cacheFindOne: 0,
      dynamicSettingsFindOne: 0
    };
    const methods = createDashboardMethodsFixture({
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
      Tdfs: {
        find: () => {
          queryCounts.tdfsFind++;
          return { fetchAsync: async () => [lessonDoc, sparcDoc, conditionRootDoc] };
        },
        findOneAsync: async () => null
      },
      Assignments: { find: () => ({ fetchAsync: async () => [] }) },
      Sections: { find: () => ({ fetchAsync: async () => [] }) },
      SectionUserMap: { find: () => ({ fetchAsync: async () => [] }) },
      UserDashboardCache: {
        findOneAsync: async () => {
          queryCounts.cacheFindOne++;
          return { userId, version: DASHBOARD_CACHE_VERSION, lastUpdated: new Date(), tdfStats: {}, learnerTdfConfigs: {} };
        }
      },
      usersCollection: {
        findOneAsync: async () => {
          queryCounts.usersFindOne++;
          return { _id: userId, accessedTDFs: [] };
        },
        find: () => ({
          fetchAsync: async () => [{
            _id: 'teacher-1',
            profile: { displayName: 'Professor Ada', avatarType: 'initials' },
          }],
        }),
      },
      DynamicSettings: {
        findOneAsync: async () => {
          queryCounts.dynamicSettingsFindOne++;
          return { value: { googleTts: { keyEncrypted: 'encrypted-admin-tts' } } };
        }
      },
      serverConsole: () => {},
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    const snapshot = await (methods as any).getPracticeDashboardSnapshot.call({ userId });

    expect(snapshot.lessons).to.have.length(3);
    const videoLesson = snapshot.lessons.find((lesson: any) => lesson.TDFId === 'tdfVideo');
    const sparcLesson = snapshot.lessons.find((lesson: any) => lesson.TDFId === 'tdfSparc');
    const conditionRootLesson = snapshot.lessons.find((lesson: any) => lesson.TDFId === 'tdfConditionRoot');
    expect(videoLesson).to.include({
      TDFId: 'tdfVideo',
      firstContentUnitType: 'video',
      audioInputEnabled: true,
      audioPromptMode: 'feedback',
      hasSpeechAPIKey: true,
      hasTTSAPIKey: true
    });
    expect(sparcLesson).to.include({
      TDFId: 'tdfSparc',
      firstContentUnitType: 'sparc',
      hasConfigurableSettings: true,
      hasLearnerConfigurableSettings: false
    });
    expect(conditionRootLesson).to.include({
      TDFId: 'tdfConditionRoot',
      firstContentUnitType: 'conditionPool'
    });
    expect(conditionRootLesson.conditions).to.have.length(2);
    expect(queryCounts).to.deep.equal({
      tdfsFind: 2,
      usersFindOne: 1,
      cacheFindOne: 1,
      dynamicSettingsFindOne: 1
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

  it('computeCacheStats ignores assessment companion model rows for dashboard metrics', function() {
    const stats = computeCacheStats([
      {
        _id: 'assessment-schedule',
        outcome: 'correct',
        levelUnitType: 'schedule',
        modelEvidenceSource: 'assessment',
        CFEndLatency: 4000,
        CFFeedbackLatency: -1,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'assessment-model-companion',
        outcome: 'correct',
        levelUnitType: 'model',
        modelEvidenceSource: 'assessment',
        CFEndLatency: 4000,
        CFFeedbackLatency: -1,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      }
    ], 'Assessment Demo', (endLatency, feedbackLatency) => (endLatency ?? 0) + (feedbackLatency ?? 0));

    expect(stats.totalTrials).to.equal(1);
    expect(stats.correctTrials).to.equal(1);
    expect(stats.itemsPracticedCount).to.equal(1);
    expect(stats.itemsPracticedApplies).to.equal(true);
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

  it('incremental history application preserves distinct item and session-day aggregates', function() {
    const history = [
      {
        _id: 'h1',
        outcome: 'correct',
        levelUnitType: 'model',
        CFEndLatency: 1000,
        CFFeedbackLatency: 250,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        recordedServerTime: new Date('2026-02-10T10:00:00.000Z')
      },
      {
        _id: 'h2',
        outcome: 'incorrect',
        levelUnitType: 'model',
        CFEndLatency: 2000,
        CFFeedbackLatency: 500,
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        recordedServerTime: new Date('2026-02-10T12:00:00.000Z')
      }
    ];
    const practiceTime = (endLatency: number | null | undefined, feedbackLatency: number | null | undefined) =>
      (endLatency ?? 0) + (feedbackLatency ?? 0);

    const incremental = history.reduce(
      (stats, record) => applyDashboardHistoryRecordToStats(stats, record, 'Demo', practiceTime),
      undefined as ReturnType<typeof computeCacheStats> | undefined
    );
    const rebuilt = computeCacheStats(history, 'Demo', practiceTime);

    expect(incremental).to.deep.equal(rebuilt);
    expect(incremental?.itemsPracticedCount).to.equal(1);
    expect(incremental?.totalSessions).to.equal(1);
  });

  it('delegates current and changed refreshes to the history owner under the shared user lock', async function() {
    const userId = 'learner-1';
    const lockKeys: string[] = [];
    const calls: Array<{ userId: string; options: unknown }> = [];
    const result = { success: true as const, action: 'refreshed' as const, reason: 'history-newer' as const, tdfCount: 2 };
    const methods = createDashboardMethodsFixture({
      refreshDashboardHistory: async (targetUserId, options) => {
        calls.push({ userId: targetUserId, options });
        return result;
      },
      redisBoundary: {
        enabled: true,
        async withLock<T>(key: string, ttl: number, work: () => Promise<T>) {
          expect(ttl).to.equal(120000);
          lockKeys.push(key);
          return await work();
        },
      },
    });
    expect(await methods.ensureDashboardCacheCurrent.call({ userId })).to.equal(result);
    expect(calls).to.deep.equal([{ userId, options: undefined }]);
    expect(lockKeys).to.deep.equal(['dashboard-cache:ensure:learner-1']);
  });

  it('forces explicit initialization through the same lock after validating the target user', async function() {
    const calls: unknown[] = [];
    const methods = createDashboardMethodsFixture({
      usersCollection: { findOneAsync: async (selector: any) => { calls.push(selector); return { _id: selector._id }; } },
      refreshDashboardHistory: async (userId, options) => {
        calls.push({ userId, options });
        return { success: true, action: 'refreshed', reason: 'requested', tdfCount: 3 };
      },
      redisBoundary: {
        enabled: true,
        async withLock<T>(key: string, _ttl: number, work: () => Promise<T>) { calls.push(key); return await work(); },
      },
    });
    expect(await methods.initializeDashboardCache.call({ userId: 'learner-1' })).to.deep.include({ success: true, tdfCount: 3 });
    expect(calls).to.deep.equal([
      { _id: 'learner-1' }, 'dashboard-cache:ensure:learner-1',
      { userId: 'learner-1', options: { forceRebuild: true } },
    ]);
  });

  it('rejects unauthorized or missing-user initialization before refreshing history', async function() {
    let refreshes = 0;
    const methods = createDashboardMethodsFixture({
      Roles: { userIsInRoleAsync: async () => false },
      usersCollection: { findOneAsync: async () => null },
      refreshDashboardHistory: async () => { refreshes++; return { success: true, action: 'current', tdfCount: 0 }; },
    });
    for (const [context, target, expected] of [
      [{ userId: null }, null, 'not-authorized'],
      [{ userId: 'learner-1' }, 'other-user', 'not-authorized'],
      [{ userId: 'learner-1' }, null, 'not-found'],
    ] as const) {
      try {
        await methods.initializeDashboardCache.call(context, target);
        expect.fail('Expected initialization boundary to reject the request');
      } catch (error: any) { expect(error.error).to.equal(expected); }
    }
    try {
      await methods.ensureDashboardCacheCurrent.call({ userId: null });
      expect.fail('Expected current-cache reads to require login');
    } catch (error: any) { expect(error.error).to.equal('not-authorized'); }
    expect(refreshes).to.equal(0);
  });

  it('allows an administrator to initialize another existing user and propagates owner failure', async function() {
    const requests: unknown[] = [];
    const failure = new Error('Synthetic refresh failure');
    const methods = createDashboardMethodsFixture({
      Roles: { userIsInRoleAsync: async (userId: string, roles: string[]) => userId === 'admin-1' && roles.includes('admin') },
      refreshDashboardHistory: async (userId, options) => { requests.push({ userId, options }); throw failure; },
    });
    try {
      await methods.initializeDashboardCache.call({ userId: 'admin-1' }, 'learner-1');
      expect.fail('Expected refresh owner failure to propagate');
    } catch (error) { expect(error).to.equal(failure); }
    expect(requests).to.deep.equal([{ userId: 'learner-1', options: { forceRebuild: true } }]);
  });
  it('refreshUserAdminUsageCaches refreshes users with bounded concurrency and progress logging', async function() {
    const adminId = 'admin-1';
    const userIds = Array.from({ length: 12 }, (_value, index) => `user-${index + 1}`);
    const logs: string[] = [];
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;

    const methods = createDashboardMethodsFixture({
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
      refreshDashboardHistory: async (_userId, options) => {
        expect(options).to.deep.equal({ forceRebuild: true });
        activeRefreshes += 1;
        maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeRefreshes -= 1;
        return { success: true, action: 'refreshed', reason: 'requested', tdfCount: 0 };
      },
      Tdfs: {
        findOneAsync: async () => null,
        find: () => ({ fetchAsync: async () => [] })
      },
      UserDashboardCache: {
        upsertAsync: async () => undefined,
        findOneAsync: async () => null
      },
      usersCollection: { findOneAsync: async (_selector: any) => ({ _id: _selector._id }) },
      DynamicSettings: { findOneAsync: async () => null },
      serverConsole: (...args: any[]) => { logs.push(args.join(' ')); },
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    const result = await methods.refreshUserAdminUsageCaches.call({ userId: adminId }, userIds);

    expect(result.success).to.equal(true);
    expect(result.refreshed).to.have.length(12);
    expect(result.failed).to.deep.equal([]);
    expect(maxActiveRefreshes).to.be.greaterThan(1);
    expect(maxActiveRefreshes).to.be.at.most(4);
    expect(logs.some((line) => line.includes('Refreshing 12 user dashboard caches with concurrency 4'))).to.equal(true);
    expect(logs.some((line) => line.includes('Refreshed 10/12 user dashboard caches'))).to.equal(true);
    expect(logs.some((line) => line.includes('Refreshed 12/12 user dashboard caches'))).to.equal(true);
  });

  it('resetOwnLessonProgress deletes the condition family then delegates its cache repair to the history owner', async function() {
    const userId = 'learner-1';
    const docs = {
      root: {
        _id: 'root',
        content: {
          fileName: 'root.json',
          tdfs: {
            tutor: {
              setspec: {
                lessonname: 'Root Lesson',
                stimulusfile: 'root-stims.json',
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
    const refreshCalls: unknown[] = [];
    const operations: string[] = [];

    const methods = createDashboardMethodsFixture({
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
      removeLessonHistory: async (targetUserId, tdfIds) => {
        operations.push('history');
        removedSelectors.push({ userId: targetUserId, TDFId: { $in: tdfIds } });
        return 2;
      },
      refreshDashboardHistory: async (targetUserId, options) => {
        operations.push('refresh');
        refreshCalls.push({ userId: targetUserId, options });
        return { success: true, action: 'refreshed', reason: 'repair', tdfCount: 1 };
      },
      GlobalExperimentStates: {
        removeAsync: async (selector: any) => {
          operations.push('state');
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
            if (selector?._id?.$in?.includes('condition-a')) {
              return [docs.child];
            }
            return [];
          }
        })
      },
      Assignments: { find: () => ({ fetchAsync: async () => [] }) },
      Courses: { find: () => ({ fetchAsync: async () => [] }) },
      Sections: { find: () => ({ fetchAsync: async () => [] }) },
      SectionUserMap: { find: () => ({ fetchAsync: async () => [] }) },
      UserDashboardCache: {
        findOneAsync: async () => { throw new Error('Reset must delegate cache repair without reading old aggregates'); },
        updateAsync: async () => { throw new Error('Reset must delegate cache repair without pruning old aggregates'); },
      },
      usersCollection: { findOneAsync: async () => ({ _id: userId }) },
      DynamicSettings: { findOneAsync: async () => null },
      serverConsole: () => undefined,
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    const result = await methods.resetOwnLessonProgress.call({ userId }, 'root');

    expect(result.success).to.equal(true);
    expect(result.historyRemoved).to.equal(2);
    expect(result.experimentStateRemoved).to.equal(1);
    expect(result.cacheChanged).to.equal(true);
    expect(result.cacheTdfIds).to.deep.equal(['root']);
    expect(removedSelectors[0].TDFId.$in).to.include.members([
      'root',
      'root.json',
      'root-stims.json',
      'condition-a',
      'condition-a.json',
    ]);
    expect(stateRemovedSelectors[0].$or).to.deep.include({ TDFId: { $in: removedSelectors[0].TDFId.$in } });
    expect(removedSelectors[0].userId).to.equal(userId);
    expect(refreshCalls).to.deep.equal([{ userId, options: { forceRebuild: true } }]);
    expect(operations).to.deep.equal(['history', 'state', 'refresh']);
  });

  it('resetOwnLessonProgress fails before deleting history for the learner\'s course-assigned lessons', async function() {
    const userId = 'learner-1';
    let historyRemoveCalled = false;
    let experimentStateRemoveCalled = false;
    const methods = createDashboardMethodsFixture({
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
      removeLessonHistory: async () => {
        historyRemoveCalled = true;
        return 0;
      },
      GlobalExperimentStates: {
        removeAsync: async () => {
          experimentStateRemoveCalled = true;
          return 0;
        }
      },
      Tdfs: {
        findOneAsync: async () => ({
          _id: 'root',
          content: {
            fileName: 'root.json',
            tdfs: { tutor: { setspec: { lessonname: 'Root Lesson' } } }
          }
        }),
        find: () => ({ fetchAsync: async () => [] })
      },
      Assignments: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'assignment-1', courseId: 'course-1', TDFId: 'root' }]
        })
      },
      Courses: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'course-1', semester: 'SU_2022' }]
        })
      },
      Sections: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'section-1', courseId: 'course-1' }]
        })
      },
      SectionUserMap: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'enrollment-1', userId, sectionId: 'section-1' }]
        })
      },
      UserDashboardCache: {
        findOneAsync: async () => null,
        updateAsync: async () => undefined,
        upsertAsync: async () => undefined
      },
      usersCollection: { findOneAsync: async () => ({ _id: userId }) },
      DynamicSettings: { findOneAsync: async () => null },
      serverConsole: () => undefined,
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    try {
      await methods.resetOwnLessonProgress.call({ userId }, 'root');
      expect.fail('Expected course-assigned lesson reset to fail');
    } catch (error: any) {
      expect(error.error).to.equal('course-reset-blocked');
      expect(error.message).to.contain('course-scoped shared model reset is not implemented');
    }
    expect(historyRemoveCalled).to.equal(false);
    expect(experimentStateRemoveCalled).to.equal(false);
  });

  it('administrative cache pruning invalidates its source position so a later entry repairs the summary', async function() {
    const stats = computeCacheStats([{ _id: 'old', levelUnitType: 'model', time: 1000, outcome: 'correct' }], 'Lesson', () => 0);
    let modifier: any;
    const methods = createDashboardMethodsFixture({
      Roles: { userIsInRoleAsync: async () => true },
      UserDashboardCache: {
        find: () => ({ fetchAsync: async () => [{ _id: 'cache', tdfStats: { removed: stats, retained: stats } }] }),
        updateAsync: async (_selector: unknown, update: unknown) => { modifier = update; },
      },
    });

    expect(await methods.removeTdfFromCache.call({ userId: 'admin' }, 'removed')).to.deep.equal({ success: true, modified: 1 });
    expect(modifier.$set.tdfStats).to.have.keys(['retained']);
    expect(modifier.$set.summary.totalTrialsAllTime).to.equal(1);
    expect(modifier.$unset).to.have.keys(['lastHistorySequence', 'historyRepairRevision', 'historyTdfTargets']);
  });

  it('resetOwnLessonProgress remains available when the learner is not enrolled in the assigned course', async function() {
    const userId = 'learner-1';
    let historyRemoveCalled = false;
    const methods = createDashboardMethodsFixture({
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
      removeLessonHistory: async () => {
        historyRemoveCalled = true;
        return 0;
      },
      GlobalExperimentStates: {
        removeAsync: async () => 0
      },
      Tdfs: {
        findOneAsync: async () => ({
          _id: 'root',
          content: {
            fileName: 'root.json',
            tdfs: { tutor: { setspec: { lessonname: 'Root Lesson' } } }
          }
        }),
        find: () => ({ fetchAsync: async () => [] })
      },
      Assignments: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'assignment-1', courseId: 'course-1', TDFId: 'root' }]
        })
      },
      Courses: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'course-1', semester: 'SU_2022' }]
        })
      },
      Sections: {
        find: () => ({
          fetchAsync: async () => [{ _id: 'section-1', courseId: 'course-1' }]
        })
      },
      SectionUserMap: {
        find: () => ({
          fetchAsync: async () => []
        })
      },
      UserDashboardCache: {
        findOneAsync: async () => null,
        updateAsync: async () => undefined,
        upsertAsync: async () => undefined
      },
      usersCollection: { findOneAsync: async () => ({ _id: userId }) },
      DynamicSettings: { findOneAsync: async () => null },
      serverConsole: () => undefined,
      canViewDashboardTdf: () => true,
      getAccessibleTdf: async () => { throw new Error('Unexpected learner settings access in dashboard cache test'); },
      redisBoundary: disabledRedisBoundary
    });

    const result = await methods.resetOwnLessonProgress.call({ userId }, 'root');

    expect(result.success).to.equal(true);
    expect(historyRemoveCalled).to.equal(true);
  });
});
