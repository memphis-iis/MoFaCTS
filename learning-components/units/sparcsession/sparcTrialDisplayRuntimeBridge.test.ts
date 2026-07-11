import assert from 'node:assert/strict';
import { createCanonicalModelPracticeHistoryRecord } from '../../runtime/modelPracticeUpdates';
import type { SparcTrialDisplay } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import {
  commitSparcTrialDisplayProductionRuleEvents,
  createSparcAuthoredDocumentFromTrialDisplay,
  createSparcProductionRuleEventsFromTrialResult,
  evaluateSparcTrialDisplayProductionRuleEvents,
} from './sparcTrialDisplayRuntimeBridge';
import type { SparcRuleExpression } from './sparcSessionContracts';

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });

function display(): SparcTrialDisplay {
  return {
    schema: 'tutorscript-sparc/1.0',
    nodes: [{
      id: 'node-term-1-num-units',
      nodeType: 'atomic',
      atomType: 'select',
    }, {
      id: 'node-hint-button',
      nodeType: 'atomic',
      atomType: 'button',
    }, {
      id: 'node-feedback',
      nodeType: 'atomic',
      atomType: 'text-block',
    }],
    behavior: {
      steps: [{
        id: 'build-unit-conversion-ratio',
        responses: [{
          selection: 'Numerator1Units',
          action: 'UpdateComboBox',
          input: 'g',
          nodeRef: 'node-term-1-num-units',
          modelTarget: 'Set-Numerator-Unit-of-Unit-Conversion',
        }],
      }, {
        id: 'request-hint',
        responses: [{
          selection: 'hint',
          action: 'ButtonPressed',
          input: 'Hint',
          nodeRef: 'node-hint-button',
        }],
      }],
    },
    workingMemoryFacts: [{
      factType: 'problem',
      slots: {
        type: 'stoichiometry-dimensional-analysis',
        targetUnit: 'g',
      },
    }],
    derivedFacts: [{
      id: 'target-unit-label',
      when: [{
        factType: 'problem',
        slots: {
          targetUnit: { type: 'bind', variable: 'targetUnit' },
        },
      }],
      fact: {
        factType: 'problem.targetUnitLabel',
        slots: {
          value: variable('targetUnit'),
        },
      },
    }],
    productionRules: [{
      id: 'stoich.set-result-unit',
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'stoichiometry-dimensional-analysis' },
          targetUnit: { type: 'bind', variable: 'targetUnit' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          pageKey: { type: 'bind', variable: 'pageKey' },
          selection: { type: 'literal', value: 'Numerator1Units' },
          action: { type: 'literal', value: 'UpdateComboBox' },
          input: { type: 'bound', variable: 'targetUnit' },
        },
      }],
      then: [{
        type: 'write-state',
        write: {
          target: {
            pageKey: variable('pageKey'),
            nodeId: literal('node-feedback'),
          },
          key: 'message',
          value: literal('Unit accepted.'),
        },
      }, {
        type: 'message',
        messageType: 'feedback',
        template: 'Unit accepted.',
      }, {
        type: 'credit',
        kc: 'Set-Numerator-Unit-of-Unit-Conversion',
      }, {
        type: 'classify',
        outcome: 'correct',
      }],
    }],
  };
}

function unsupportedAuthoredRulesDisplay(): SparcTrialDisplay {
  return {
    pageKey: 'sparc-fractions-addition',
    schema: 'tutorscript-sparc/1.0',
    nodes: [{
      id: 'node-known-1-equivalent-bottom',
      nodeType: 'atomic',
      atomType: 'text-input',
    }, {
      id: 'node-converted-bottom',
      nodeType: 'atomic',
      atomType: 'text-input',
    }, {
      id: 'node-hint-message',
      nodeType: 'atomic',
      atomType: 'message-box',
    }],
    behavior: {
      source: {
        file: 'C:\\dev\\mofacts_config\\1416.brd',
      },
      steps: [{
        id: 'choose-common-denominator',
        responses: [{
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: '12',
          nodeRef: 'node-known-1-equivalent-bottom',
        }, {
          selection: 'firstDenConv',
          action: 'UpdateTextArea',
          input: '24',
          nodeRef: 'node-known-1-equivalent-bottom',
        }],
      }],
      authoredProductionRules: [
        { id: 'choose-first-common-denominator', hintBehavior: { messages: ['Hint 1', 'Hint 2', 'Hint 3'] } },
      ],
    },
  };
}

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 1,
  userId: 'user-1',
};

