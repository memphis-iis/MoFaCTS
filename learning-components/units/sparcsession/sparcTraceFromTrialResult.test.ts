import assert from 'node:assert/strict';
import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { sparcTrialDisplayAdapter } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { createSparcTraceFromTrialResult } from './sparcTraceFromTrialResult';

function display(): SparcTrialDisplay {
  return sparcTrialDisplayAdapter.normalizeDisplay({
    type: 'sparc',
    schema: 'tutorscript-sparc/1.0',
    nodes: [{
      id: 'node-1',
      nodeType: 'atomic',
      atomType: 'text-input',
    }],
    response: {
      gradingMode: 'node-intent',
      scoredNodes: ['node-1'],
      intentByNode: [{
        node: 'node-1',
        expected: '2',
      }],
      traceByNode: [{
        node: 'node-1',
        productionRuleId: 'enter-factor',
        actionId: 'node-1::UpdateTextField::2',
        stimulusKC: 'stim-1',
        responseKC: 'resp-1',
      }],
    },
  }) as SparcTrialDisplay;
}

function result(submittedValue: unknown = '2'): SparcTrialResult {
  return {
    submittedNodes: {
      'node-1': submittedValue,
    },
    triggeredBy: 'node-1',
    timestamp: 2000,
  };
}

describe('sparcTraceFromTrialResult', function() {
  it('creates SPARC trace steps from authored display metadata and submitted nodes', function() {
    const trace = createSparcTraceFromTrialResult({
      documentId: 'doc-1',
      display: display(),
      result: result(),
    });

    assert.deepEqual(trace, [{
      traceId: 'doc-1:node-1:0',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'node-1',
      },
      productionRuleId: 'enter-factor',
      actionId: 'node-1::UpdateTextField::2',
      outcome: 'correct',
      time: 2000,
      details: {
        stimulusKC: 'stim-1',
        responseKC: 'resp-1',
      },
    }]);
  });

  it('marks trace outcomes incorrect when the submitted node does not match its authored intent', function() {
    const trace = createSparcTraceFromTrialResult({
      documentId: 'doc-1',
      display: display(),
      result: result('3'),
    });

    assert.equal(trace[0]?.outcome, 'incorrect');
  });

  it('selects among multiple authored trace links for the same node by submitted value', function() {
    const multiLinkDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      schema: 'tutorscript-sparc/1.0',
      nodes: [{
        id: 'OV2',
        nodeType: 'atomic',
        atomType: 'text-input',
      }],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: ['OV2'],
        intentByNode: [{
          node: 'OV2',
          expected: '4.25',
        }],
        traceByNode: [{
          node: 'OV2',
          submittedValue: '4.25',
          productionRuleId: 'enter-given-from conversion-factors',
          actionId: 'OV2::UpdateTextField::4.25',
        }, {
          node: 'OV2',
          submittedValue: '12',
          productionRuleId: 'unnamed',
          actionId: 'OV2::UpdateTextField::12',
        }],
      },
    }) as SparcTrialDisplay;
    const trace = createSparcTraceFromTrialResult({
      documentId: 'doc-1',
      display: multiLinkDisplay,
      result: {
        submittedNodes: {
          OV2: '12',
        },
        triggeredBy: 'OV2',
        timestamp: 3000,
      },
    });

    assert.equal(trace[0]?.actionId, 'OV2::UpdateTextField::12');
    assert.equal(trace[0]?.productionRuleId, 'unnamed');
    assert.equal(trace[0]?.outcome, 'incorrect');
  });

  it('fails clearly when scored nodes do not have authored production-rule metadata', function() {
    const incompleteDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: ['node-1'],
        intentByNode: [{ node: 'node-1', expected: '2' }],
      },
    }) as SparcTrialDisplay;

    assert.throws(
      () => createSparcTraceFromTrialResult({
        documentId: 'doc-1',
        display: incompleteDisplay,
        result: result(),
      }),
      /missing trace metadata for node "node-1"/,
    );
  });

  it('fails clearly when same-node trace links do not match the submitted value', function() {
    const multiLinkDisplay = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: ['OV2'],
        intentByNode: [{ node: 'OV2', expected: '4.25' }],
        traceByNode: [{
          node: 'OV2',
          submittedValue: '4.25',
          productionRuleId: 'enter-given-from conversion-factors',
          actionId: 'OV2::UpdateTextField::4.25',
        }],
      },
    }) as SparcTrialDisplay;

    assert.throws(
      () => createSparcTraceFromTrialResult({
        documentId: 'doc-1',
        display: multiLinkDisplay,
        result: {
          submittedNodes: {
            OV2: '12',
          },
          triggeredBy: 'OV2',
          timestamp: 3000,
        },
      }),
      /missing trace metadata for node "OV2" submitted value "12"/,
    );
  });
});
