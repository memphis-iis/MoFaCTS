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
    schemaVersion: 1,
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'prompt',
        kind: 'section',
        refs: [{
          relation: 'depends-on',
          target: {
            documentId: 'doc-1',
            nodeId: 'work-node',
          },
        }, {
          relation: 'feedback-for',
          target: {
            documentId: 'doc-1',
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
      documentId: 'doc-1',
      nodeId: 'answer-node',
    });

    assert.equal(resolved.node.id, 'answer-node');
  });

  it('resolves contained nodes without requiring their containment path', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      documentId: 'doc-1',
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
              documentId: 'doc-1',
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
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'source',
          kind: 'panel',
          refs: [{
            relation: 'depends-on',
            target: {
              documentId: 'doc-1',
              nodeId: 'target',
            },
            stateKey: ' ',
          }, {
            relation: 'model-target',
            target: {
              documentId: 'doc-1',
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

  it('validates authored reactive rule write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-rule',
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'missing',
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
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-rule');
    assert.match(result.issues[0]?.message ?? '', /node "missing" not found/);
  });

  it('validates authored reactive rule write keys', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-write-key',
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          key: ' ',
          value: true,
        }],
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
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-write-key');
    assert.match(result.issues[0]?.message ?? '', /writes\[0\]\.key is required/);
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
              nodeId: 'missing',
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
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-condition:when');
    assert.equal(result.issues[0]?.reference.relation, 'depends-on');
    assert.match(result.issues[0]?.message ?? '', /node "missing" not found/);
  });

  it('validates authored reactive rule state-condition query keys', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-condition-key',
        when: {
          type: 'state',
          query: {
            target: {
              documentId: 'doc-1',
              nodeId: 'region-1',
            },
            key: '',
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
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-condition-key:when');
    assert.match(result.issues[0]?.message ?? '', /state-condition query key is required/);
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
          kind: 'panel',
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
              sparcNodeId: 'missing-widget',
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
          kind: 'panel',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-model-address:when');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /node "missing-widget" not found/);
  });

  it('validates authored node reactive state-condition targets by direct node id', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      layout: {
        scrollAxis: 'vertical',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'panel',
          children: [{
            id: 'widget-1',
            kind: 'widget',
          }],
        }, {
          id: 'feedback-output',
          kind: 'output',
          reactive: {
            visibleWhen: {
              type: 'state',
              query: {
                target: {
                  documentId: 'doc-1',
                  nodeId: 'widget-1',
                },
                key: 'lastOutcome',
              },
              compare: 'eq',
              value: 'correct',
            },
          },
        }],
      },
    };

    assert.deepEqual(validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
  });

  it('validates authored node reactive model-condition targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'adaptive-panel',
          kind: 'panel',
          reactive: {
            enabledWhen: {
              type: 'model',
              query: {
                target: {
                  sparcDocumentId: 'doc-1',
                  sparcNodeId: 'adaptive-panel',
                  stimuliSetId: 'stim-set-1',
                  stimulusKC: 'kc-1',
                  clusterKC: 'cluster-1',
                  KCId: 'wrong-kc',
                  KCDefault: 'kc-1',
                  KCCluster: 'cluster-1',
                },
                metric: 'probability',
              },
              compare: 'gte',
              value: 0.8,
            },
          },
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'adaptive-panel:reactive.enabledWhen');
    assert.equal(result.issues[0]?.reference.relation, 'model-target');
    assert.match(result.issues[0]?.message ?? '', /KCId must equal stimulusKC/);
  });

  it('validates authored initial-state write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      initialState: [{
        target: {
          documentId: 'doc-1',
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
      schemaVersion: 1,
      initialState: [{
        target: {
          documentId: 'doc-1',
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
      schemaVersion: 1,
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

  it('allows authored model targets that name the authored node directly', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
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
              sparcDocumentId: 'doc-1',
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
      schemaVersion: 1,
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
    assert.match(result.issues[0]?.message ?? '', /modelTarget for node "widget-1" must match authored address/);
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
          kind: 'panel',
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
