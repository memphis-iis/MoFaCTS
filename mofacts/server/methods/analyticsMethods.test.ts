import { expect } from 'chai';
import { createAnalyticsMethods } from './analyticsMethods';

function createMeteorErrorClass() {
  return class MeteorError extends Error {
    error: string | number;

    constructor(error: string | number, reason?: string) {
      super(reason || String(error));
      this.error = error;
    }
  };
}

function createHistoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    historySchemaVersion: 1,
    userId: 'learner-1',
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    levelUnit: 0,
    levelUnitType: 'model',
    time: 1710000000000,
    problemStartTime: 1710000000000,
    selection: '',
    action: '',
    outcome: 'correct',
    typeOfResponse: 'text',
    responseValue: 'answer',
    input: 'answer',
    displayedStimulus: {},
    eventType: '',
    stimuliSetId: 'stim-set-1',
    stimulusKC: '101',
    clusterKC: '5',
    KCId: '101',
    KCDefault: '101',
    KCCluster: '5',
    ...overrides,
  };
}

function createAnalyticsDeps(overrides: Record<string, unknown> = {}) {
  let nextEventId = 100;
  const insertedHistory: Record<string, unknown>[] = [];
  const logEntries: unknown[][] = [];
  const deps = {
    serverConsole: (...args: unknown[]) => {
      logEntries.push(args);
    },
    Histories: {
      find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
      findOneAsync: async () => null,
      insertAsync: async (document: Record<string, unknown>) => {
        insertedHistory.push(document);
        return 'history-id';
      },
      rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
    },
    StimulusCrowdStats: {
      upsertAsync: async () => true,
      find: () => ({ fetchAsync: async () => [] }),
    },
    GlobalExperimentStates: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async () => null,
      updateAsync: async () => true,
      insertAsync: async () => 'state-id',
    },
    Tdfs: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async (selector: Record<string, unknown>) => ({
        _id: selector._id || 'tdf-1',
        content: {
          fileName: selector._id === 'child-tdf' ? 'child.json' : 'root.json',
          tdfs: {
            tutor: {
              setspec: {
                userselect: 'true',
              },
            },
          },
        },
        ownerId: 'teacher-1',
        accessors: [],
      }),
      updateAsync: async () => true,
    },
    Assignments: {
      findOneAsync: async () => null,
    },
    Courses: {
      find: () => ({ fetchAsync: async () => [] }),
    },
    Sections: {
      find: () => ({ fetchAsync: async () => [] }),
    },
    SectionUserMap: {
      find: () => ({ fetchAsync: async () => [] }),
    },
    usersCollection: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async () => ({ _id: 'learner-1', profile: {}, loginParams: {} }),
    },
    getMethodAuthorizationDeps: () => ({
      Meteor: { Error: createMeteorErrorClass() },
      Roles: { userIsInRoleAsync: async () => false },
    }),
    normalizeCanonicalId: (value: unknown) => {
      if (value === null || value === undefined) return null;
      const normalized = String(value).trim();
      return normalized ? normalized : null;
    },
    normalizeOptionalString: (value: unknown) => {
      if (value === null || value === undefined) return null;
      const normalized = String(value).trim();
      return normalized ? normalized : null;
    },
    canViewDashboardTdf: async () => false,
    resolveAssignedRootTdfIdsForUser: async () => [],
    allocateNextEventId: () => {
      nextEventId += 1;
      return nextEventId;
    },
    syncUsernameCaches: () => {},
    createExperimentExport: async () => '',
    createExperimentExportByTdfIds: async () => '',
    createExperimentExportFromHistories: async () => '',
    getTdfNamesByOwnerId: async () => [],
    assertUserOwnsTdfs: async () => true,
    canDownloadOwnedTdfData: () => false,
    resolveConditionTdfIds: async () => [],
    getClassPerformanceByTdfWorkflow: async () => ({}),
    getStimuliSetById: async () => [],
    hasMeaningfulProgressSignal: () => false,
    ...overrides,
  };

  return {
    deps,
    insertedHistory,
    logEntries,
  };
}

