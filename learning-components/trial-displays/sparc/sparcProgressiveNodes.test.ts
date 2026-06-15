import assert from 'node:assert/strict';
import {
  SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
  applySparcProgressiveNodeOperations,
  collectSparcProgressiveNodeOperations,
} from './sparcProgressiveNodes';

describe('sparcProgressiveNodes', function() {
  it('collects ordered node-construction operations from transitions', function() {
    const operations = collectSparcProgressiveNodeOperations([{
      writes: [{
        key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
        value: {
          type: 'append-node',
          boxId: 'chapterFlowBox',
          node: { id: 'remediation', nodeType: 'group' },
        },
      }],
    }, {
      writes: [{
        key: 'value',
        value: 'ignored',
      }, {
        key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
        value: {
          type: 'insert-node',
          beforeNodeId: 'remediation',
          node: { id: 'feedback', nodeType: 'atomic' },
        },
      }],
    }]);

    assert.deepEqual(operations.map((operation) => operation.type), ['append-node', 'insert-node']);
  });

  it('applies append and insertion operations to the realized top-level node sequence', function() {
    const nodes = applySparcProgressiveNodeOperations([{
      id: 'intro',
      placement: { region: 'chapterFlowBox' },
    }, {
      id: 'problem-1',
      placement: { region: 'activityBox' },
    }], [{
      type: 'append-node',
      boxId: 'chapterFlowBox',
      node: { id: 'remediation', nodeType: 'group' },
    }, {
      type: 'insert-node',
      afterNodeId: 'intro',
      boxId: 'chapterFlowBox',
      node: { id: 'feedback', nodeType: 'atomic' },
    }]);

    assert.deepEqual(nodes.map((node) => (node as { id: string }).id), [
      'intro',
      'feedback',
      'problem-1',
      'remediation',
    ]);
    assert.equal(((nodes[1] as { placement: { region: string } }).placement.region), 'chapterFlowBox');
  });
});
