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
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';

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
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
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
    schemaVersion: 2,
    initialState: [{
      target: {
        pageKey: 'doc-1',
        nodeId: 'feedback',
      },
      key: 'visible',
      value: false,
    }],
    productionRules: [{
      id: 'show-feedback',
      when: [{
        factType: 'interface-state',
        slots: {
          pageKey: { type: 'literal', value: 'doc-1' },
          node: { type: 'literal', value: 'region-1' },
          key: { type: 'literal', value: 'lastOutcome' },
          value: { type: 'literal', value: 'correct' },
        },
      }],
      then: [{
        type: 'write-state',
        write: {
          target: {
            pageKey: 'doc-1',
            nodeId: 'feedback',
          },
          key: 'visible',
          value: { type: 'literal', value: true },
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
    schemaVersion: 2,
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
            pageKey: 'doc-1',
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

function sampleDialogueControllerDocument(): SparcAuthoredDocument {
  return {
    id: 'dialogue-doc',
    schemaVersion: 2,
    instructionalController: {
      adapterId: 'sparc-autotutor-v1',
      policyId: 'progressive-scaffolding-v1',
      policyVersion: 1,
    },
    autoTutorTargets: {
      expectations: [{
        clusterKC: 'kc-a',
        text: 'Use A.',
      }, {
        clusterKC: 'kc-b',
        text: 'Use B.',
      }],
      misconceptions: [],
    },
    workingMemoryFacts: [{
      factType: 'controller.targetSelectionPolicy',
      slots: {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
        frontierWeight: 0.5,
        coherenceWeight: 0.3,
        centralityWeight: 0.2,
      },
    }, {
      factType: 'learningTarget.score',
      slots: { clusterKC: 'kc-a', coverage: 0.2 },
    }, {
      factType: 'learningTarget.score',
      slots: { clusterKC: 'kc-b', coverage: 0.1 },
    }, {
      factType: 'kcGraph.node',
      slots: { clusterKC: 'kc-a', centrality: 0.1 },
    }, {
      factType: 'kcGraph.node',
      slots: { clusterKC: 'kc-b', centrality: 0.8 },
    }, {
      factType: 'kcGraph.relationship',
      slots: { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 },
    }, {
      factType: 'kcGraph.relationship',
      slots: { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 },
    }, {
      factType: 'dialogue.learnerWordCount',
      slots: { cumulative: 2 },
    }, {
      factType: 'session.turnState',
      slots: { turnCount: 1 },
    }],
    productionRules: createSparcProgressiveScaffoldingRules(),
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
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
      if (key === 'currentTdfFile') {
        return {
          isMultiTdf: false,
          tdfs: {
            tutor: {
              unit: [{ sparcsession: { pageId: 'page-1' } }],
            },
          },
        };
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
              clusterTargets: [
                { clusterIndex: 0 },
                { clusterIndex: 1 },
              ],
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
      fields.push(...String(source).split(/[,\s]+/).map((field) => field.trim()).filter(Boolean));
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
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (key === 'currentTdfUnit') {
          return { sparcsession: {} };
        }
        if (key === 'currentTdfId') {
          return 'tdf-1';
        }
        if (key === 'currentUnitNumber') {
          return 0;
        }
        if (key === 'currentStimuliSetId') {
          return 'stim-set-1';
        }
        if (key === 'currentTdfFile') {
          return {
            isMultiTdf: false,
            tdfs: {
              tutor: {
                unit: [{ sparcsession: { pageId: 'page-1' } }],
              },
            },
          };
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      getStimCount: () => 1,
      getStimCluster: () => cluster,
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                nodes: [{ id: 'answer', clusterIndex: 0 }],
              },
            }],
          },
        },
      }),
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

  it('hydrates SPARC local stimulus state from shared learning-session cluster history', async function() {
    const clusters = [{
      stims: [{
        stimuliSetId: 'sparc-stim-set',
        clusterKC: 'fractions.lcd',
        stimulusKC: 'sparc-local-item',
        responseKC: 'response-sparc',
        correctResponse: 'Determine LCD',
        params: '0,0.8',
        textStimulus: 'Determine a common denominator',
      }],
    }];
    const historyRows = [{
      eventType: '',
      levelUnitType: 'model',
      time: 1000,
      outcome: 'correct',
      stimuliSetId: 'kc-definitions-stim-set',
      stimulusKC: 'kc-definitions-local-item',
      clusterKC: 'fractions.lcd',
      KCId: 'kc-definitions-local-item',
      KCDefault: 'kc-definitions-local-item',
      KCCluster: 'fractions.lcd',
      responseKey: 'lcd',
      responseDuration: 250,
      responseValue: 'lcd',
    }];
    const sessionValues = new Map<string, unknown>();
    let requestedLearningHistoryOptions: any = null;
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (sessionValues.has(key)) {
          return sessionValues.get(key);
        }
        if (key === 'currentTdfUnit') {
          return {
            sparcsession: {
              pageId: 'page-1',
              calculateProbability: 'return p',
            },
          };
        }
        if (key === 'currentTdfId') {
          return 'sparc-fractions-addition-tdf';
        }
        if (key === 'currentUnitNumber') {
          return 1;
        }
        if (key === 'currentStimuliSetId') {
          return 'sparc-stim-set';
        }
        if (key === 'currentTdfFile') {
          return {
            tdfs: {
              tutor: {
                unit: [{}, { sparcsession: { pageId: 'page-1' } }],
              },
            },
          };
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      setSessionValue(key: string, value: unknown) {
        sessionValues.set(key, value);
      },
      getStimCount: () => clusters.length,
      getStimCluster: (clusterIndex: number) => clusters[clusterIndex],
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                nodes: [{ id: 'answer', clusterIndex: 0 }],
              },
            }],
          },
        },
      }),
      serverMethods: {
        getResponseKCMapForTdf: async () => ({ determinelcd: 'response-sparc' }),
        getStimulusCrowdStatsForDeck: async () => [],
        getLearningHistoryForUnit: async (
          _userId: string,
          _tdfId: string,
          _currentUnitNumber: number,
          _resetStudentPerformance: boolean,
          options?: unknown,
        ) => {
          requestedLearningHistoryOptions = options;
          return historyRows;
        },
      },
      reconstructLearningStateFromHistory(rows: unknown[]) {
        assert.deepEqual(rows, historyRows);
        return {
          clusterState: {
            'fractions.lcd': {
              firstSeen: 1000,
              lastSeen: 1000,
              priorCorrect: 1,
              priorIncorrect: 0,
              allTimeCorrect: 1,
              allTimeIncorrect: 0,
              priorStudy: 0,
              outcomeStack: [1],
              timeHistory: [1000],
              totalPracticeDuration: 250,
              allTimeTotalPracticeDuration: 250,
              trialsSinceLastSeen: 0,
              hasBeenIntroduced: true,
              otherPracticeTime: 0,
            },
          },
          stimulusState: {
            'kc-definitions-local-item': {
              firstSeen: 1000,
              lastSeen: 1000,
              priorCorrect: 1,
              priorIncorrect: 0,
              allTimeCorrect: 1,
              allTimeIncorrect: 0,
              priorStudy: 0,
              outcomeStack: [1],
              timeHistory: [1000],
              totalPracticeDuration: 250,
              allTimeTotalPracticeDuration: 250,
              curSessionPriorCorrect: 1,
              curSessionPriorIncorrect: 0,
              hasBeenIntroduced: true,
              timesSeen: 1,
              otherPracticeTime: 0,
            },
          },
          responseState: {},
          numQuestionsAnswered: 1,
          numQuestionsAnsweredCurrentSession: 1,
          numCorrectAnswers: 1,
          overallOutcomeHistory: [1],
          overallStudyHistory: [0],
        };
      },
    }));

    await engine.initializeLogisticModelState();
    await engine.loadResumeState();

    assert.equal(requestedLearningHistoryOptions, undefined);
    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].stimulusKC, 'sparc-local-item');
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].hasBeenIntroduced, true);
    assert.equal(cardProbabilities.cards[0].stims[0].timesSeen, 1);
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
      ['missing-document-layout', 'missing-panel-visual-preset', 'missing-panel-visual-preset'],
    );

    const authoredStartState = engine.replaySparcDocumentHistory(document, []);
    assert.equal(
      authoredStartState.cells[createSparcStateCellKey({
        pageKey: 'doc-1',
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
          pageKey: 'doc-1',
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
    assert.equal(writtenRecords.length, 3);
    assert.equal(result.responseCommit.historyRecord.eventType, 'sparc');
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'sparc');
    assert.deepEqual(
      result.productionCommit.execution.firings.map((firing: { ruleId: string }) => firing.ruleId),
      ['show-feedback'],
    );
    assert.equal(
      result.finalReplayState.cells[createSparcStateCellKey({
        pageKey: 'doc-1',
        nodeId: 'feedback',
      }, 'visible')]?.value,
      true,
    );
  });

  it('renders the sparcsession page while resolving model targets from ordinary clusters', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps());

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);

    assert.equal(preparedState.currentDisplay.pageId, 'page-1');
    assert.equal(preparedState.currentDisplay.pageKey, 'page-1');
    assert.equal(preparedState.currentDisplay.schema, 'tutorscript-sparc/2.0');
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

  it('rejects an explicitly incompatible authored SPARC display schema', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                schema: 'tutorscript-sparc/1.0',
                nodes: [{ id: 'first', clusterIndex: 0 }],
              },
            }],
          },
        },
      }),
    }));

    await assert.rejects(
      () => engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]),
      /display\.schema must be tutorscript-sparc\/2\.0/,
    );
  });

  it('rejects a redundant authored display pageKey', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                pageKey: 'other-key',
                nodes: [{ id: 'first', clusterIndex: 0 }],
              },
            }],
          },
        },
      }),
    }));

    await assert.rejects(
      () => engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]),
      /must not author display\.pageKey; runtime state identity is derived from pageId/,
    );
  });

  it('rejects duplicate authored pageId values before selecting a page', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'duplicate-page',
              display: { nodes: [{ id: 'first', clusterIndex: 0 }] },
            }, {
              pageId: 'duplicate-page',
              display: { nodes: [{ id: 'second', clusterIndex: 1 }] },
            }],
          },
        },
      }),
    }));

    await assert.rejects(
      () => engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]),
      /SPARC pageId "duplicate-page" is duplicated/,
    );
  });

  it('renders SPARC AutoTutor target rows flattened from package upload', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getStimCount: () => 1,
      getStimCluster: () => ({
        clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
        stims: [{
          stimuliSetId: 'stim-set-1',
          clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
          stimulusKC: 300000,
          responseKC: 1,
          correctResponse: '__SPARC_AUTOTUTOR_TARGET__',
          params: '0,.7',
          textStimulus: 'Flattened target text from uploaded package.',
        }],
      }),
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                unitType: 'sparc-autotutor-dialogue',
                clusterTargets: [
                  {
                    clusterIndex: 0,
                    clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
                  },
                ],
                autoTutorTargets: {
                  expectations: [{
                    clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
                    text: 'Clean authored expectation text.',
                  }],
                  misconceptions: [{
                    id: 'M1',
                    text: 'Clean authored misconception text.',
                  }],
                },
                workingMemoryFacts: [{
                  factType: 'controller.targetSelectionPolicy',
                  slots: {
                    policy: 'kc-graph-priority',
                  },
                }],
                nodes: [{
                  id: 'opening-tutor-message',
                  nodeType: 'atomic',
                  atomType: 'dialogue-utterance',
                  clusterIndex: 0,
                }],
              },
            }],
          },
        },
      }),
    }));

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);

    assert.deepEqual(preparedState.currentDisplay.clusterTargets, [{
      clusterIndex: 0,
      clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
    }]);
    assert.deepEqual(preparedState.currentDisplay.autoTutorTargets.expectations, [{
      clusterKC: 'autotutor.stats-confidence-interval-001.kc.e1',
      text: 'Clean authored expectation text.',
    }]);
    assert.deepEqual(preparedState.currentDisplay.autoTutorTargets.misconceptions, [{
      id: 'M1',
      text: 'Clean authored misconception text.',
    }]);
    assert.deepEqual(preparedState.currentDisplay.workingMemoryFacts, [{
      factType: 'controller.targetSelectionPolicy',
      slots: {
        policy: 'kc-graph-priority',
      },
    }]);
  });

  it('renders the only authored SPARC page when sparcsession.pageId is omitted', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (key === 'currentTdfUnit') {
          return {
            sparcsession: {},
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
    }));

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);

    assert.equal(preparedState.currentDisplay.pageId, 'page-1');
    assert.deepEqual(
      preparedState.currentDisplay.clusterTargets.map((target: { clusterIndex: number }) => target.clusterIndex),
      [0, 1],
    );
  });

  it('requires sparcsession.pageId only when the stimulus file has multiple SPARC pages', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (key === 'currentTdfUnit') {
          return {
            sparcsession: {
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
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
                nodes: [{ id: 'first', clusterIndex: 0 }],
              },
            }, {
              pageId: 'page-2',
              display: {
                nodes: [{ id: 'second', clusterIndex: 1 }],
              },
            }],
          },
        },
      }),
    }));

    await assert.rejects(
      () => engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]),
      /multiple rawStimuliFile\.setspec\.sparcPages entries requires sparcsession\.pageId/,
    );
  });

  it('uses normalized cluster-level KC for SPARC targets when first-stimulus KC is stale', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getStimCluster: (clusterIndex: number) => ({
        clusterKC: clusterIndex === 0 ? ' Fractions.LCD ' : 'cluster-1',
        stims: [{
          stimuliSetId: 'stim-set-1',
          clusterKC: 'legacy-stim-cluster',
          stimulusKC: `kc-${clusterIndex}`,
          responseKC: `response-${clusterIndex}`,
          correctResponse: `Cluster ${clusterIndex} answer`,
          params: '0,0.8',
          textStimulus: `Cluster ${clusterIndex}`,
        }],
      }),
    }));

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);
    const firstTarget = preparedState.currentDisplay.clusterTargets[0];

    assert.equal(firstTarget.clusterKC, 'fractions.lcd');
    assert.equal(firstTarget.KCCluster, 'fractions.lcd');
    assert.equal(firstTarget.stimulusKC, 'kc-0');
  });

  it('derives SPARC page model scope from authored page cluster references', async function() {
    const engine = await createSparcSessionUnitEngine(createPageRuntimeDeps({
      getStimCount: () => 3,
      getStimCluster: (clusterIndex: number) => ({
        stims: [{
          stimuliSetId: 'stim-set-1',
          clusterKC: `cluster-${clusterIndex}`,
          stimulusKC: `kc-${clusterIndex}`,
          responseKC: `response-${clusterIndex}`,
          correctResponse: `Cluster ${clusterIndex} answer`,
          params: '0,0.8',
          textStimulus: `Cluster ${clusterIndex}`,
        }],
      }),
      findTdfById: () => ({
        rawStimuliFile: {
          setspec: {
            sparcPages: [{
              pageId: 'page-1',
              display: {
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

    await engine.initializeLogisticModelState();
    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.cards[0].canUse, false);
    assert.equal(cardProbabilities.cards[1].canUse, false);
    assert.equal(cardProbabilities.cards[2].canUse, true);

    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(2, 0, [0, 0.8]);
    assert.deepEqual(
      preparedState.currentDisplay.clusterTargets.map((target: { clusterIndex: number }) => target.clusterIndex),
      [2],
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
          pageKey: 'doc-1',
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
    assert.equal(writtenRecords.length, 2);
  });

  it('exposes SPARC controller dialogue-turn commit at the unit-engine boundary', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const writtenRecords: CanonicalHistoryRecord[] = [];

    const result = await engine.commitSparcControllerDialogueTurn({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      document: sampleDialogueControllerDocument(),
      event: {
        eventId: 'event-dialogue',
        type: 'response-submitted',
        source: {
          pageKey: 'dialogue-doc',
          nodeId: 'learner-input',
        },
        time: 5000,
        payload: {
          input: 'three more words',
        },
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance(request: { action: string; targetId: string }) {
        assert.equal(request.action, 'pump');
        assert.equal(request.targetId, 'kc-b');
        return 'Think about B.';
      },
      history: {
        async writeCanonicalHistory(record: CanonicalHistoryRecord) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.historyRecord?.action, 'sparc-dialogue-turn');
    assert.equal(writtenRecords.length, 1);
    assert.equal(writtenRecords[0]?.action, 'sparc-dialogue-turn');
    assert.equal(result.utteranceRequest.action, 'pump');
    assert.equal(result.utteranceRequest.targetId, 'kc-b');
    assert.ok(result.transition.writes.some((write: { value?: unknown }) => (
      typeof write.value === 'object'
      && write.value !== null
      && (write.value as { factType?: string }).factType === 'controller.selectedAction'
    )));
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
      pageKey: 'doc-1',
      display: {
        schema: 'tutorscript-sparc/2.0',
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
              pageKey: { type: 'bind', variable: 'pageKey' },
              selection: { type: 'literal', value: 'answerSelection' },
              action: { type: 'literal', value: 'UpdateTextField' },
              input: { type: 'literal', value: '42' },
            },
          }],
          then: [{
            type: 'write-state',
            write: {
              target: {
                pageKey: variable('pageKey'),
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
    assert.equal(writtenRecords.length, 2);
  });

  it('exposes trial-display production-rule evaluation at the unit-engine boundary', async function() {
    const engine = await createSparcSessionUnitEngine(createMinimalDeps());
    const result = engine.evaluateSparcTrialDisplayProductionRuleEvents({
      pageKey: 'doc-1',
      display: {
        schema: 'tutorscript-sparc/2.0',
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
              pageKey: { type: 'bind', variable: 'pageKey' },
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