describe('analyticsMethods', function() {
  function createAssignedRootDeps(overrides: Record<string, unknown> = {}) {
    return createAnalyticsDeps({
      resolveAssignedRootTdfIdsForUser: async () => ['root-tdf'],
      Tdfs: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async (selector: Record<string, unknown>) => {
          if (selector._id === 'root-tdf') {
            return {
              _id: 'root-tdf',
              stimuliSetId: 'stim-set-1',
              content: {
                fileName: 'root.json',
                tdfs: {
                  tutor: {
                    setspec: {
                      conditionTdfIds: ['child-tdf'],
                    },
                  },
                },
              },
            };
          }
          if (selector._id === 'child-tdf') {
            return {
              _id: 'child-tdf',
              stimuliSetId: 'stim-set-1',
              content: { fileName: 'child.json' },
            };
          }
          return null;
        },
        updateAsync: async () => true,
      },
      resolveConditionTdfIds: async () => ['child-tdf'],
      ...overrides,
    });
  }

  it('insertHistory invokes the dashboard summary hook after durable history insert', async function() {
    const hookRecords: Record<string, unknown>[] = [];
    const { deps, insertedHistory } = createAnalyticsDeps({
      onHistoryInserted: async (_context: unknown, historyRecord: Record<string, unknown>) => {
        hookRecords.push(historyRecord);
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord());

    expect(insertedHistory).to.have.length(1);
    expect(hookRecords).to.have.length(1);
    const persistedHookRecord = hookRecords[0]!;
    expect(persistedHookRecord).to.equal(insertedHistory[0]);
    expect(persistedHookRecord).to.include({
      userId: 'learner-1',
      TDFId: 'tdf-1',
      eventId: 101,
    });
    expect(persistedHookRecord.recordedServerTime).to.be.a('number');
  });

  it('insertHistory keeps the durable history write when the dashboard hook fails', async function() {
    const { deps, insertedHistory, logEntries } = createAnalyticsDeps({
      onHistoryInserted: async () => {
        throw new Error('cache update failed');
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord());

    expect(insertedHistory).to.have.length(1);
    expect(logEntries.some((entry) => String(entry[0]).includes('Dashboard cache update failed'))).to.equal(true);
  });

  it('insertHistory rejects assigned-root history without course context', async function() {
    const { deps, insertedHistory } = createAssignedRootDeps();
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
        TDFId: 'root-tdf',
      }));
      expect.fail('Expected assigned-root history without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned history requires courseAssignment context');
    }
    expect(insertedHistory).to.have.length(0);
  });

  it('insertHistory rejects assigned child history without course context', async function() {
    const { deps, insertedHistory } = createAssignedRootDeps();
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
        TDFId: 'child-tdf',
      }));
      expect.fail('Expected assigned child history without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned history requires courseAssignment context');
    }
    expect(insertedHistory).to.have.length(0);
  });

  it('getLearningHistoryForUnit rejects assigned TDF reads without course context', async function() {
    const { deps } = createAssignedRootDeps();
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.getLearningHistoryForUnit.call({ userId: 'learner-1' }, 'learner-1', 'root-tdf', 1);
      expect.fail('Expected assigned learning history read without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned learning history requires courseAssignment context');
    }
  });

  it('getLearningHistoryForUnit loads all course model history without requiring current-unit clusterKCs', async function() {
    const courseRows = [
      createHistoryRecord({
        _id: 'history-1',
        TDFId: 'sparc-tdf',
        clusterKC: 'fractions.lcd',
      }),
      createHistoryRecord({
        _id: 'history-2',
        TDFId: 'definitions-tdf',
        clusterKC: 'fractions.add-numerators',
      }),
    ];
    let capturedSelector: Record<string, unknown> | null = null;
    let capturedFindOptions: Record<string, unknown> | null = null;
    const { deps } = createAssignedRootDeps({
      Histories: {
        find: (selector: Record<string, unknown>, options?: Record<string, unknown>) => {
          capturedSelector = selector;
          capturedFindOptions = options || null;
          return {
            fetchAsync: async () => courseRows,
            countAsync: async () => courseRows.length,
          };
        },
        findOneAsync: async () => null,
        insertAsync: async () => 'history-id',
        rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
      },
      Assignments: {
        findOneAsync: async (selector: Record<string, unknown>) => (
          selector._id === 'assignment-1' &&
          selector.courseId === 'course-1' &&
          selector.TDFId === 'root-tdf'
            ? { _id: 'assignment-1' }
            : null
        ),
      },
      Courses: {
        find: () => ({ fetchAsync: async () => [{ _id: 'course-1', visibility: 'public' }] }),
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    const rows = await methods.getLearningHistoryForUnit.call(
      { userId: 'learner-1' },
      'learner-1',
      'root-tdf',
      1,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-1',
          courseId: 'course-1',
          TDFId: 'root-tdf',
          launchSource: 'courses',
        },
      },
    );

    expect(rows).to.deep.equal(courseRows);
    expect(capturedSelector).to.deep.equal({
      userId: 'learner-1',
      levelUnitType: 'model',
      'courseAssignment.courseId': 'course-1',
    });
    expect(capturedFindOptions).to.deep.include({
      sort: { time: 1 },
    });
  });

  it('getSparcHistoryForUnit rejects assigned child reads without course context', async function() {
    const { deps } = createAssignedRootDeps();
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.getSparcHistoryForUnit.call({ userId: 'learner-1' }, 'learner-1', 'child-tdf', 1);
      expect.fail('Expected assigned SPARC history read without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned SPARC history requires courseAssignment context');
    }
  });

  it('getStimulusCrowdStatsForDeck rejects assigned TDF reads without course context before dashboard visibility', async function() {
    const { deps } = createAssignedRootDeps({
      canViewDashboardTdf: async () => true,
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.getStimulusCrowdStatsForDeck.call({ userId: 'learner-1' }, 'root-tdf', ['101']);
      expect.fail('Expected assigned crowd stats read without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned crowd stats require courseAssignment context');
    }
  });

  it('insertHistory accepts course history for a resolved child of the assigned root TDF', async function() {
    const { deps, insertedHistory } = createAnalyticsDeps({
      Tdfs: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async (selector: Record<string, unknown>) => {
          if (selector._id === 'root-tdf') {
            return {
              _id: 'root-tdf',
              content: {
                tdfs: {
                  tutor: {
                    setspec: {
                      condition: ['child.json'],
                    },
                  },
                },
              },
            };
          }
          if (selector._id === 'child-tdf') {
            return { _id: 'child-tdf', content: { fileName: 'child.json' } };
          }
          return null;
        },
        updateAsync: async () => true,
      },
      Assignments: {
        findOneAsync: async (selector: Record<string, unknown>) => (
          selector._id === 'assignment-1' &&
          selector.courseId === 'course-1' &&
          selector.TDFId === 'root-tdf'
            ? { _id: 'assignment-1' }
            : null
        ),
      },
      Courses: {
        find: () => ({ fetchAsync: async () => [{ _id: 'course-1', visibility: 'public' }] }),
      },
      resolveConditionTdfIds: async () => ['child-tdf'],
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
      TDFId: 'child-tdf',
      courseAssignment: {
        assignmentId: 'assignment-1',
        courseId: 'course-1',
        TDFId: 'root-tdf',
        launchSource: 'courses',
      },
    }));

    expect(insertedHistory).to.have.length(1);
    expect(insertedHistory[0]?.courseAssignment).to.deep.include({
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'root-tdf',
    });
  });
});