describe('sparcTrialDisplayRuntimeBridge', function() {
  it('creates an authored document carrying display production rules and facts', function() {
    const document = createSparcAuthoredDocumentFromTrialDisplay({
      pageKey: 'doc-1',
      display: display(),
    });

    assert.equal(document.id, 'doc-1');
    assert.equal(document.root.children?.[0]?.id, 'node-term-1-num-units');
    assert.equal(document.root.children?.[0]?.kind, 'input');
    assert.equal(document.root.children?.[1]?.kind, 'input');
    assert.equal(document.root.children?.[2]?.kind, 'output');
    assert.equal(document.workingMemoryFacts?.[0]?.factType, 'problem');
    assert.equal(document.derivedFacts?.[0]?.id, 'target-unit-label');
    assert.equal(document.productionRules?.[0]?.id, 'stoich.set-result-unit');
  });

  it('preserves explicit fraction groups with addressable numerator and denominator children', function() {
    const document = createSparcAuthoredDocumentFromTrialDisplay({
      pageKey: 'fraction-doc',
      display: {
        schema: 'tutorscript-sparc/1.0',
        nodes: [{
          id: 'fraction-one',
          nodeType: 'group',
          groupType: 'fraction',
          children: [{
            id: 'fraction-one-numerator',
            nodeType: 'atomic',
            atomType: 'fraction-input',
            fractionRole: 'numerator',
          }, {
            id: 'fraction-one-denominator',
            nodeType: 'atomic',
            atomType: 'fraction-box',
            fractionRole: 'denominator',
          }],
        }],
      } as SparcTrialDisplay,
    });

    const fraction = document.root.children?.[0];
    assert.equal(fraction?.id, 'fraction-one');
    assert.equal(fraction?.kind, 'panel');
    assert.equal(fraction?.children?.[0]?.id, 'fraction-one-numerator');
    assert.equal(fraction?.children?.[0]?.kind, 'input');
    assert.equal(fraction?.children?.[1]?.id, 'fraction-one-denominator');
    assert.equal(fraction?.children?.[1]?.kind, 'widget');
  });

  it('rejects non-executable authored production rules', function() {
    assert.throws(() => createSparcAuthoredDocumentFromTrialDisplay({
      pageKey: 'sparc-fractions-addition',
      display: unsupportedAuthoredRulesDisplay(),
    }), /behavior\.authoredProductionRules is not executable/);
  });

  it('turns submitted display nodes into mapped production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-term-1-num-units': 'g',
        },
        timestamp: 2000,
      },
    });

    assert.equal(event?.source.nodeId, 'node-term-1-num-units');
    assert.deepEqual(event?.payload, {
      selection: 'Numerator1Units',
      action: 'UpdateComboBox',
      input: 'g',
      triggeredBy: null,
      sparcAnswerable: true,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('turns mapped SPARC button activations into production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-hint-button': 'Hint',
        },
        triggeredBy: 'node-hint-button',
        timestamp: 2100,
      },
    });

    assert.equal(event?.source.nodeId, 'node-hint-button');
    assert.deepEqual(event?.payload, {
      selection: 'hint',
      action: 'ButtonPressed',
      input: 'Hint',
      triggeredBy: 'node-hint-button',
      sparcAnswerable: false,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('uses mapped SAI input and answerable handling for completion button activations', function() {
    const completionDisplay: SparcTrialDisplay = {
      ...display(),
      response: {
        completion: {
          type: 'path-complete',
          doneSelection: 'done',
          doneAction: 'ButtonPressed',
        },
      },
      behavior: {
        steps: [{
          id: 'complete',
          responses: [{
            selection: 'done',
            action: 'ButtonPressed',
            input: -1,
            nodeRef: 'node-hint-button',
          }],
        }],
      },
    };
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: completionDisplay,
      result: {
        submittedNodes: {
          'node-hint-button': 'Done',
        },
        triggeredBy: 'node-hint-button',
        timestamp: 2110,
      },
    });

    assert.deepEqual(event?.payload, {
      selection: 'done',
      action: 'ButtonPressed',
      input: -1,
      triggeredBy: 'node-hint-button',
      sparcAnswerable: true,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('adds focused node and SAI selection context to mapped button activations', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-hint-button': 'Hint',
        },
        triggeredBy: 'node-hint-button',
        focusedNodeId: 'node-term-1-num-units',
        timestamp: 2125,
      },
    });

    assert.equal(event?.source.nodeId, 'node-hint-button');
    assert.deepEqual(event?.payload, {
      selection: 'hint',
      action: 'ButtonPressed',
      input: 'Hint',
      triggeredBy: 'node-hint-button',
      focusedNodeId: 'node-term-1-num-units',
      focusedSelection: 'Numerator1Units',
      sparcAnswerable: false,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('turns direct SPARC button activations into production-rule events without response mappings', function() {
    const { behavior: _behavior, ...baseDisplay } = display();
    const directDisplay: SparcTrialDisplay = {
      ...baseDisplay,
      productionRules: [{
        id: 'direct.button',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: { type: 'literal', value: 'node-hint-button' },
            action: { type: 'literal', value: 'ButtonPressed' },
          },
        }],
        then: [{
          type: 'message',
          messageType: 'feedback',
          template: 'Direct button fired.',
        }],
      }],
    };
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: directDisplay,
      result: {
        submittedNodes: {
          'node-hint-button': 'Hint',
        },
        triggeredBy: 'node-hint-button',
        timestamp: 2150,
      },
    });

    assert.equal(event?.source.nodeId, 'node-hint-button');
    assert.deepEqual(event?.payload, {
      selection: 'node-hint-button',
      action: 'ButtonPressed',
      input: 'Hint',
      triggeredBy: 'node-hint-button',
      sparcAnswerable: false,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('turns direct explicit fraction numerator input into a production-rule event', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'fraction-doc',
      display: {
        schema: 'tutorscript-sparc/1.0',
        nodes: [{
          id: 'fraction-one',
          nodeType: 'group',
          groupType: 'fraction',
          children: [{
            id: 'fraction-one-numerator',
            nodeType: 'atomic',
            atomType: 'fraction-input',
            fractionRole: 'numerator',
          }, {
            id: 'fraction-one-denominator',
            nodeType: 'atomic',
            atomType: 'fraction-box',
            fractionRole: 'denominator',
          }],
        }],
      } as SparcTrialDisplay,
      result: {
        submittedNodes: {
          'fraction-one-numerator': '3',
        },
        triggeredBy: 'fraction-one-numerator',
        timestamp: 2160,
      },
    });

    assert.equal(event?.source.nodeId, 'fraction-one-numerator');
    assert.deepEqual(event?.payload, {
      selection: 'fraction-one-numerator',
      action: 'UpdateTextField',
      input: '3',
      triggeredBy: 'fraction-one-numerator',
      sparcAnswerable: true,
      sparcDefaultIncorrectMessage: 'No, this is not correct.',
    });
  });

  it('rejects malformed cluster attachments instead of dropping them during document normalization', function() {
    assert.throws(
      () => createSparcAuthoredDocumentFromTrialDisplay({
        pageKey: 'doc-1',
        display: {
          schema: 'tutorscript-sparc/1.0',
          nodes: [{
            id: 'node-with-bad-attachment',
            nodeType: 'atomic',
            atomType: 'text-input',
            clusterIndices: [0, null],
          }],
        } as unknown as SparcTrialDisplay,
      }),
      /clusterIndices\[1\] must be a non-negative integer/,
    );
  });

  it('turns active-node focus changes into instantaneous production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {},
        triggeredBy: 'node-term-1-num-units',
        eventType: 'focus-changed',
        timestamp: 2200,
      },
    });

    assert.equal(event?.type, 'focus-changed');
    assert.equal(event?.source.nodeId, 'node-term-1-num-units');
    assert.deepEqual(event?.payload, {
      selection: 'node-term-1-num-units',
      action: 'Focus',
      input: '',
      triggeredBy: 'node-term-1-num-units',
      focusedNodeId: 'node-term-1-num-units',
      focusedSelection: 'Numerator1Units',
    });
  });

  it('commits display production-rule effects through canonical SPARC history', async function() {
    const writtenRecords: unknown[] = [];

    const result = await commitSparcTrialDisplayProductionRuleEvents({
      core,
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-term-1-num-units': 'g',
        },
        timestamp: 3000,
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.commits.length, 1);
    assert.equal(result.commits[0]?.historyRecord?.action, 'sparc-production-rule');
    assert.deepEqual(
      result.evaluations[0]?.transition?.writes.map((write) => ({
        nodeId: write.target.nodeId,
        key: write.key,
        value: write.value,
      })),
      [{
        nodeId: 'node-feedback',
        key: 'message',
        value: 'Unit accepted.',
      }, {
        nodeId: 'node-term-1-num-units',
        key: 'correctness',
        value: 'correct',
      }],
    );
    assert.equal(writtenRecords.length, 2);
  });

  it('commits unhandled answerable submissions as CTAT-style incorrect feedback', async function() {
    const writtenRecords: unknown[] = [];

    const result = await commitSparcTrialDisplayProductionRuleEvents({
      core,
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-term-1-num-units': 'kg',
        },
        timestamp: 3100,
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.commits.length, 1);
    assert.equal(result.evaluations[0]?.execution.firings.length, 0);
    assert.deepEqual(
      result.evaluations[0]?.transition?.writes.map((write) => ({
        nodeId: write.target.nodeId,
        key: write.key,
        value: write.value,
      })),
      [{
        nodeId: 'node-term-1-num-units',
        key: 'correctness',
        value: 'incorrect',
      }],
    );
    assert.equal(result.commits[0]?.historyRecord?.action, 'sparc-production-rule');
    assert.equal(writtenRecords.length, 2);
  });

  it('does not mark unclassified control button actions incorrect', async function() {
    const writtenRecords: unknown[] = [];
    const controlDisplay: SparcTrialDisplay = {
      ...display(),
      productionRules: [],
    };

    const result = await commitSparcTrialDisplayProductionRuleEvents({
      core,
      pageKey: 'doc-1',
      display: controlDisplay,
      result: {
        submittedNodes: {
          'node-hint-button': 'Hint',
        },
        triggeredBy: 'node-hint-button',
        timestamp: 3200,
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(result.commits.length, 1);
    assert.equal(result.evaluations[0]?.transition, undefined);
    assert.equal(writtenRecords.length, 0);
  });

  it('loads clean SPARC AutoTutor targets with clusterKC-only authored clusterTargets', function() {
    const document = createSparcAuthoredDocumentFromTrialDisplay({
      pageKey: 'sparc-autotutor-clean',
      display: {
        pageKey: 'sparc-autotutor-clean',
        unitType: 'sparc-autotutor-dialogue',
        nodes: [{
          id: 'learner-response-input',
          nodeType: 'atomic',
          atomType: 'text-input',
        }],
        clusterTargets: [{
          clusterIndex: 0,
          clusterKC: 'kc-a',
        }],
        autoTutorTargets: {
          expectations: [{
            clusterKC: 'kc-a',
            text: 'Expectation A clean text.',
          }],
          misconceptions: [{
            id: 'm-a',
            text: 'Misconception A clean text.',
          }],
        },
        workingMemoryFacts: [{
          factType: 'kcGraph.node',
          slots: {
            clusterKC: 'kc-a',
            description: 'Expectation A clean text.',
            centrality: 0,
          },
        }],
      },
    });

    assert.deepEqual(document.autoTutorTargets, {
      expectations: [{
        clusterKC: 'kc-a',
        text: 'Expectation A clean text.',
      }],
      misconceptions: [{
        id: 'm-a',
        text: 'Misconception A clean text.',
      }],
    });
    assert.deepEqual(document.clusterTargets?.[0], {
      clusterIndex: 0,
      stimuliSetId: 'sparc:kc-a',
      stimulusKC: 'kc-a',
      clusterKC: 'kc-a',
      KCId: 'kc-a',
      KCDefault: 'kc-a',
      KCCluster: 'kc-a',
    });
  });

  it('rejects deleted SPARC AutoTutor target-source facts', function() {
    assert.throws(
      () => createSparcAuthoredDocumentFromTrialDisplay({
        pageKey: 'sparc-autotutor-legacy',
        display: {
          pageKey: 'sparc-autotutor-legacy',
          unitType: 'sparc-autotutor-dialogue',
          nodes: [{
            id: 'learner-response-input',
            nodeType: 'atomic',
            atomType: 'text-input',
          }],
          clusterTargets: [{
            clusterIndex: 0,
            clusterKC: 'kc-a',
          }],
          autoTutorTargets: {
            expectations: [{
              clusterKC: 'kc-a',
              text: 'Expectation A clean text.',
            }],
            misconceptions: [],
          },
          workingMemoryFacts: [{
            factType: 'learningTarget.source',
            slots: {
              clusterKC: 'kc-a',
            },
          }],
        },
      }),
      /forbidden target-schema fact type learningTarget\.source/,
    );
  });

  it('commits a correct LCD action as model practice for the fractions LCD stimulus', async function() {
    const modelPracticeRequests: unknown[] = [];
    const writtenRecords: unknown[] = [];
    const lcdDisplay: SparcTrialDisplay = {
      pageKey: 'sparc-fractions-addition',
      schema: 'tutorscript-sparc/1.0',
      nodes: [{
        id: 'node-known-1-equivalent-bottom',
        nodeType: 'atomic',
        atomType: 'fraction-input',
      }],
      clusterTargets: [{
        clusterIndex: 0,
        stimuliSetId: 'sparc-fractions-addition',
        stimulusKC: 'fractions.lcd',
        clusterKC: 'fractions.addition',
        KCId: 'fractions.lcd',
        KCDefault: 'fractions.lcd',
        KCCluster: 'fractions.addition',
      }],
      behavior: {
        steps: [{
          id: 'choose-common-denominator',
          responses: [{
            selection: 'firstDenConv',
            action: 'UpdateTextArea',
            input: '12',
            nodeRef: 'node-known-1-equivalent-bottom',
          }],
        }],
      },
      productionRules: [{
        id: 'fractions.choose-first-common-denominator',
        when: [{
          factType: 'interface-event',
          slots: {
            selection: literal('firstDenConv'),
            action: literal('UpdateTextArea'),
            input: literal('12'),
          },
        }],
        then: [{
          type: 'classify',
          outcome: 'correct',
        }, {
          type: 'model-practice',
          outcome: 'correct',
          clusterIndex: 0,
          nodeId: 'node-known-1-equivalent-bottom',
          responseValue: literal('12'),
          input: literal('12'),
        }],
      }],
    };

    const result = await commitSparcTrialDisplayProductionRuleEvents({
      core,
      pageKey: 'sparc-fractions-addition',
      display: lcdDisplay,
      result: {
        submittedNodes: {
          'node-known-1-equivalent-bottom': '12',
        },
        triggeredBy: 'node-known-1-equivalent-bottom',
        timestamp: 5000,
      },
      priorHistoryRecords: [],
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
      adaptiveModel: {
        queryModelPracticeState() {
          return 0.5;
        },
        async applyModelPracticeUpdate(currentCore, request, extensionFields) {
          modelPracticeRequests.push(request);
          return {
            record: createCanonicalModelPracticeHistoryRecord(
              currentCore,
              request,
              extensionFields,
            ),
          };
        },
      },
    });

    assert.deepEqual(result.evaluations.flatMap((evaluation) => (
      evaluation.execution.firings.map((firing) => firing.ruleId)
    )), ['fractions.choose-first-common-denominator']);
    assert.equal(modelPracticeRequests.length, 1);
    assert.deepEqual(modelPracticeRequests[0], {
      observationId: 'sparc-fractions-addition:node-known-1-equivalent-bottom:0:trial-display:model-practice:0',
      target: {
        stimuliSetId: 'sparc-fractions-addition',
        stimulusKC: 'fractions.lcd',
        clusterKC: 'fractions.addition',
        KCId: 'fractions.lcd',
        KCDefault: 'fractions.lcd',
        KCCluster: 'fractions.addition',
        sparcPageKey: 'sparc-fractions-addition',
        sparcNodeId: 'node-known-1-equivalent-bottom',
      },
      outcome: 'correct',
      responseValue: '12',
      input: '12',
      displayedStimulus: {
        pageKey: 'sparc-fractions-addition',
        nodeId: 'node-known-1-equivalent-bottom',
        clusterIndex: 0,
      },
      time: 5000,
      problemStartTime: 5000,
      selection: 'node-known-1-equivalent-bottom',
      action: 'sparc-response',
      typeOfResponse: 'sparc',
      eventType: 'sparc',
      sourceAddress: {
        pageKey: 'sparc-fractions-addition',
        nodeId: 'node-known-1-equivalent-bottom',
      },
    });
    assert.equal(writtenRecords.length, 1);
    assert.equal((writtenRecords[0] as { stimulusKC?: unknown }).stimulusKC, 'fractions.lcd');
  });

  it('evaluates display production-rule classifications and messages without committing history', function() {
    const result = evaluateSparcTrialDisplayProductionRuleEvents({
      pageKey: 'doc-1',
      display: display(),
      result: {
        submittedNodes: {
          'node-term-1-num-units': 'g',
        },
        timestamp: 3000,
      },
      priorHistoryRecords: [],
    });

    assert.equal(result.events.length, 1);
    assert.deepEqual(result.classifications, ['correct']);
    assert.deepEqual(result.messages, [{
      messageType: 'feedback',
      text: 'Unit accepted.',
    }]);
    assert.deepEqual(result.credits, ['Set-Numerator-Unit-of-Unit-Conversion']);
  });

  it('rejects non-executable authored rules during production-rule evaluation', function() {
    assert.throws(() => evaluateSparcTrialDisplayProductionRuleEvents({
      pageKey: 'sparc-fractions-addition',
      display: unsupportedAuthoredRulesDisplay(),
      result: {
        submittedNodes: {
          'node-known-1-equivalent-bottom': '12',
        },
        timestamp: 4000,
      },
      priorHistoryRecords: [],
    }), /behavior\.authoredProductionRules is not executable/);
  });
});
