import assert from 'node:assert/strict';
import { sparcTrialDisplayAdapter } from './SparcTrialDisplayAdapter';
import {
  assertSparcDisplayContentReady,
  validateSparcDisplayContentReadiness,
} from './sparcDisplayContentReadiness';

describe('sparcDisplayContentReadiness', function() {
  it('accepts a node-authored SPARC display with layout zones and scored intents', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      schema: 'tutorscript-sparc/2.0',
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

  it('rejects unsupported authored production rules without requiring a larger schema', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
      }],
      behavior: {
        authoredProductionRules: [{ id: 'old-summary-rule' }],
      },
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display).issues.map((issue) => issue.kind), [
      'unsupported-authored-production-rules',
    ]);
  });

  it('checks executable production rules for runnable structure and literal node targets', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
      }],
      productionRules: [{
        id: 'rule-missing-target',
        when: [{
          factType: 'interface-event',
          slots: {},
        }],
        then: [{
          type: 'write-state',
          write: {
            target: {
              pageKey: { type: 'literal', value: 'doc-1' },
              nodeId: { type: 'literal', value: 'node-missing' },
            },
            key: 'value',
            value: { type: 'literal', value: 'ok' },
          },
        }],
      }, {
        id: '',
        when: [],
        then: 'not-array',
      }],
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display).issues.map((issue) => issue.kind), [
      'missing-production-rule-target-node',
      'invalid-production-rule',
      'invalid-production-rule',
      'invalid-production-rule',
    ]);
  });

  it('accepts executable derived fact rules', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
      }],
      derivedFacts: [{
        id: 'answer-branch',
        when: [{
          factType: 'interface-event',
          slots: {
            sourceNode: { type: 'literal', value: 'node-answer' },
            input: { type: 'bind', variable: 'answerValue' },
          },
        }],
        fact: {
          factType: 'answer.branch',
          slots: {
            value: { type: 'variable', name: 'answerValue' },
          },
        },
      }],
    });

    assert.deepEqual(validateSparcDisplayContentReadiness(display), {
      ready: true,
      issues: [],
    });
  });

  it('rejects malformed derived fact rules before runtime', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      nodes: [{
        id: 'node-answer',
        nodeType: 'atomic',
      }],
      derivedFacts: [{
        id: '',
        when: [],
        fact: {
          factType: '',
        },
      }, {
        id: 'unsafe-any-binding',
        when: [{
          type: 'any',
          conditions: [{
            factType: 'interface-event',
            slots: {
              input: { type: 'bind', variable: 'leftOnly' },
            },
          }, {
            factType: 'interface-event',
            slots: {
              input: { type: 'bind', variable: 'rightOnly' },
            },
          }],
        }],
        fact: {
          factType: 'answer.branch',
          slots: {
            value: { type: 'variable', name: 'leftOnly' },
          },
        },
      }],
    });

    const issues = validateSparcDisplayContentReadiness(display).issues;

    assert.deepEqual(issues.map((issue) => issue.kind), [
      'invalid-derived-fact-rule',
      'invalid-derived-fact-rule',
      'invalid-derived-fact-rule',
    ]);
    assert.match(
      issues.map((issue) => issue.message).join('; '),
      /derivedFacts\[0\]\.id is required.*fact\.factType.*unsafe-any-binding.*any/,
    );
  });
});
