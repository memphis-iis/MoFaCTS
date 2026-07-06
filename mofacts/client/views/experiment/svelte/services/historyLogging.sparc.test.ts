import { expect } from 'chai';
import type { UnitEngineLike } from '../../../../../common/types';
import { commitSparcProductionRulesForHistory } from './historyLogging';
import {
  clearSparcProductionRuleHistoryCache,
  hydrateSparcProductionRuleHistoryCache,
  readSparcProductionRuleHistoryRecords,
  readSparcProductionRuleReplaySession,
  rememberSparcProductionRuleHistoryRecord,
} from './sparcProductionRuleHistoryCache';
import {
  createSparcStateCellKey,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';

describe('history logging SPARC production-rule bridge', function() {
  afterEach(function() {
    clearSparcProductionRuleHistoryCache();
  });

  it('commits SPARC production-rule display events through the unit engine', async function() {
    const calls: unknown[] = [];
    const priorRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'sparc-fractions-addition',
        sourceAddress: {
          documentId: 'sparc-fractions-addition',
          nodeId: 'root',
        },
      },
    };
    rememberSparcProductionRuleHistoryRecord(priorRecord);
    const display = {
      documentId: 'sparc-fractions-addition',
      nodes: [],
      productionRules: [{ id: 'fractions.determine-lcd', when: [], then: [] }],
    };
    const sparcResult = {
      submittedNodes: { firstDen: '12' },
      timestamp: 3000,
    };

    await commitSparcProductionRulesForHistory({
      engine: {
        async commitSparcTrialDisplayProductionRuleEvents(params: unknown) {
          calls.push(params);
        },
      } as unknown as UnitEngineLike,
      currentDisplay: display,
      sparcResult,
      record: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        anonStudentId: 'student-1',
      },
    });

    expect(calls).to.have.length(1);
    expect(calls[0]).to.include({
      documentId: 'sparc-fractions-addition',
      display,
      result: sparcResult,
    });
    expect(calls[0]).to.have.deep.property('priorHistoryRecords', [priorRecord]);
    expect(calls[0]).to.have.nested.property('core.anonStudentId', 'student-1');
    expect(calls[0]).to.have.nested.property('core.levelUnit', 2);
  });

  it('remembers canonical SPARC records after successful production-rule history writes', async function() {
    const display = {
      documentId: 'sparc-fractions-addition',
      nodes: [],
      productionRules: [{ id: 'fractions.determine-lcd', when: [], then: [] }],
    };
    const writtenRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'sparc-fractions-addition',
        sourceAddress: {
          documentId: 'sparc-fractions-addition',
          nodeId: 'node-known-1-equivalent-bottom',
        },
      },
    };

    await commitSparcProductionRulesForHistory({
      engine: {
        async commitSparcTrialDisplayProductionRuleEvents(params: {
          history: { writeCanonicalHistory(record: typeof writtenRecord): Promise<void> };
        }) {
          await params.history.writeCanonicalHistory(writtenRecord);
        },
      } as unknown as UnitEngineLike,
      currentDisplay: display,
      sparcResult: {
        submittedNodes: { firstDen: '12' },
        timestamp: 3000,
      },
      record: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        anonStudentId: 'student-1',
      },
    });

    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'sparc-fractions-addition',
    })).to.deep.equal([writtenRecord]);
  });

  it('hydrates durable SPARC production-rule history by document key', function() {
    const durableRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'sparc-fractions-addition',
        sourceAddress: {
          documentId: 'sparc-fractions-addition',
          nodeId: 'node-known-1-equivalent-bottom',
        },
      },
    };

    hydrateSparcProductionRuleHistoryCache([durableRecord]);

    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'sparc-fractions-addition',
    })).to.deep.equal([durableRecord]);
    expect(() => hydrateSparcProductionRuleHistoryCache([{
      ...durableRecord,
      eventType: 'h5p',
    }])).to.throw('[SPARC] Durable history hydration received a non-SPARC record');
    expect(() => hydrateSparcProductionRuleHistoryCache([{
      ...durableRecord,
      sparc: {},
    }])).to.throw('[SPARC] Durable history record missing sparc.documentId');
  });

  it('replaces hydrated document history without clearing unrelated document scopes', function() {
    const staleDocumentRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'stale-node',
        },
      },
    };
    const retainedOtherDocumentRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-2',
        sourceAddress: {
          documentId: 'doc-2',
          nodeId: 'other-node',
        },
      },
    };
    const hydratedDocumentRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'fresh-node',
        },
      },
    };

    rememberSparcProductionRuleHistoryRecord(staleDocumentRecord);
    rememberSparcProductionRuleHistoryRecord(retainedOtherDocumentRecord);
    hydrateSparcProductionRuleHistoryCache([hydratedDocumentRecord]);

    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    })).to.deep.equal([hydratedDocumentRecord]);
    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-2',
    })).to.deep.equal([retainedOtherDocumentRecord]);
  });

  it('hydrates a document replay session from canonical SPARC state-transition history', function() {
    const stateRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'source-node',
        },
        stateTransition: {
          transitionId: 'transition-1',
          event: {
            eventId: 'event-1',
            type: 'value-changed',
            source: {
              documentId: 'doc-1',
              nodeId: 'source-node',
            },
            time: 2000,
          },
          writes: [{
            target: {
              documentId: 'doc-1',
              nodeId: 'answer-node',
            },
            key: 'value',
            value: '42',
          }],
        },
      },
    };

    hydrateSparcProductionRuleHistoryCache([stateRecord]);
    const session = readSparcProductionRuleReplaySession({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    });
    const cellKey = createSparcStateCellKey({
      documentId: 'doc-1',
      nodeId: 'answer-node',
    }, 'value');

    expect(session?.retainedHistoryRecords).to.deep.equal([stateRecord]);
    expect(session?.replayState.cells[cellKey]?.value).to.equal('42');
    expect(session?.replayState.transitions).to.have.length(1);
  });

  it('clears SPARC replay sessions by explicit document scope', function() {
    const docOneRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
      },
    };
    const docTwoRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-2',
        sourceAddress: {
          documentId: 'doc-2',
          nodeId: 'node-2',
        },
      },
    };

    hydrateSparcProductionRuleHistoryCache([docOneRecord, docTwoRecord]);
    clearSparcProductionRuleHistoryCache({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    });

    expect(readSparcProductionRuleReplaySession({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    })).to.equal(null);
    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-2',
    })).to.deep.equal([docTwoRecord]);
  });

  it('returns immutable snapshots of cached SPARC history records', function() {
    const cachedRecord = {
      eventType: 'sparc',
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
      },
    };

    rememberSparcProductionRuleHistoryRecord(cachedRecord);
    const firstRead = readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    });
    (firstRead as typeof cachedRecord[]).push({
      ...cachedRecord,
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'mutated-node',
        },
      },
    });

    expect(readSparcProductionRuleHistoryRecords({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      documentId: 'doc-1',
    })).to.deep.equal([cachedRecord]);
  });

  it('requires authored documentId on SPARC production-rule displays', async function() {
    let rejectionMessage = '';

    try {
      await commitSparcProductionRulesForHistory({
        engine: {
          async commitSparcTrialDisplayProductionRuleEvents() {
            throw new Error('engine should not be called');
          },
        } as unknown as UnitEngineLike,
        currentDisplay: {
          nodes: [],
          productionRules: [{ id: 'fractions.determine-lcd', when: [], then: [] }],
        },
        sparcResult: {
          submittedNodes: { firstDen: '12' },
          timestamp: 3000,
        },
        record: {
          TDFId: 'tdf-1',
          sessionID: 'session-1',
          levelUnit: 2,
          userId: 'user-1',
        },
      });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
    }

    expect(rejectionMessage).to.equal('[History Logging] SPARC production-rule display requires documentId');
  });
});
