import assert from 'node:assert/strict';
import {
  assertSparcDocumentReferences,
  resolveSparcDocumentAddress,
  validateSparcDocumentReferences,
} from './sparcDocumentAddressing';
import { findSparcSampleDocument } from './sparcSampleDocuments';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function sampleDocument(): SparcAuthoredDocument {
  const sample = findSparcSampleDocument('html-factors-balloons');
  assert.ok(sample);
  return sample.document;
}

describe('sparcDocumentAddressing', function() {
  it('resolves authored addresses into nested content inside another region', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      documentId: 'html-factors-balloons',
      nodeId: 'final-answer-region',
      path: ['A3'],
    });

    assert.equal(resolved.node.id, 'final-answer-region');
    assert.deepEqual(resolved.pathNodes.map((node) => node.id), ['A3']);
  });

  it('resolves numeric path segments against authored children', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      documentId: 'html-factors-balloons',
      nodeId: 'conversion-table',
      path: [1],
    });

    assert.deepEqual(resolved.pathNodes.map((node) => node.id), ['OV2']);
  });

  it('validates cross-region references in the sample documents', function() {
    const document = sampleDocument();

    assert.deepEqual(validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcDocumentReferences(document));
  });

  it('reports unresolved nested path references without guessing a target', function() {
    const document: SparcAuthoredDocument = {
      ...sampleDocument(),
      root: {
        ...sampleDocument().root,
        children: [{
          id: 'source',
          kind: 'section',
          refs: [{
            relation: 'feedback-for',
            target: {
              documentId: 'html-factors-balloons',
              nodeId: 'final-answer-region',
              path: ['missing-widget'],
            },
          }],
        }, ...(sampleDocument().root.children ?? [])],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'source');
    assert.match(
      result.issues[0]?.message ?? '',
      /path segment "missing-widget" not found under node "final-answer-region"/,
    );
  });

  it('validates authored reactive rule write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-rule',
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
            path: ['missing'],
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
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-rule');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing" not found/);
  });

  it('validates authored reactive rule state-condition targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-condition',
        when: {
          type: 'state',
          query: {
            target: {
              documentId: 'doc-1',
              nodeId: 'region-1',
              path: ['missing'],
            },
            key: 'ready',
          },
          compare: 'truthy',
        },
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
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
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-condition:when');
    assert.equal(result.issues[0]?.reference.relation, 'depends-on');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing" not found/);
  });

  it('validates nested authored reactive rule condition targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'nested-condition',
        when: {
          type: 'all',
          conditions: [{
            type: 'not',
            condition: {
              type: 'state',
              query: {
                target: {
                  documentId: 'doc-1',
                  nodeId: 'missing-region',
                },
                key: 'blocked',
              },
              compare: 'truthy',
            },
          }],
        },
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
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
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:nested-condition:when');
    assert.match(result.issues[0]?.message ?? '', /node "missing-region" not found/);
  });

  it('validates authored reactive rule model-condition target identity consistency', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-model-condition',
        when: {
          type: 'model',
          query: {
            target: {
              sparcDocumentId: 'doc-1',
              sparcNodeId: 'widget-1',
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'different-kc',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
            metric: 'priorCorrect',
          },
          compare: 'gte',
          value: 1,
        },
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'widget-1',
          },
          key: 'visible',
          value: true,
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'widget-1',
          kind: 'widget',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-model-condition:when');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /KCId must equal stimulusKC/);
  });

  it('validates authored reactive rule model-condition SPARC target addresses', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-model-address',
        when: {
          type: 'model',
          query: {
            target: {
              sparcDocumentId: 'doc-1',
              sparcNodeId: 'region-1',
              sparcPath: ['missing-widget'],
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'kc-1',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
            metric: 'priorCorrect',
          },
          compare: 'gte',
          value: 1,
        },
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
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
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-model-address:when');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing-widget" not found/);
  });

  it('validates authored initial-state write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      initialState: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'region-1',
          path: ['missing'],
        },
        key: 'visible',
        value: false,
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'initial-state:0');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing" not found/);
  });

  it('validates authored model targets against their authored address', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcDocumentId: 'doc-1',
              sparcNodeId: 'other-widget',
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'kc-1',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
          }],
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'widget-1');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /modelTarget for node "widget-1" must match authored address/);
  });

  it('validates authored model target shared identity consistency', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'widget-1',
          kind: 'widget',
          modelTarget: {
            sparcDocumentId: 'doc-1',
            sparcNodeId: 'widget-1',
            stimuliSetId: 'stim-set-1',
            stimulusKC: 'kc-1',
            clusterKC: 'cluster-1',
            KCId: 'kc-1',
            KCDefault: 'different-kc',
            KCCluster: 'cluster-1',
          },
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'widget-1');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /KCDefault must equal stimulusKC/);
  });

  it('allows authored model targets whose nested sparcPath ends at the authored node', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcDocumentId: 'doc-1',
              sparcNodeId: 'widget-1',
              sparcPath: ['region-1', 'widget-1'],
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'kc-1',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
          }],
        }],
      },
    };

    assert.deepEqual(validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
  });

  it('rejects authored model targets whose sparcPath ends at another node', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcDocumentId: 'doc-1',
              sparcNodeId: 'widget-1',
              sparcPath: ['region-1', 'other-widget'],
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'kc-1',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
          }],
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'widget-1');
    assert.match(result.issues[0]?.message ?? '', /sparcPath must end at that node/);
  });

  it('fails clearly when an address points at another document', function() {
    assert.throws(
      () => resolveSparcDocumentAddress(sampleDocument(), {
        documentId: 'other-doc',
        nodeId: 'conversion-table',
      }),
      /does not match authored document/,
    );
  });

  it('fails clearly when authored node ids are duplicated', function() {
    const document: SparcAuthoredDocument = {
      id: 'dup-doc',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'dup',
          kind: 'section',
        }, {
          id: 'dup',
          kind: 'region',
        }],
      },
    };

    assert.throws(
      () => resolveSparcDocumentAddress(document, {
        documentId: 'dup-doc',
        nodeId: 'dup',
      }),
      /duplicate node id "dup"/,
    );
  });
});
