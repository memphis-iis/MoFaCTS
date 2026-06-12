import assert from 'node:assert/strict';
import {
  createSparcSessionUnitEngine,
} from './SparcSessionUnitEngine';
import {
  createSparcStateCellKey,
} from './sparcStateReplay';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { UnitEngineSessionReadKey } from '../UnitEngineSessionKeys';
import type {
  SparcAuthoredDocument,
  SparcRuleExpression,
} from './sparcSessionContracts';

function createMinimalDeps(overrides: Record<string, unknown> = {}): any {
  const deps = {
    getSessionValue(key: UnitEngineSessionReadKey) {
      if (key === 'currentTdfUnit') {
        return { sparcsession: {} };
      }
      if (key === 'curStudentPerformance') {
        return { totalTime: 0 };
      }
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => 0,
    getStimCluster: () => ({ stims: [] }),
    getStimKCBaseForCurrentStimuliSet: () => [],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => 'user-1',
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields() {},
    rangeVal: (source: unknown) => [source],
    legacyFloat: (source: unknown) => Number(source),
    legacyInt: (source: unknown) => Number(source),
    currentUserHasRole: () => false,
    displayify: (value: unknown) => value,
    unitIsFinished() {},
    alertUser() {},
    log() {},
    findTdfById: () => ({
      content: {
        tdfs: {
          tutor: {
            unit: [{ sparcsession: { clusterlist: '' } }],
          },
        },
      },
    }),
    ...overrides,
  };
  return deps;
}

function sampleDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    initialState: [{
      target: {
        documentId: 'doc-1',
        nodeId: 'feedback',
      },
      key: 'visible',
      value: false,
    }],
    reactiveRules: [{
      id: 'show-feedback',
      when: {
        type: 'state',
        query: {
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          key: 'lastOutcome',
        },
        compare: 'eq',
        value: 'correct',
      },
      writes: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'feedback',
        },
        key: 'visible',
        value: true,
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
      }, {
        id: 'region-7',
        kind: 'panel',
        children: [{
          id: 'feedback',
          kind: 'feedback',
        }],
      }],
    },
  };
}

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });

function sampleProductionRuleDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    workingMemoryFacts: [{
      factType: 'problem',
      slots: {
        type: 'fraction-addition',
      },
    }],
    productionRules: [{
      id: 'production.correct-answer',
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'fraction-addition' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'literal', value: 'region-1' },
          responseValue: { type: 'bind', variable: 'responseValue' },
        },
      }],
      tests: [{
        op: 'eq',
        left: variable('responseValue'),
        right: literal('Answer'),
      }],
      then: [{
        type: 'write-state',
        write: {
          target: {
            documentId: 'doc-1',
            nodeId: 'feedback',
          },
          key: 'message',
          value: literal('Good job!'),
        },
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
      }, {
        id: 'feedback',
        kind: 'feedback',
      }],
    },
  };
}

