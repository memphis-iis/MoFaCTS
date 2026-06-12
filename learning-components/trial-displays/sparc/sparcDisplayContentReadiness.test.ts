import assert from 'node:assert/strict';
import { sparcTrialDisplayAdapter } from './SparcTrialDisplayAdapter';
import {
  assertSparcDisplayContentReady,
  validateSparcDisplayContentReadiness,
} from './sparcDisplayContentReadiness';

describe('sparcDisplayContentReadiness', function() {
  it('accepts a node-authored SPARC display with layout zones and scored intents', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      schema: 'tutorscript-sparc/1.0',
      layout: {
        zones: [{
          id: 'workspace',
        }],
      },
      nodes: [{
        id: 'node-group-work',
        nodeType: 'group',
        placement: {
          region: 'workspace',
        },
        children: [{
          id: 'node-answer',
          nodeType: 'atomic',
          atomType: 'text-input',
        }],
      }],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: ['node-answer'],
        intentByNode: [{
          node: 'node-answer',
          expected: '42',
        }],
      },
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display), {
      ready: true,
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcDisplayContentReady(display));
  });

  it('reports content readiness issues without knowing any specific lesson', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [{
        id: 'node-group-work',
        nodeType: 'group',
        placement: {
          region: 'missing-zone',
        },
        children: [{
          id: 'node-answer',
          nodeType: 'atomic',
        }, {
          id: 'node-answer',
          nodeType: 'atomic',
        }],
      }],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: ['node-missing', 'node-answer'],
        intentByNode: [{
          node: 'node-answer',
          expected: '42',
        }],
      },
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display).issues.map((issue) => issue.kind), [
      'duplicate-node-id',
      'missing-scored-node',
      'missing-intent',
      'missing-layout-zone',
    ]);
    assert.throws(
      () => assertSparcDisplayContentReady(display),
      /duplicated.*missing layout zone/,
    );
  });

  it('accepts behavior refs and path-scoped intents that point at authored nodes', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
        atomType: 'text-input',
      }],
      behaviorRefs: {
        answer: 'node-answer',
      },
      response: {
        gradingMode: 'sai-path-intent',
        scoredNodes: ['node-answer'],
        intentByPath: [{
          path: 'path-a',
          intentByNode: [{
            node: 'node-answer',
            expected: '42',
          }],
        }],
      },
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display), {
      ready: true,
      issues: [],
    });
  });

  it('reports behavior refs and path intents that point at missing nodes', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
      }],
      behaviorRefs: {
        missingRef: 'node-missing-ref',
      },
      response: {
        gradingMode: 'sai-path-intent',
        intentByPath: [{
          path: 'path-a',
          intentByNode: [{
            node: 'node-missing-path',
            expected: '42',
          }],
        }],
      },
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display).issues.map((issue) => issue.kind), [
      'missing-path-intent-node',
      'missing-behavior-ref-node',
    ]);
  });
});
