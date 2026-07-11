import assert from 'node:assert/strict';
import {
  assertSparcDocumentReferences,
  resolveSparcDocumentAddress,
  validateSparcDocumentReferences,
} from './sparcDocumentAddressing';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function sampleDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 2,
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'prompt',
        kind: 'section',
        refs: [{
          relation: 'depends-on',
          target: {
            pageKey: 'doc-1',
            nodeId: 'work-node',
          },
        }, {
          relation: 'feedback-for',
          target: {
            pageKey: 'doc-1',
            nodeId: 'answer-node',
          },
        }],
      }, {
        id: 'work-node',
        kind: 'panel',
        children: [{
          id: 'input-node',
          kind: 'input',
        }],
      }, {
        id: 'answer-node',
        kind: 'feedback',
      }],
    },
  };
}

describe('sparcDocumentAddressing', function() {
  it('resolves authored addresses directly to any authored node', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      pageKey: 'doc-1',
      nodeId: 'answer-node',
    });

    assert.equal(resolved.node.id, 'answer-node');
  });

  it('resolves contained nodes without requiring their containment path', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      pageKey: 'doc-1',
      nodeId: 'input-node',
    });

    assert.equal(resolved.node.id, 'input-node');
  });

  it('validates cross-node references in the sample documents', function() {
    const document = sampleDocument();

    assert.deepEqual(validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcDocumentReferences(document));
  });

  it('reports unresolved node references without guessing a target', function() {
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
              pageKey: 'doc-1',
              nodeId: 'missing-widget',
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
      /node "missing-widget" not found/,
    );
  });

  it('validates authored reference state keys and model metrics', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'source',
          kind: 'panel',
          refs: [{
            relation: 'depends-on',
            target: {
              pageKey: 'doc-1',
              nodeId: 'target',
            },
            stateKey: ' ',
          }, {
            relation: 'model-target',
            target: {
              pageKey: 'doc-1',
              nodeId: 'target',
            },
            modelMetric: 'fluency' as never,
          }],
        }, {
          id: 'target',
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.message), [
      'SPARC node "source" reference stateKey is required when declared',
      'SPARC node "source" reference modelMetric "fluency" is not recognized',
    ]);
  });

  it('validates authored initial-state write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      initialState: [{
        target: {
          pageKey: 'doc-1',
          nodeId: 'missing',
        },
        key: 'visible',
        value: false,
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'initial-state:0');
    assert.match(result.issues[0]?.message ?? '', /node "missing" not found/);
  });

  it('validates authored initial-state write keys', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      initialState: [{
        target: {
          pageKey: 'doc-1',
          nodeId: 'region-1',
        },
        key: '',
        value: false,
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'initial-state:0');
    assert.match(result.issues[0]?.message ?? '', /initialState\[0\]\.key is required/);
  });

  it('validates authored model targets against their authored address', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcPageKey: 'doc-1',
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
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'widget-1',
          kind: 'widget',
          modelTarget: {
            sparcPageKey: 'doc-1',
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

  it('allows authored model targets that name the authored node directly', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcPageKey: 'doc-1',
              sparcNodeId: 'widget-1',
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

  it('rejects authored model targets that name another authored node', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
          children: [{
            id: 'widget-1',
            kind: 'widget',
            modelTarget: {
              sparcPageKey: 'doc-1',
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
    assert.match(result.issues[0]?.message ?? '', /modelTarget for node "widget-1" must match authored address/);
  });

  it('fails clearly when an address points at another document', function() {
    assert.throws(
      () => resolveSparcDocumentAddress(sampleDocument(), {
        pageKey: 'other-doc',
        nodeId: 'conversion-table',
      }),
      /does not match authored document/,
    );
  });

  it('fails clearly when authored node ids are duplicated', function() {
    const document: SparcAuthoredDocument = {
      id: 'dup-doc',
      schemaVersion: 2,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'dup',
          kind: 'section',
        }, {
          id: 'dup',
          kind: 'panel',
        }],
      },
    };

    assert.throws(
      () => resolveSparcDocumentAddress(document, {
        pageKey: 'dup-doc',
        nodeId: 'dup',
      }),
      /duplicate node id "dup"/,
    );
  });
});
