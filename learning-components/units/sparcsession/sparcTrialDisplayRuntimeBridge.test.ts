import assert from 'node:assert/strict';
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
    type: 'sparc',
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
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'literal', value: 'Numerator1Units' },
          action: { type: 'literal', value: 'UpdateComboBox' },
          input: { type: 'bound', variable: 'targetUnit' },
        },
      }],
      then: [{
        type: 'write-state',
        write: {
          target: {
            documentId: variable('documentId'),
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
    type: 'sparc',
    documentId: 'sparc-fractions-addition',
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
      documentId: 'doc-1',
      display: display(),
    });

    assert.equal(document.id, 'doc-1');
    assert.equal(document.root.children?.[0]?.id, 'node-term-1-num-units');
    assert.equal(document.root.children?.[0]?.kind, 'input');
    assert.equal(document.root.children?.[1]?.kind, 'input');
    assert.equal(document.root.children?.[2]?.kind, 'output');
    assert.equal(document.workingMemoryFacts?.[0]?.factType, 'problem');
    assert.equal(document.productionRules?.[0]?.id, 'stoich.set-result-unit');
  });

  it('preserves explicit fraction groups with addressable numerator and denominator children', function() {
    const document = createSparcAuthoredDocumentFromTrialDisplay({
      documentId: 'fraction-doc',
      display: {
        type: 'sparc',
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
      documentId: 'sparc-fractions-addition',
      display: unsupportedAuthoredRulesDisplay(),
    }), /behavior\.authoredProductionRules is not executable/);
  });

  it('turns submitted display nodes into mapped production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      documentId: 'doc-1',
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
    });
  });

  it('turns mapped SPARC button activations into production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      documentId: 'doc-1',
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
      documentId: 'doc-1',
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
    });
  });

  it('turns direct explicit fraction numerator input into a production-rule event', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      documentId: 'fraction-doc',
      display: {
        type: 'sparc',
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
    });
  });

  it('rejects malformed stimulus attachments instead of dropping them during document normalization', function() {
    assert.throws(
      () => createSparcAuthoredDocumentFromTrialDisplay({
        documentId: 'doc-1',
        display: {
          type: 'sparc',
          schema: 'tutorscript-sparc/1.0',
          nodes: [{
            id: 'node-with-bad-attachment',
            nodeType: 'atomic',
            atomType: 'text-input',
            stimulusIds: ['stimulus-1', null],
          }],
        } as unknown as SparcTrialDisplay,
      }),
      /stimulusIds\[1\] must be a non-empty string/,
    );
  });

  it('turns active-node focus changes into instantaneous production-rule events', function() {
    const [event] = createSparcProductionRuleEventsFromTrialResult({
      documentId: 'doc-1',
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
    });
  });

  it('commits display production-rule effects through canonical SPARC history', async function() {
    const writtenRecords: unknown[] = [];

    const result = await commitSparcTrialDisplayProductionRuleEvents({
      core,
      documentId: 'doc-1',
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
    assert.equal(writtenRecords.length, 1);
  });

  it('evaluates display production-rule classifications and messages without committing history', function() {
    const result = evaluateSparcTrialDisplayProductionRuleEvents({
      documentId: 'doc-1',
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
      documentId: 'sparc-fractions-addition',
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
