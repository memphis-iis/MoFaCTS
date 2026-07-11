import assert from 'node:assert/strict';
import type { ModelPracticeUpdateRequest } from '../../runtime/modelPracticeUpdates';
import {
  commitSparcAuthoredProductionRuleEvent,
  evaluateSparcAuthoredProductionRules,
} from './sparcProductionRuleCommit';
import { createSparcAuthoredInitialReplayState } from './sparcAuthoredInitialState';
import { createSparcStateCellKey, replaySparcHistory } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcRuleExpression,
} from './sparcSessionContracts';

const sourceAddress = {
  pageKey: 'fractions-doc',
  nodeId: 'firstDenConv',
};

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });
const fn = (
  name: Extract<SparcRuleExpression, { type: 'function' }>['name'],
  args: readonly SparcRuleExpression[],
): SparcRuleExpression => ({ type: 'function', name, args });

const document: SparcAuthoredDocument = {
  id: 'fractions-doc',
  schemaVersion: 1,
  workingMemoryFacts: [{
    factType: 'problem',
    slots: {
      type: 'fraction-addition',
      firstDenominator: 4,
      secondDenominator: 6,
    },
  }, {
    factType: 'node-role',
    slots: {
      node: 'firstDenConv',
      role: 'converted-denominator',
    },
  }],
  productionRules: [{
    id: 'fractions.determine-lcd',
    module: 'fraction-addition',
    when: [{
      factType: 'problem',
      slots: {
        type: { type: 'literal', value: 'fraction-addition' },
        firstDenominator: { type: 'bind', variable: 'd1' },
        secondDenominator: { type: 'bind', variable: 'd2' },
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: { type: 'literal', value: 'firstDenConv' },
        action: { type: 'literal', value: 'UpdateTextArea' },
        input: { type: 'bind', variable: 'D' },
      },
    }, {
      factType: 'node-role',
      slots: {
        node: { type: 'literal', value: 'firstDenConv' },
        role: { type: 'literal', value: 'converted-denominator' },
      },
    }],
    tests: [{
      op: 'eq',
      left: variable('D'),
      right: fn('lcm', [variable('d1'), variable('d2')]),
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'model',
        slots: {
          name: literal('active-common-denominator'),
          value: variable('D'),
          strategy: literal('lcd'),
        },
      },
    }, {
      type: 'write-state',
      write: {
        target: sourceAddress,
        key: 'correctness',
        value: literal('correct'),
      },
    }, {
      type: 'write-state',
      write: {
        target: sourceAddress,
        key: 'value',
        value: variable('D'),
      },
    }, {
      type: 'message',
      messageType: 'hint',
      template: "Enter '{D}', the least common denominator between both fractions.",
    }],
  }],
  root: {
    id: 'root',
    kind: 'document',
    children: [{
      id: 'firstDenConv',
      kind: 'input',
    }],
  },
};

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 2,
  userId: 'user-1',
};