describe('SparcSessionUnitEngine document runtime boundary', function() {
  it('exposes SPARC document validation, replay, and authored response commit methods', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const document = sampleDocument();
    const writtenRecords: unknown[] = [];

    assert.deepEqual(engine.validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
    assert.equal(engine.validateSparcAuthoredDocument(document).valid, false);
    assert.deepEqual(
      engine.validateSparcAuthoredDocument(document).layoutIssues.map((issue: { kind: string }) => issue.kind),
      ['missing-document-layout'],
    );

    const authoredStartState = engine.replaySparcDocumentHistory(document, []);
    assert.equal(
      authoredStartState.cells[createSparcStateCellKey({
        documentId: 'doc-1',
        nodeId: 'feedback',
      }, 'visible')]?.value,
      false,
    );

    const result = await engine.processAndCommitSparcAuthoredResponseOutcome({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      document,
      input: {
        observationId: 'obs-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
        problemStartTime: 1500,
        outcome: 'correct',
        responseValue: 'Answer',
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record: CanonicalHistoryRecord) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, false);
    assert.equal(writtenRecords.length, 2);
    assert.equal(result.responseCommit.historyRecord.eventType, 'sparc');
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'sparc');
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(
      result.finalReplayState.cells[createSparcStateCellKey({
        documentId: 'doc-1',
        nodeId: 'feedback',
      }, 'visible')]?.value,
      true,
    );
  });

  it('exposes authored production-rule commit at the unit-engine boundary', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const writtenRecords: unknown[] = [];
    const document = sampleProductionRuleDocument();

    const result = await engine.commitSparcAuthoredProductionRuleEvent({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      document,
      event: {
        eventId: 'event-production',
        type: 'response-submitted',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 3000,
        payload: {
          selection: 'region-1',
          responseValue: 'Answer',
        },
      },
      history: {
        async writeCanonicalHistory(record: CanonicalHistoryRecord) {
          writtenRecords.push(record);
        },
      },
    });

    assert.deepEqual(result.execution.firings.map((firing: { ruleId: string }) => firing.ruleId), [
      'production.correct-answer',
    ]);
    assert.equal(result.historyRecord?.action, 'sparc-production-rule');
    assert.equal(writtenRecords.length, 1);
  });

  it('exposes trial-display production-rule commit at the unit-engine boundary', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const writtenRecords: unknown[] = [];
    const result = await engine.commitSparcTrialDisplayProductionRuleEvents({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      documentId: 'doc-1',
      display: {
        type: 'sparc',
        nodes: [{
          id: 'answer-node',
          nodeType: 'atomic',
          atomType: 'text-input',
        }, {
          id: 'feedback-node',
          nodeType: 'atomic',
          atomType: 'text-block',
        }],
        behavior: {
          steps: [{
            id: 'answer',
            responses: [{
              selection: 'answerSelection',
              action: 'UpdateTextField',
              input: '42',
              nodeRef: 'answer-node',
            }],
          }],
        },
        workingMemoryFacts: [{
          factType: 'problem',
          slots: {
            type: 'answer-check',
          },
        }],
        productionRules: [{
          id: 'answer.correct',
          when: [{
            factType: 'problem',
            slots: {
              type: { type: 'literal', value: 'answer-check' },
            },
          }, {
            factType: 'interface-event',
            slots: {
              documentId: { type: 'bind', variable: 'documentId' },
              selection: { type: 'literal', value: 'answerSelection' },
              action: { type: 'literal', value: 'UpdateTextField' },
              input: { type: 'literal', value: '42' },
            },
          }],
          then: [{
            type: 'write-state',
            write: {
              target: {
                documentId: variable('documentId'),
                nodeId: literal('feedback-node'),
              },
              key: 'message',
              value: literal('Good.'),
            },
          }],
        }],
      },
      result: {
        submittedNodes: {
          'answer-node': '42',
        },
        timestamp: 4000,
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record: CanonicalHistoryRecord) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.document.id, 'doc-1');
    assert.equal(result.commits[0]?.historyRecord?.action, 'sparc-production-rule');
    assert.equal(writtenRecords.length, 1);
  });

  it('exposes trial-display production-rule evaluation at the unit-engine boundary', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const result = engine.evaluateSparcTrialDisplayProductionRuleEvents({
      documentId: 'doc-1',
      display: {
        type: 'sparc',
        nodes: [{
          id: 'answer-node',
          nodeType: 'atomic',
          atomType: 'text-input',
        }],
        behavior: {
          steps: [{
            id: 'answer',
            responses: [{
              selection: 'answerSelection',
              action: 'UpdateTextField',
              input: '42',
              nodeRef: 'answer-node',
            }],
          }],
        },
        workingMemoryFacts: [{
          factType: 'problem',
          slots: {
            type: 'answer-check',
          },
        }],
        productionRules: [{
          id: 'answer.correct',
          when: [{
            factType: 'problem',
            slots: {
              type: { type: 'literal', value: 'answer-check' },
            },
          }, {
            factType: 'interface-event',
            slots: {
              documentId: { type: 'bind', variable: 'documentId' },
              selection: { type: 'literal', value: 'answerSelection' },
              action: { type: 'literal', value: 'UpdateTextField' },
              input: { type: 'literal', value: '42' },
            },
          }],
          then: [{
            type: 'message',
            messageType: 'success',
            template: 'Good.',
          }, {
            type: 'classify',
            outcome: 'correct',
          }],
        }],
      },
      result: {
        submittedNodes: {
          'answer-node': '42',
        },
        timestamp: 4000,
      },
      priorHistoryRecords: [],
    });

    assert.deepEqual(result.classifications, ['correct']);
    assert.deepEqual(result.messages, [{
      messageType: 'success',
      text: 'Good.',
    }]);
  });
});
