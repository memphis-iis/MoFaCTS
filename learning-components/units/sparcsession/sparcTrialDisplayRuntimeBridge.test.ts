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
    assert.equal(document.root.children?.[1]?.kind, 'output');
    assert.equal(document.workingMemoryFacts?.[0]?.factType, 'problem');
    assert.equal(document.productionRules?.[0]?.id, 'stoich.set-result-unit');
  });

  it('turns submitted display nodes into SAI production-rule events', function() {
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
});