describe('sparcProductionRuleCommit', function() {
  it('evaluates authored production rules from event and document facts', function() {
    const result = evaluateSparcAuthoredProductionRules({
      document,
      replayState: createSparcAuthoredInitialReplayState(document),
      event: {
        eventId: 'event-1',
        type: 'value-changed',
        source: sourceAddress,
        time: 1000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
    });

    assert.deepEqual(result.execution.firings.map((firing) => firing.ruleId), ['fractions.determine-lcd']);
    assert.equal(result.transition?.writes.length, 3);
    assert.equal(
      result.transition?.event.payload?.productionRuleFirings instanceof Array,
      true,
    );
    assert.equal(
      result.execution.firings[0]?.messages[0]?.text,
      "Enter '12', the least common denominator between both fractions.",
    );
  });

  it('writes and replays canonical history for production-rule state effects', async function() {
    const writtenRecords: unknown[] = [];
    const replayState = createSparcAuthoredInitialReplayState(document);

    const committed = await commitSparcAuthoredProductionRuleEvent({
      core,
      document,
      replayState,
      event: {
        eventId: 'event-2',
        type: 'value-changed',
        source: sourceAddress,
        time: 2000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(committed.historyRecord?.action, 'sparc-production-rule');
    assert.equal(committed.traceHistoryRecords?.length, 1);
    assert.deepEqual(writtenRecords, [
      committed.traceHistoryRecords?.[0],
      committed.historyRecord,
    ]);
    assert.equal(committed.traceHistoryRecords?.[0]?.action, 'sparc-production-rule-trace');
    assert.equal(committed.traceHistoryRecords?.[0]?.sparc.traceStep?.productionRuleId, 'fractions.determine-lcd');

    const replayed = replaySparcHistory([
      committed.traceHistoryRecords![0]!,
      committed.historyRecord!,
    ], replayState);
    assert.equal(replayed.cells[createSparcStateCellKey(sourceAddress, 'correctness')]?.value, 'correct');
    assert.equal(replayed.cells[createSparcStateCellKey(sourceAddress, 'value')]?.value, 12);
    assert.equal(replayed.traceSteps.length, 1);
  });

  it('traces derived-rule executions before rules that consume their produced facts', async function() {
    const writtenRecords: unknown[] = [];
    const documentWithDerivedRule: SparcAuthoredDocument = {
      ...document,
      derivedFacts: [{
        id: 'select-lcd-path',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
            input: { type: 'bind', variable: 'selectedDenominator' },
          },
        }],
        tests: [{
          op: 'eq',
          left: variable('selectedDenominator'),
          right: literal(12),
        }],
        fact: {
          factType: 'fraction.activePath',
          slots: {
            path: literal('lcd'),
          },
        },
      }],
      productionRules: [{
        id: 'fractions.consume-derived-path',
        module: 'fraction-addition',
        when: [{
          factType: 'fraction.activePath',
          slots: {
            path: { type: 'literal', value: 'lcd' },
          },
        }, {
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
          },
        }],
        then: [{
          type: 'classify',
          outcome: 'correct',
        }],
      }],
    };

    const committed = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: documentWithDerivedRule,
      replayState: createSparcAuthoredInitialReplayState(documentWithDerivedRule),
      event: {
        eventId: 'event-derived',
        type: 'value-changed',
        source: sourceAddress,
        time: 2500,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.deepEqual(
      committed.traceHistoryRecords?.map((record) => record.sparc.traceStep?.productionRuleId),
      [
        'derived-fact:select-lcd-path',
        'fractions.consume-derived-path',
      ],
    );
    assert.equal(committed.traceHistoryRecords?.[0]?.sparc.traceStep?.details?.derivedFactId, 'select-lcd-path');
    assert.equal(committed.traceHistoryRecords?.[0]?.sparc.traceStep?.details?.salience, 0);
    assert.deepEqual(writtenRecords, committed.traceHistoryRecords);
  });

  it('writes production-rule trace history for system events without student input', async function() {
    const writtenRecords: unknown[] = [];
    const controllerDocument: SparcAuthoredDocument = {
      id: 'controller-doc',
      schemaVersion: 1,
      workingMemoryFacts: [{
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: 'kc-1',
        },
      }],
      productionRules: [{
        id: 'controller.select-hint',
        module: 'autotutor-controller',
        salience: 25,
        when: [{
          factType: 'interface-event',
          slots: {
            eventType: { type: 'literal', value: 'condition-evaluated' },
          },
        }, {
          factType: 'learningTarget.selected',
          slots: {
            clusterKC: { type: 'bind', variable: 'targetClusterKC' },
          },
        }],
        then: [{
          type: 'assert-fact',
          persist: true,
          fact: {
            factType: 'controller.selectedAction',
            slots: {
              action: literal('hint'),
              targetType: literal('learningTarget'),
              clusterKC: variable('targetClusterKC'),
            },
          },
        }, {
          type: 'terminate-production-phase',
          reason: 'move-selected',
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
      },
    };

    const committed = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: controllerDocument,
      event: {
        eventId: 'event-controller',
        type: 'condition-evaluated',
        source: {
          pageKey: 'controller-doc',
          nodeId: 'root',
        },
        time: 2500,
        payload: {
          triggeredBy: 'controller',
        },
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(committed.execution.firings.length, 1);
    assert.equal(committed.traceHistoryRecords?.length, 1);
    assert.equal(committed.historyRecord?.action, 'sparc-production-rule');
    assert.equal(writtenRecords.length, 2);
    const traceRecord = committed.traceHistoryRecords?.[0];
    assert.equal(traceRecord?.responseValue, '');
    assert.equal(traceRecord?.input, '');
    assert.equal(traceRecord?.sparc.traceStep?.productionRuleId, 'controller.select-hint');
    assert.equal(traceRecord?.sparc.traceStep?.actionId, 'hint');
    assert.deepEqual(traceRecord?.sparc.traceStep?.details?.selectedAction, {
      action: 'hint',
      targetType: 'learningTarget',
      clusterKC: 'kc-1',
    });
    assert.equal(traceRecord?.sparc.traceStep?.details?.salience, 25);
    assert.equal(traceRecord?.sparc.traceStep?.details?.terminatesProductionPhase, true);
  });

  it('rehydrates asserted working-memory facts for later production-rule events', async function() {
    const crossEventDocument: SparcAuthoredDocument = {
      id: 'fractions-doc',
      schemaVersion: 1,
      workingMemoryFacts: [{
        factType: 'problem',
        slots: {
          type: 'fraction-addition',
          firstNumerator: 1,
          firstDenominator: 4,
          secondDenominator: 6,
        },
      }],
      productionRules: [{
        id: 'fractions.determine-lcd',
        when: [{
          factType: 'problem',
          slots: {
            type: { type: 'literal', value: 'fraction-addition' },
            firstDenominator: { type: 'bind', variable: 'd1' },
            secondDenominator: { type: 'bind', variable: 'd2' },
          },
        }, {
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
            input: { type: 'bind', variable: 'D' },
          },
        }],
        tests: [{
          op: 'eq',
          left: variable('D'),
          right: fn('lcm', [variable('d1'), variable('d2')]),
        }],
        then: [{
          type: 'assert-fact',
          fact: {
            factType: 'model',
            slots: {
              name: literal('active-common-denominator'),
              value: variable('D'),
            },
          },
        }],
      }, {
        id: 'fractions.convert-first-numerator',
        when: [{
          factType: 'problem',
          slots: {
            type: { type: 'literal', value: 'fraction-addition' },
            firstNumerator: { type: 'bind', variable: 'n' },
            firstDenominator: { type: 'bind', variable: 'd' },
          },
        }, {
          factType: 'model',
          slots: {
            name: { type: 'literal', value: 'active-common-denominator' },
            value: { type: 'bind', variable: 'D' },
          },
        }, {
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstNumConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
            input: { type: 'bind', variable: 'convertedNumerator' },
          },
        }],
        tests: [{
          op: 'eq',
          left: variable('convertedNumerator'),
          right: fn('multiply', [
            variable('n'),
            fn('divide', [variable('D'), variable('d')]),
          ]),
        }],
        then: [{
          type: 'write-state',
          write: {
            target: {
              pageKey: 'fractions-doc',
              nodeId: 'firstNumConv',
            },
            key: 'value',
            value: variable('convertedNumerator'),
          },
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
      },
    };
    const replayState = createSparcAuthoredInitialReplayState(crossEventDocument);
    const committedDenominator = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: crossEventDocument,
      replayState,
      event: {
        eventId: 'event-denominator',
        type: 'value-changed',
        source: sourceAddress,
        time: 1000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
      runtime: {
        history: {
          async writeCanonicalHistory() {
          },
        },
      },
    });
    const replayedAfterDenominator = replaySparcHistory(
      [committedDenominator.historyRecord!],
      replayState,
    );

    const numeratorEvaluation = evaluateSparcAuthoredProductionRules({
      document: crossEventDocument,
      replayState: replayedAfterDenominator,
      event: {
        eventId: 'event-numerator',
        type: 'value-changed',
        source: {
          pageKey: 'fractions-doc',
          nodeId: 'firstNumConv',
        },
        time: 2000,
        payload: {
          selection: 'firstNumConv',
          action: 'UpdateTextArea',
          input: 3,
        },
      },
    });

    assert.deepEqual(
      numeratorEvaluation.execution.firings.map((firing) => firing.ruleId),
      ['fractions.convert-first-numerator'],
    );
    assert.equal(numeratorEvaluation.transition?.writes[0]?.value, 3);
  });

  it('uses asserted fact identity slots to replace stale branch state before later rules fire', async function() {
    const branchDocument: SparcAuthoredDocument = {
      id: 'fractions-doc',
      schemaVersion: 1,
      workingMemoryFacts: [{
        factType: 'problem',
        slots: {
          type: 'fraction-addition',
          firstNumerator: 1,
          firstDenominator: 4,
          secondDenominator: 6,
        },
      }, {
        factType: 'node-role',
        slots: {
          node: 'firstNumConv',
          selection: 'firstNumConv',
          role: 'converted-numerator',
          fraction: 'first',
        },
      }],
      productionRules: [{
        id: 'fractions.choose-lcd',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
            input: { type: 'literal', value: 12 },
          },
        }],
        then: [{
          type: 'assert-fact',
          identitySlots: ['name'],
          fact: {
            factType: 'model',
            slots: {
              name: literal('active-common-denominator'),
              value: literal(12),
              path: literal('lcd-12'),
            },
          },
        }],
      }, {
        id: 'fractions.choose-product',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
            input: { type: 'literal', value: 24 },
          },
        }],
        then: [{
          type: 'assert-fact',
          identitySlots: ['name'],
          fact: {
            factType: 'model',
            slots: {
              name: literal('active-common-denominator'),
              value: literal(24),
              path: literal('common-denominator-24'),
            },
          },
        }],
      }, {
        id: 'fractions.convert-first-numerator',
        when: [{
          factType: 'problem',
          slots: {
            type: { type: 'literal', value: 'fraction-addition' },
            firstNumerator: { type: 'bind', variable: 'n' },
            firstDenominator: { type: 'bind', variable: 'd' },
          },
        }, {
          factType: 'model',
          slots: {
            name: { type: 'literal', value: 'active-common-denominator' },
            value: { type: 'bind', variable: 'D' },
          },
        }, {
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstNumConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
            input: { type: 'bind', variable: 'convertedNumerator' },
          },
        }, {
          factType: 'node-role',
          slots: {
            selection: { type: 'literal', value: 'firstNumConv' },
            role: { type: 'literal', value: 'converted-numerator' },
            fraction: { type: 'literal', value: 'first' },
          },
        }],
        tests: [{
          op: 'eq',
          left: variable('convertedNumerator'),
          right: fn('multiply', [
            variable('n'),
            fn('divide', [variable('D'), variable('d')]),
          ]),
        }],
        then: [{
          type: 'classify',
          outcome: 'correct',
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
      },
    };
    const replayState = createSparcAuthoredInitialReplayState(branchDocument);
    const writtenRecords: unknown[] = [];
    const history = {
      async writeCanonicalHistory(record: unknown) {
        writtenRecords.push(record);
      },
    };
    const product = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: branchDocument,
      replayState,
      event: {
        eventId: 'event-product',
        type: 'response-submitted',
        source: sourceAddress,
        time: 1000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 24,
        },
      },
      runtime: { history },
    });
    const afterProduct = replaySparcHistory([product.historyRecord!], replayState);
    const lcd = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: branchDocument,
      replayState: afterProduct,
      event: {
        eventId: 'event-lcd',
        type: 'response-submitted',
        source: sourceAddress,
        time: 2000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
      runtime: { history },
    });
    const afterLcd = replaySparcHistory([lcd.historyRecord!], afterProduct);

    const staleProductNumerator = evaluateSparcAuthoredProductionRules({
      document: branchDocument,
      replayState: afterLcd,
      event: {
        eventId: 'event-numerator-stale',
        type: 'response-submitted',
        source: {
          pageKey: 'fractions-doc',
          nodeId: 'firstNumConv',
        },
        time: 3000,
        payload: {
          selection: 'firstNumConv',
          action: 'UpdateTextArea',
          input: 6,
        },
      },
    });
    const lcdNumerator = evaluateSparcAuthoredProductionRules({
      document: branchDocument,
      replayState: afterLcd,
      event: {
        eventId: 'event-numerator-lcd',
        type: 'response-submitted',
        source: {
          pageKey: 'fractions-doc',
          nodeId: 'firstNumConv',
        },
        time: 4000,
        payload: {
          selection: 'firstNumConv',
          action: 'UpdateTextArea',
          input: 3,
        },
      },
    });

    assert.deepEqual(staleProductNumerator.execution.firings.map((firing) => firing.ruleId), []);
    assert.deepEqual(lcdNumerator.execution.firings.map((firing) => firing.ruleId), [
      'fractions.convert-first-numerator',
    ]);
    assert.equal(writtenRecords.length, 4);
  });

  it('writes trace history when production rules produce no state writes', async function() {
    const writtenRecords: unknown[] = [];
    const noWriteDocument: SparcAuthoredDocument = {
      ...document,
      productionRules: [{
        ...document.productionRules![0]!,
        then: [{
          type: 'message',
          messageType: 'hint',
          template: 'Message only.',
        }],
      }],
    };

    const committed = await commitSparcAuthoredProductionRuleEvent({
      core,
      document: noWriteDocument,
      event: {
        eventId: 'event-3',
        type: 'value-changed',
        source: sourceAddress,
        time: 3000,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
        },
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(committed.historyRecord, undefined);
    assert.equal(committed.transition, undefined);
    assert.equal(committed.execution.firings.length, 1);
    assert.equal(committed.traceHistoryRecords?.length, 1);
    assert.deepEqual(writtenRecords, [committed.traceHistoryRecords?.[0]]);
    assert.equal(committed.traceHistoryRecords?.[0]?.sparc.traceStep?.productionRuleId, 'fractions.determine-lcd');
  });

  it('clears stale default feedback when a submitted answer is classified correct', function() {
    const classifiedCorrectDocument: SparcAuthoredDocument = {
      ...document,
      productionRules: [{
        ...document.productionRules![0]!,
        then: [{
          type: 'classify',
          outcome: 'correct',
        }],
      }],
    };

    const result = evaluateSparcAuthoredProductionRules({
      document: classifiedCorrectDocument,
      replayState: createSparcAuthoredInitialReplayState(classifiedCorrectDocument),
      event: {
        eventId: 'event-clear-feedback',
        type: 'response-submitted',
        source: sourceAddress,
        time: 3500,
        payload: {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: 12,
          sparcAnswerable: true,
          sparcDefaultIncorrectFeedbackNodeId: 'node-hint-message',
        },
      },
    });

    assert.deepEqual(result.transition?.writes, [{
      target: sourceAddress,
      key: 'correctness',
      value: 'correct',
    }, {
      target: {
        pageKey: 'fractions-doc',
        nodeId: 'node-hint-message',
      },
      key: 'message',
      value: '',
    }]);
  });

  it('resolves every model-practice target before applying any adaptive model update', async function() {
    const modelUpdateRequests: ModelPracticeUpdateRequest[] = [];
    const writtenRecords: unknown[] = [];
    const modelPracticeDocument: SparcAuthoredDocument = {
      id: 'fractions-doc',
      schemaVersion: 1,
      clusterTargets: [{
        clusterIndex: 0,
        stimuliSetId: 'stim-set-1',
        stimulusKC: 'denominator-kc',
        clusterKC: 'cluster-kc',
        KCId: 'denominator-kc',
        KCDefault: 'denominator-kc',
        KCCluster: 'cluster-kc',
      }],
      productionRules: [{
        id: 'model-practice.partial-write-guard',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'firstDenConv' },
            action: { type: 'literal', value: 'UpdateTextArea' },
          },
        }],
        then: [{
          type: 'model-practice',
          outcome: 'correct',
          clusterIndex: 0,
          responseValue: literal('12'),
        }, {
          type: 'model-practice',
          outcome: 'incorrect',
          nodeId: 'missing-node',
          responseValue: literal('24'),
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'firstDenConv',
          kind: 'input',
          clusterIndices: [0],
        }],
      },
    };

    await assert.rejects(
      async () => commitSparcAuthoredProductionRuleEvent({
        core,
        document: modelPracticeDocument,
        event: {
          eventId: 'event-model-practice',
          type: 'value-changed',
          source: sourceAddress,
          time: 4000,
          payload: {
            selection: 'firstDenConv',
            action: 'UpdateTextArea',
            input: 12,
          },
        },
        runtime: {
          adaptiveModel: {
            queryModelPracticeState() {
              return null;
            },
            applyModelPracticeUpdate(modelCore, request, extensionFields) {
              modelUpdateRequests.push(request);
              return {
                record: {
                  historySchemaVersion: 1,
                  TDFId: modelCore.TDFId,
                  sessionID: modelCore.sessionID,
                  userId: modelCore.userId,
                  levelUnit: modelCore.levelUnit,
                  levelUnitType: 'model',
                  time: request.time,
                  problemStartTime: request.problemStartTime,
                  selection: request.selection,
                  action: request.action,
                  outcome: request.outcome,
                  typeOfResponse: request.typeOfResponse,
                  responseValue: request.responseValue,
                  input: request.input ?? '',
                  displayedStimulus: request.displayedStimulus ?? null,
                  eventType: request.eventType,
                  stimuliSetId: request.target.stimuliSetId,
                  stimulusKC: request.target.stimulusKC,
                  clusterKC: request.target.clusterKC,
                  KCId: request.target.KCId,
                  KCDefault: request.target.KCDefault,
                  KCCluster: request.target.KCCluster,
                  ...(extensionFields ?? {}),
                },
              };
            },
          },
          history: {
            async writeCanonicalHistory(record) {
              writtenRecords.push(record);
            },
          },
        },
      }),
      /node "missing-node" not found/,
    );

    assert.deepEqual(modelUpdateRequests, []);
    assert.deepEqual(writtenRecords, []);
  });
});
