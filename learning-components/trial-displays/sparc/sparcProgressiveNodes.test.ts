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

  it('appends a node only when the target id is missing', function() {
    const nodes = applySparcProgressiveNodeOperations([{
      id: 'intro',
      placement: { region: 'chapterFlowBox' },
    }], [{
      type: 'append-node-if-missing',
      boxId: 'chapterFlowBox',
      node: { id: 'remediation', nodeType: 'atomic', value: '' },
    }, {
      type: 'append-text',
      nodeId: 'remediation',
      text: 'First sentence.',
    }, {
      type: 'append-node-if-missing',
      boxId: 'chapterFlowBox',
      node: { id: 'remediation', nodeType: 'atomic', value: '' },
    }, {
      type: 'append-text',
      nodeId: 'remediation',
      text: 'Second sentence.',
    }]);

    assert.deepEqual(nodes.map((node) => (node as { id: string }).id), ['intro', 'remediation']);
    assert.equal((nodes[1] as { value: string }).value, 'First sentence. Second sentence.');
  });

  it('inserts a missing node relative to a local activity node and preserves later text appends', function() {
    const nodes = applySparcProgressiveNodeOperations([{
      id: 'intro',
      placement: { region: 'chapterFlowBox' },
    }, {
      id: 'multiple-choice',
      placement: { region: 'chapterFlowBox' },
    }, {
      id: 'challenge',
      placement: { region: 'chapterFlowBox' },
    }], [{
      type: 'append-node-if-missing',
      boxId: 'chapterFlowBox',
      afterNodeId: 'multiple-choice',
      node: {
        id: 'remediation-panel',
        nodeType: 'group',
        children: [{
          id: 'remediation-text',
          nodeType: 'atomic',
          atomType: 'text-block',
          value: '',
        }],
      },
    }, {
      type: 'append-text',
      nodeId: 'remediation-text',
      text: 'First sentence.',
    }, {
      type: 'append-node-if-missing',
      boxId: 'chapterFlowBox',
      afterNodeId: 'multiple-choice',
      node: {
        id: 'remediation-panel',
        nodeType: 'group',
        children: [{
          id: 'remediation-text',
          nodeType: 'atomic',
          atomType: 'text-block',
          value: '',
        }],
      },
    }, {
      type: 'append-text',
      nodeId: 'remediation-text',
      text: 'Second sentence.',
    }]);

    assert.deepEqual(nodes.map((node) => (node as { id: string }).id), [
      'intro',
      'multiple-choice',
      'remediation-panel',
      'challenge',
    ]);
    assert.equal(
      (((nodes[2] as { children?: { value?: string }[] }).children?.[0]?.value)),
      'First sentence. Second sentence.',
    );
  });

  it('appends text to an existing realized text node without duplicating a sentence', function() {
    const nodes = applySparcProgressiveNodeOperations([{
      id: 'remediation',
      nodeType: 'atomic',
      atomType: 'text-block',
      value: 'First sentence.',
    }], [{
      type: 'append-text',
      nodeId: 'remediation',
      text: 'Second sentence.',
      separator: ' ',
    }, {
      type: 'append-text',
      nodeId: 'remediation',
      text: 'Second sentence.',
      separator: ' ',
    }]);

    assert.equal((nodes[0] as { value: string }).value, 'First sentence. Second sentence.');
  });

  it('appends text to nested text nodes', function() {
    const nodes = applySparcProgressiveNodeOperations([{
      id: 'remediation-panel',
      nodeType: 'group',
      children: [{
        id: 'remediation-text',
        nodeType: 'atomic',
        atomType: 'text-block',
        value: '',
      }],
    }], [{
      type: 'append-text',
      nodeId: 'remediation-text',
      text: 'Nested sentence.',
    }]);

    const group = nodes[0] as { children: { value: string }[] };
    assert.equal(group.children[0]?.value, 'Nested sentence.');
  });
});
