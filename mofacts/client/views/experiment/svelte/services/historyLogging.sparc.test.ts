import { expect } from 'chai';
import type { UnitEngineLike } from '../../../../../common/types';
import { commitSparcProductionRulesForHistory } from './historyLogging';
import {
  clearSparcProductionRuleHistoryCache,
  hydrateSparcProductionRuleHistoryCache,
  readSparcProductionRuleHistoryRecords,
  rememberSparcProductionRuleHistoryRecord,
} from './sparcProductionRuleHistoryCache';

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
      type: 'sparc',
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
      type: 'sparc',
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
          type: 'sparc',
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
