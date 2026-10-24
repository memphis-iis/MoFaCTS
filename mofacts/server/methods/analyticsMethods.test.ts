import { modelPracticeHistorySelector, operationalHistorySelector } from '../../common/historyEnvelope';
import { expect } from 'chai';
import { progressiveRevisionId } from '../lib/progressiveAssignmentRevision';
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

function scoreChangeBatch() {
  const pageKey = 'species-and-speciation';
  const event = { eventId: 'response-1', type: 'response-submitted', source: { pageKey, nodeId: 'learner-response-submit' },
    time: 1710000000000, payload: { input: 'A synthetic answer.', policyId: 'dynamic-instruction-agent-v2' } };
  return [
    { suffix: 'assessment:evidence:expectation:s15', factType: 'instructional.evidence', slots: { id: 's15', demonstrated: ['Explains isolation'], incorrect: [], unresolved: ['Distinguish gene flow'], citations: [] } },
    { suffix: 'assessment:score:expectation:s15', factType: 'learningTarget.score', slots: { clusterKC: 's15', coverage: .3 } },
    { suffix: 'assessment:score:misconception:M02', factType: 'diagnostic.misconceptionScore', slots: { id: 'M02', supportStrength: 0 } },
    { suffix: 'assessment', factType: 'session.turnState', slots: { turnCount: 1 } },
  ].map(({ suffix, factType, slots }) => createHistoryRecord({ eventType: 'sparc', levelUnitType: 'sparc',
    sparc: { pageKey, sourceAddress: event.source, stateTransition: { transitionId: `response-1:${suffix}`, event,
      writes: [{ target: { pageKey, nodeId: 'root' }, key: `workingMemoryFactStable:${factType}`, value: { factType, slots } }] } } }));
}

describe('SPARC assessment batch authorization and loading', () => {
  it('authorizes one response scope, sends separate score rows to atomic storage, and loads the complete history in order', async () => {
    let saved: Record<string, unknown>[] = [];
    const { deps } = createAnalyticsDeps({
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      insertSparcHistoryBatch: async (records: Record<string, unknown>[]) => { saved = records; return records; },
      Histories: { find: (_selector: unknown, options: unknown) => {
        expect(options).to.have.property('sort'); return { fetchAsync: async () => saved };
      } },
    });
    const methods = createAnalyticsMethods(deps as unknown as Parameters<typeof createAnalyticsMethods>[0]);
    await methods.insertHistory.call({ userId: 'learner-1' }, scoreChangeBatch());
    expect(saved).to.have.length(4);
    expect(new Set(saved.map(row => row._id)).size).to.equal(4);
    const loaded = await methods.getSparcHistoryForUnit.call({ userId: 'learner-1' }, 'learner-1', 'tdf-1', 0);
    expect(loaded).to.deep.equal(saved);
  });
  it('rejects cross-user, mixed-response, invalid terminal, non-admin, and oversized batches before storage', async () => {
    let writes = 0;
    const { deps } = createAnalyticsDeps({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      insertSparcHistoryBatch: async () => { writes++; return []; } });
    const methods = createAnalyticsMethods(deps as unknown as Parameters<typeof createAnalyticsMethods>[0]);
    const denied = async (rows: Record<string, unknown>[], userId = 'learner-1') => {
      let caught; try { await methods.insertHistory.call({ userId }, rows); } catch (error) { caught = error; }
      expect(caught).to.be.instanceOf(Error);
    };
    await denied(scoreChangeBatch(), 'another-user');
    const mixed = scoreChangeBatch(); mixed[1]!.TDFId = 'other-lesson'; await denied(mixed);
    await denied(scoreChangeBatch().slice(0, 2));
    await denied([]);
    await denied(Array.from({ length: 257 }, () => scoreChangeBatch()[0]!));
    const nonAdmin = createAnalyticsMethods({ ...deps, getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }) });
    let caught; try { await nonAdmin.insertHistory.call({ userId: 'learner-1' }, scoreChangeBatch()); } catch (error) { caught = error; }
    expect(caught).to.be.instanceOf(Error);
    expect(writes).to.equal(0);
  });
});

