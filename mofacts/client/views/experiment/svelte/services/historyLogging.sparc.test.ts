import { expect } from 'chai';
import type { UnitEngineLike } from '../../../../../common/types';
import { commitSparcProductionRulesForHistory } from './historyLogging';

describe('history logging SPARC production-rule bridge', function() {
  it('commits SPARC production-rule display events through the unit engine', async function() {
    const calls: unknown[] = [];
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
    expect(calls[0]).to.have.nested.property('core.anonStudentId', 'student-1');
    expect(calls[0]).to.have.nested.property('core.levelUnit', 2);
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
