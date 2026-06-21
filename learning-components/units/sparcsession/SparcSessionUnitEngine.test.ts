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

function createPageRuntimeDeps(overrides: Record<string, unknown> = {}): any {
  const clusters = [{
    stims: [{
      stimuliSetId: 'stim-set-1',
      clusterKC: 'cluster-0',
      stimulusKC: 'kc-0',
      responseKC: 'response-0',
      correctResponse: 'Cluster zero answer',
      params: '0,0.8',
      textStimulus: 'Cluster zero',
    }],
  }, {
    stims: [{
      stimuliSetId: 'stim-set-1',
      clusterKC: 'cluster-1',
      stimulusKC: 'kc-1',
      responseKC: 'response-1',
      correctResponse: 'Cluster one answer',
      params: '0,0.8',
      textStimulus: 'Cluster one',
    }],
  }];
  return createMinimalDeps({
    getSessionValue(key: UnitEngineSessionReadKey) {
      if (key === 'currentTdfUnit') {
        return {
          sparcsession: {
            pageId: 'page-1',
            clusterlist: '0-1',
            calculateProbability: 'return p',
          },
        };
      }
      if (key === 'currentTdfId') {
        return 'tdf-1';
      }
      if (key === 'currentStimuliSetId') {
        return 'stim-set-1';
      }
      if (key === 'curStudentPerformance') {
        return { totalTime: 0 };
      }
      return undefined;
    },
    getStimCount: () => clusters.length,
    getStimCluster: (clusterIndex: number) => clusters[clusterIndex],
    findTdfById: () => ({
      rawStimuliFile: {
        setspec: {
          sparcPages: [{
            pageId: 'page-1',
            display: {
              type: 'sparc',
              documentId: 'doc-1',
              nodes: [{
                id: 'answer-node',
                nodeType: 'atomic',
                atomType: 'text-input',
                clusterIndex: 1,
              }],
            },
          }],
        },
      },
    }),
    extractDelimFields(source: string, fields: unknown[]) {
      fields.push(...String(source).split(',').map((field) => field.trim()).filter(Boolean));
    },
    rangeVal(source: unknown) {
      const match = String(source).match(/^(\d+)-(\d+)$/);
      if (!match) {
        return [];
      }
      const start = Number(match[1]);
      const end = Number(match[2]);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    },
    legacyInt: (source: unknown) => Number.parseInt(String(source), 10),
    legacyFloat: (source: unknown) => Number(source),
    ...overrides,
  });
}

describe('SparcSessionUnitEngine document runtime boundary', function() {
  it('inherits model-progress provider capability from the adaptive logistic engine', async function() {
    const cluster = {
      stims: [{
        clusterKC: 'cluster-1',
        stimulusKC: 'kc-1',
        correctResponse: 'Answer',
        params: '0,0',
      }],
    };
    const engine = await createSparcSessionUnitEngine(createMinimalDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (key === 'currentTdfUnit') {
          return { sparcsession: {} };
        }
        if (key === 'currentTdfId') {
          return 'tdf-1';
        }
        if (key === 'currentUnitNumber') {
          return 2;
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      getStimCount: () => 1,
      getStimCluster: () => cluster,
    }));

    await engine.initializeLogisticModelState();
    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    cardProbabilities.cards[0].stims[0].probabilityEstimate = 0.74;

    assert.deepEqual(engine.getModelProgressItems(), [
      {
        id: '0:0:kc-1',
        stimulusKC: 'kc-1',
        clusterKC: 'cluster-1',
        probability: 0.74,
        introduced: false,
        current: false,
        canUse: true,
      },
    ]);
  });

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

  it('renders the sparcsession page while resolving model targets from ordinary clusters', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps());

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);

    assert.equal(preparedState.currentDisplay.pageId, 'page-1');
    assert.equal(preparedState.currentDisplay.documentId, 'doc-1');
    assert.equal(preparedState.currentAnswer, '__SPARC_COMPLETED__');
    assert.deepEqual(
      preparedState.currentDisplay.clusterTargets.map((target: { clusterIndex: number; stimulusKC: string; clusterKC: string }) => ({
        clusterIndex: target.clusterIndex,
        stimulusKC: target.stimulusKC,
        clusterKC: target.clusterKC,
      })),
      [{
        clusterIndex: 0,
        stimulusKC: 'kc-0',
        clusterKC: 'cluster-0',
      }, {
        clusterIndex: 1,
        stimulusKC: 'kc-1',
        clusterKC: 'cluster-1',
      }],
    );
  });

  it('rejects SPARC pages that reference clusters outside sparcsession.clusterlist', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                type: 'sparc',
                documentId: 'doc-1',
                nodes: [{
                  id: 'bad-node',
                  nodeType: 'atomic',
                  atomType: 'text-input',
                  clusterIndex: 2,
                }],
              },
            }],
          },
        },
      }),
    }));

    await assert.rejects(
      () => engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]),
      /references cluster 2, which is outside sparcsession\.clusterlist/,
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
