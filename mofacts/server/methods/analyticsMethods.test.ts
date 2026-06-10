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
      findOneAsync: async () => ({
        _id: 'tdf-1',
        ownerId: 'teacher-1',
        accessors: [],
        content: {
          tdfs: {
            tutor: {
              setspec: {
                userselect: 'true',
              },
            },
          },
        },
      }),
      updateAsync: async () => true,
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
});