function createAnalyticsDeps(overrides: Record<string, unknown> = {}) {
  let nextEventId = 100;
  const insertedHistory: Record<string, unknown>[] = [];
  const logEntries: unknown[][] = [];
  const deps = {
    writeConditionState: async () => null,
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
      find: () => ({ fetchAsync: async () => [] }),
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
    getTdfIdsByOwnerId: async () => [],
    assertUserOwnsTdfs: async () => true,
    canDownloadOwnedTdfData: () => false,
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
  it('refuses to merge a deleted or differently scoped state into an active system', async () => {
    for (const previous of [
      { userId: 'learner-1', TDFId: 'tdf-1', tdfDeletedAt: new Date() },
      { userId: 'learner-1', TDFId: 'old-tdf' },
      { userId: 'other-learner', TDFId: 'tdf-1' },
    ]) {
      let writes = 0;
      const { deps } = createAnalyticsDeps({ GlobalExperimentStates: {
        findOneAsync: async () => ({ _id: 'old-state', ...previous, experimentState: { progress: 99 } }),
        updateAsync: async () => { writes++; return 1; },
      } });
      let error: any;
      try { await createAnalyticsMethods(deps as any).setExperimentState.call({ userId: 'learner-1' }, 'learner-1', 'tdf-1', 'old-state', {}, 'test'); }
      catch (caught) { error = caught; }
      expect(error?.error).to.equal(403);
      expect(writes).to.equal(0);
    }
  });

  it('rejects writes after system deletion even when authorization was cached', async () => {
    const { deps, insertedHistory } = createAnalyticsDeps();
    const methods = createAnalyticsMethods(deps as any);
    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord());
    deps.Tdfs.findOneAsync = async () => null as any;
    let error: any;
    try { await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord()); }
    catch (caught) { error = caught; }
    expect(error?.error).to.equal(404);
    expect(insertedHistory.length).to.equal(1);
  });

  it('does not return retained deleted-system resume state', async () => {
    const { deps } = createAnalyticsDeps({ GlobalExperimentStates: { find: (selector: any) => {
      expect(selector).to.deep.equal({ userId: 'learner-1', TDFId: 'deleted', tdfDeletedAt: { $exists: false } });
      return { fetchAsync: async () => [] };
    } } });
    expect(await createAnalyticsMethods(deps as any).getExperimentState.call({ userId: 'learner-1' }, 'learner-1', 'deleted')).to.deep.equal({ id: null });
  });

  it('requires admin authority for competitive policy and OET writes even with a forged policy label', async function() {
    for (const admin of [false, true]) {
      const { deps, insertedHistory } = createAnalyticsDeps({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => admin }) });
      const methods = createAnalyticsMethods(deps as any);
      for (const policyId of ['dynamic-instruction-agent-v2', 'progressive-scaffolding-v1', 'dynamic-instruction-student-v2']) {
        const record = createHistoryRecord({ eventType: 'sparc', levelUnitType: 'sparcsession', sparc: { pageKey: 'p', stateTransition: {
          transitionId: `e:${policyId}`, event: {eventId: 'e', type: 'response-submitted', source: {pageKey: 'p', nodeId: 'root'}, time: 1, payload: {policyId}},
          writes: policyId === 'dynamic-instruction-student-v2' ? [] : [{target: {pageKey: 'p', nodeId: 'root'}, key: 'workingMemoryFact', value: {factType: 'instructional.oet', slots: {logit: 0}}}],
        } } });
        let error: any;
        try { await methods.insertHistory.call({userId: 'learner-1'}, record); } catch (caught) { error = caught; }
        if (admin) expect(error).to.equal(undefined); else expect(error?.error).to.equal(403);
      }
      expect(insertedHistory.length).to.equal(admin ? 3 : 0);
    }
  });

  it('accepts one SPARC decision under concurrent retries and rejects a competing option', async function() {
    const stored = new Map<string, Record<string, unknown>>(); let updates = 0;
    const base = createAnalyticsDeps();
    const { deps } = createAnalyticsDeps({
      Histories: { ...base.deps.Histories,
        insertAsync: async (record: Record<string, unknown>) => {
          const key = String(record._id);
          if (stored.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
          stored.set(key, record); return key;
        },
        findOneAsync: async (selector: Record<string, unknown>) => stored.get(String(selector._id)),
      },
      onHistoryInserted: async () => { updates++; },
    });
    const methods = createAnalyticsMethods(deps as any);
    const choice = (optionId: string) => createHistoryRecord({ eventType: 'sparc', levelUnitType: 'sparc', outcome: 'unknown',
      input: '', responseValue: '', sparc: { pageKey: 'page', sourceAddress: { pageKey: 'page', nodeId: `menu:${optionId}` },
        stateTransition: { transitionId: 'menu:choice:decision', event: { eventId: 'menu:choice', type: 'choice-selected', time: 1710000000000,
          source: { pageKey: 'page', nodeId: `menu:${optionId}` }, payload: { optionId } }, writes: [] } } });
    await Promise.all([methods.insertHistory.call({ userId: 'learner-1' }, choice('question')),
      methods.insertHistory.call({ userId: 'learner-1' }, choice('question'))]);
    expect(stored.size).to.equal(1); expect(updates).to.equal(0);
    let conflict: any;
    try { await methods.insertHistory.call({ userId: 'learner-1' }, choice('next-target')); } catch (error) { conflict = error; }
    expect(conflict?.error).to.equal('sparc-history-conflict'); expect(updates).to.equal(0);
    let denied: any;
    try { await methods.insertHistory.call({ userId: 'learner-2' }, choice('question')); } catch (error) { denied = error; }
    expect(denied?.error).to.equal(403);
  });
  it('deduplicates worksheet transport retries and rejects conflicting writes', async function() {
    const stored = new Map<string, Record<string, unknown>>(); let updates = 0;
    const base = createAnalyticsDeps();
    const { deps } = createAnalyticsDeps({
      Histories: { ...base.deps.Histories,
        insertAsync: async (record: Record<string, unknown>) => {
          const key = String(record._id);
          if (stored.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
          stored.set(key, record); return key;
        },
        findOneAsync: async (selector: Record<string, unknown>) => stored.get(String(selector._id)),
      },
      onHistoryInserted: async () => { updates++; },
    });
    const methods = createAnalyticsMethods(deps as any);
    const record = createHistoryRecord({ eventType: 'sparc', levelUnitType: 'sparc', outcome: 'unknown',
      input: '', responseValue: '', sparc: { pageKey: 'worksheet', sourceAddress: {pageKey:'worksheet',nodeId:'root'},
        worksheet: { attemptId:'attempt', checkpointIndex:0, sequence:1, writeId:'write', kind:'start', order:['q'], deadline:2000 } } });
    await Promise.all([methods.insertHistory.call({userId:'learner-1'},record), methods.insertHistory.call({userId:'learner-1'},record)]);
    expect(stored.size).to.equal(1); expect(updates).to.equal(0);
    let conflict: any;
    try { await methods.insertHistory.call({userId:'learner-1'},{...record,time:1710000001000}); } catch(error) { conflict = error; }
    expect(conflict?.error).to.equal('worksheet-history-conflict'); expect(stored.size).to.equal(1);
  });

  it('bounds worksheet history and retains learner, lesson, unit and checkpoint scope', async function() {
    let query: any; let readOptions: any; let rowCount = 0;
    const { deps } = createAnalyticsDeps({Histories: {
      find: (selector: unknown, options: unknown) => { query=selector; readOptions=options; return {fetchAsync: async()=>Array(rowCount).fill({})}; },
    }});
    const methods=createAnalyticsMethods(deps as any);
    await methods.getSparcHistoryForUnit.call({userId:'learner-1'},'learner-1','tdf-1',2,{worksheetPageKey:'page',worksheetCheckpointIndex:3});
    expect(query).to.include({userId:'learner-1',TDFId:'tdf-1',levelUnit:2,'sparc.pageKey':'page','sparc.worksheet.checkpointIndex':3});
    expect(query.courseAssignment).to.deep.equal({$exists:false}); expect(readOptions.limit).to.equal(10001);
    expect(readOptions.fields.sparc).to.equal(1); rowCount=10001;
    let limit: any;
    try { await methods.getSparcHistoryForUnit.call({userId:'learner-1'},'learner-1','tdf-1',2,{worksheetPageKey:'page',worksheetCheckpointIndex:3}); } catch(error) { limit=error; }
    expect(limit?.error).to.equal('worksheet-history-limit');
    let denied: any;
    try { await methods.getSparcHistoryForUnit.call({userId:'learner-2'},'learner-1','tdf-1',2,{worksheetPageKey:'page',worksheetCheckpointIndex:3}); } catch(error) { denied=error; }
    expect(denied?.error).to.equal(403);
  });

  it('saves an original assessment once and rejects obsolete client copies before persistence or aggregate updates', async function() {
    let crowdUpdates = 0;
    const { deps, insertedHistory } = createAnalyticsDeps({ StimulusCrowdStats: {
      upsertAsync: async () => { crowdUpdates++; }, find: () => ({ fetchAsync: async () => [] }),
    } });
    const methods = createAnalyticsMethods(deps as any);
    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
      levelUnitType: 'schedule', modelEvidenceSource: 'assessment',
    }));
    let rejected: any;
    try {
      await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({ modelEvidenceSource: 'assessment' }));
    } catch (error) { rejected = error; }
    expect(rejected?.error).to.equal('obsolete-assessment-history-write');
    expect(insertedHistory).to.have.length(1);
    expect(insertedHistory[0]?.levelUnitType).to.equal('schedule');
    expect(crowdUpdates).to.equal(1);
  });

  it('counts both answered video outcomes and excludes unrelated histories on resume', async function() {
    const selectors: Record<string, unknown>[] = [];
    const { deps } = createAnalyticsDeps({ Histories: {
      find: (selector: Record<string, unknown>) => {
        selectors.push(selector);
        return { countAsync: async () => 2 };
      },
    } });
    const methods = createAnalyticsMethods(deps as any);
    expect(await methods.getVideoCompletedCheckpointQuestionCountFromHistory.call(
      { userId: 'learner-1' }, 'learner-1', 'tdf-1', 2,
    )).to.equal(2);
    expect(selectors).to.deep.equal([{
      userId: 'learner-1', TDFId: 'tdf-1', levelUnitType: 'video', levelUnit: 2,
      studentResponseType: 'ATTEMPT', outcome: { $in: ['correct', 'incorrect'] }, ...operationalHistorySelector(),
    }]);
  });

  it('rejects an unauthorized video resume query before reading any history', async function() {
    let reads = 0;
    const { deps } = createAnalyticsDeps({ Histories: {
      find: () => { reads++; return { countAsync: async () => 0 }; },
    } });
    const methods = createAnalyticsMethods(deps as any);
    for (const caller of [null, 'other-learner']) {
      let caught: unknown;
      try {
        await methods.getVideoCompletedCheckpointQuestionCountFromHistory.call(
          { userId: caller }, 'learner-1', 'tdf-1', 2,
        );
      } catch (error) { caught = error; }
      expect(caught).to.be.instanceOf(Error);
    }
    expect(reads).to.equal(0);
  });
  function createAssignedRootDeps(overrides: Record<string, unknown> = {}) {
    return createAnalyticsDeps({
      resolveAssignedRootTdfIdsForUser: async () => ['root-tdf'],
      Tdfs: {
        find: (selector: Record<string, any>) => ({
          fetchAsync: async () => {
            const refs = [
              ...(selector._id?.$in || []),
              ...(selector.$or
              ?.flatMap((term: Record<string, any>) => [
                ...(term._id?.$in || []),
                ...(term['content.fileName']?.$in || []),
              ]) || []),
            ];
            return refs.includes('child.json') || refs.includes('child-tdf')
              ? [{ _id: 'child-tdf', content: { fileName: 'child.json' } }]
              : [];
          },
        }),
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
                      condition: ['child.json'],
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
      ...overrides,
    });
  }

  for (const userId of [undefined, null, '', '   ']) {
    for (const allocateCondition of [false, true]) {
      it(`rejects missing caller identity ${JSON.stringify(userId)} before state access (allocation=${allocateCondition})`, async function() {
        let accessedState = false;
        const failOnStateAccess = () => { accessedState = true; throw new Error('Unexpected state access'); };
        const { deps } = createAnalyticsDeps({
          writeConditionState: failOnStateAccess,
          Tdfs: { findOneAsync: failOnStateAccess },
          GlobalExperimentStates: { findOneAsync: failOnStateAccess, insertAsync: failOnStateAccess },
        });
        const methods = createAnalyticsMethods(deps as any);
        let failure: any;
        try {
          await methods.createExperimentState.call(
            userId === undefined ? {} : { userId }, { currentRootTdfId: 'root-tdf' }, { allocateCondition },
          );
        } catch (error) { failure = error; }
        expect(failure?.error).to.equal(401);
        expect(accessedState).to.equal(false);
      });
    }
  }

  it('replaces stale condition-scoped control state for an explicit fresh condition launch', async function() {
    let updateModifier: Record<string, any> | null = null;
    const { deps } = createAssignedRootDeps({
      GlobalExperimentStates: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async () => ({
          _id: 'state-1',
          userId: 'learner-1',
          TDFId: 'root-tdf',
          experimentState: {
            currentRootTdfId: 'root-tdf',
            currentTdfId: 'old-child-tdf',
            conditionTdfId: 'old-child-tdf',
            clusterMapping: [0, 1],
            mappingSignature: 'old-signature',
            schedule: { q: [0, 1] },
            scheduleUnitNumber: 0,
          },
        }),
        updateAsync: async (_selector: Record<string, unknown>, modifier: Record<string, any>) => {
          updateModifier = modifier;
          return true;
        },
        insertAsync: async () => 'state-id',
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    const result = await methods.createExperimentState.call(
      { userId: 'learner-1' },
      {
        currentRootTdfId: 'root-tdf',
        currentTdfId: 'child-tdf',
        conditionTdfId: 'child-tdf',
      },
      { replaceExistingState: true },
    );

    const persistedExperimentState = (updateModifier as Record<string, any> | null)?.$set?.experimentState;
    expect(persistedExperimentState).to.deep.equal({
      currentRootTdfId: 'root-tdf',
      currentTdfId: 'child-tdf',
      conditionTdfId: 'child-tdf',
    });
    expect(result).to.include({
      id: 'state-1',
      currentTdfId: 'child-tdf',
      conditionTdfId: 'child-tdf',
    });
  });

  it('saves history without invoking dashboard maintenance', async function() {
    let dashboardCalls = 0;
    const { deps, insertedHistory } = createAnalyticsDeps({ onHistoryInserted: async () => { dashboardCalls++; } });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;
    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord());
    expect(insertedHistory).to.have.length(1);
    expect(dashboardCalls).to.equal(0);
  });

  it('downloadOwnHistoryAcrossTdfs returns a streaming download URL without building the TSV payload', async function() {
    let exportBuilderCalled = false;
    const { deps } = createAnalyticsDeps({
      Histories: {
        find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
        findOneAsync: async () => ({ _id: 'history-1' }),
        insertAsync: async () => 'history-id',
        rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
      },
      usersCollection: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async () => ({ _id: 'learner-1', username: 'learner@example.edu' }),
      },
      createExperimentExportFromHistories: async () => {
        exportBuilderCalled = true;
        return 'unexpected payload';
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    const result = await methods.downloadOwnHistoryAcrossTdfs.call({ userId: 'learner-1' });

    expect(exportBuilderCalled).to.equal(false);
    expect(result).to.include({
      fileName: 'learning-data_learner@example.edu_own-history_all-lessons.tsv',
      contentType: 'text/tab-separated-values',
    });
    expect(result.downloadUrl).to.match(/^\/data-download\/own-history\/[^/]+\/learning-data_learner%40example.edu_own-history_all-lessons.tsv$/);
    expect(result.content).to.equal(undefined);
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

  it('allows direct history writes and reads for a released progressive member while keeping TDF scope', async function() {
    let capturedSelector: Record<string, unknown> | null = null;
    const { deps, insertedHistory } = createAssignedRootDeps({
      Assignments: {
        find: () => ({ fetchAsync: async () => [{ courseId: 'course-1' }] }),
        findOneAsync: async () => null,
      },
      Courses: {
        find: () => ({ fetchAsync: async () => [{ _id: 'course-1', visibility: 'public' }] }),
      },
      Histories: {
        find: (selector: Record<string, unknown>) => {
          capturedSelector = selector;
          return { fetchAsync: async () => [], countAsync: async () => 0 };
        },
        findOneAsync: async () => null,
        insertAsync: async (document: Record<string, unknown>) => {
          insertedHistory.push(document);
          return 'history-id';
        },
        rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({ TDFId: 'root-tdf' }));
    await methods.getLearningHistoryForUnit.call(
      { userId: 'learner-1' },
      'learner-1',
      'root-tdf',
      1,
    );

    expect(insertedHistory).to.have.length(1);
    expect(capturedSelector).to.deep.equal({
      userId: 'learner-1',
      TDFId: 'root-tdf',
      ...modelPracticeHistorySelector(),
      levelUnit: { $lte: 1 },
    });
  });

  it('getLearningHistoryForUnit always includes exact source-TDF history for an individual course launch', async function() {
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
          selector.courseId === 'course-1'
            ? { _id: 'assignment-1', assignmentType: 'lesson', TDFId: 'root-tdf' }
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
          launchMode: 'individual',
        },
      },
    );

    expect(rows).to.deep.equal(courseRows);
    expect(capturedSelector).to.deep.equal({
      userId: 'learner-1',
      ...modelPracticeHistorySelector(),
      $or: [{ TDFId: { $in: ['root-tdf'] } }],
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

  it('getStimulusCrowdStatsForDeck rejects an ordinary assigned TDF without course context', async function() {
    const { deps } = createAssignedRootDeps({
      canViewDashboardTdf: async () => true,
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    try {
      await methods.getStimulusCrowdStatsForDeck.call(
        { userId: 'learner-1' },
        'root-tdf',
        [{ stimuliSetId: 'stim-set-1', stimulusKC: '101' }],
      );
      expect.fail('Expected ordinary assigned crowd stats read without course context to fail');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course-assigned crowd stats require courseAssignment context');
    }
  });

  it('scopes progressive history to exact prefix TDFs and excludes future same-cluster lessons', async function() {
    let capturedSelector: Record<string, unknown> | null = null;
    const { deps, insertedHistory } = createAnalyticsDeps({
      Histories: {
        find: (selector: Record<string, unknown>) => {
          capturedSelector = selector;
          return { fetchAsync: async () => [], countAsync: async () => 0 };
        },
        findOneAsync: async () => null,
        insertAsync: async (document: Record<string, unknown>) => {
          insertedHistory.push(document);
          return 'history-id';
        },
        rawCollection: () => ({ aggregate: () => ({ toArray: async () => [] }) }),
      },
      Assignments: {
        find: () => ({ fetchAsync: async () => [] }),
        findOneAsync: async () => ({
          _id: 'progressive-1',
          courseId: 'course-1',
          assignmentType: 'progressive',
          memberTdfIds: ['lesson-1', 'lesson-3', 'lesson-2'],
          progressiveRevisions: {
            [progressiveRevisionId(['lesson-1', 'lesson-2', 'lesson-3'])]: ['lesson-1', 'lesson-2', 'lesson-3'],
          },
          releaseAt: null,
        }),
      },
      Courses: {
        find: () => ({ fetchAsync: async () => [{ _id: 'course-1', visibility: 'public' }] }),
      },
      Tdfs: {
        find: () => ({
          fetchAsync: async () => [
            {
              _id: 'lesson-1',
              content: { tdfs: { tutor: { unit: [{}, { learningsession: { clusterlist: '0' } }] } } },
              rawStimuliFile: { setspec: { clusters: [{ clusterKC: ' Cluster-A ' }] } },
            },
            {
              _id: 'lesson-2',
              content: { tdfs: { tutor: { unit: [{}, { learningsession: { clusterlist: '0' } }] } } },
              rawStimuliFile: { setspec: { clusters: [{ clusterKC: 'cluster-b' }] } },
            },
          ],
        }),
        findOneAsync: async () => null,
        updateAsync: async () => true,
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.getLearningHistoryForUnit.call(
      { userId: 'learner-1' },
      'learner-1',
      'lesson-2',
      1,
      false,
      {
        courseAssignment: {
          assignmentId: 'progressive-1',
          courseId: 'course-1',
          TDFId: 'lesson-2',
          launchSource: 'courses',
          launchMode: 'progressive',
          progressiveEndpointTdfId: 'lesson-2',
          progressiveRevisionId: progressiveRevisionId(['lesson-1', 'lesson-2', 'lesson-3']),
        },
      },
    );

    expect(capturedSelector).to.deep.equal({
      userId: 'learner-1',
      ...modelPracticeHistorySelector(),
      $or: [
        { TDFId: { $in: ['lesson-1', 'lesson-2'] } },
      ],
    });
    const context = { assignmentId: 'progressive-1', courseId: 'course-1', TDFId: 'lesson-1',
      launchSource: 'courses', launchMode: 'progressive', progressiveEndpointTdfId: 'lesson-2',
      progressiveRevisionId: progressiveRevisionId(['lesson-1', 'lesson-2', 'lesson-3']) };
    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
      TDFId: 'lesson-1', levelUnit: 1, courseAssignment: context,
    }));
    expect(insertedHistory).to.have.length(1);
    expect(insertedHistory[0]).to.include({ TDFId: 'lesson-1', levelUnit: 1 });
    expect(insertedHistory[0]!.courseAssignment).to.deep.equal(context);
    for (const invalidContext of [
      { ...context, TDFId: 'lesson-3' },
      { ...context, progressiveRevisionId: '0'.repeat(64) },
      { ...context, progressiveRevisionId: undefined },
    ]) {
      let rejected = false;
      try {
        await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
          TDFId: invalidContext.TDFId, levelUnit: 1, courseAssignment: invalidContext,
        }));
      } catch (error: any) {
        expect(error.error).to.equal(400);
        rejected = true;
      }
      expect(rejected).to.equal(true);
    }
    expect(insertedHistory).to.have.length(1);
  });

  it('insertHistory accepts course history for a resolved child of the assigned root TDF', async function() {
    const { deps, insertedHistory } = createAnalyticsDeps({
      Tdfs: {
        find: (selector: Record<string, any>) => ({
          fetchAsync: async () => {
            const refs = [
              ...(selector._id?.$in || []),
              ...(selector.$or
              ?.flatMap((term: Record<string, any>) => [
                ...(term._id?.$in || []),
                ...(term['content.fileName']?.$in || []),
              ]) || []),
            ];
            return refs.includes('child.json') || refs.includes('child-tdf')
              ? [{ _id: 'child-tdf', content: { fileName: 'child.json' } }]
              : [];
          },
        }),
        findOneAsync: async (selector: Record<string, unknown>) => {
          if (selector._id === 'root-tdf') {
            return {
              _id: 'root-tdf',
              content: {
                tdfs: {
                  tutor: {
                    setspec: {
                      condition: ['child.json'],
                      conditionTdfIds: ['child-tdf'],
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
          selector.courseId === 'course-1'
            ? { _id: 'assignment-1', assignmentType: 'lesson', TDFId: 'root-tdf' }
            : null
        ),
      },
      Courses: {
        find: () => ({ fetchAsync: async () => [{ _id: 'course-1', visibility: 'public' }] }),
      },
    });
    const methods = createAnalyticsMethods(deps as any) as Record<string, any>;

    await methods.insertHistory.call({ userId: 'learner-1' }, createHistoryRecord({
      TDFId: 'child-tdf',
      courseAssignment: {
        assignmentId: 'assignment-1',
        courseId: 'course-1',
        TDFId: 'root-tdf',
        launchSource: 'courses',
          launchMode: 'individual',
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
