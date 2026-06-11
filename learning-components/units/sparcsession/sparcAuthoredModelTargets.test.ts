import assert from 'node:assert/strict';
import { resolveSparcAuthoredModelTarget } from './sparcAuthoredModelTargets';
import type {
  SparcAuthoredDocument,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

const regionTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
  sparcNodeId: 'region-7',
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'region-kc',
  clusterKC: 'cluster-1',
  KCId: 'region-kc',
  KCDefault: 'region-kc',
  KCCluster: 'cluster-1',
};

const widgetTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
  sparcNodeId: 'widget-3',
  sparcPath: ['widget-3'],
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'widget-kc',
  clusterKC: 'cluster-1',
  KCId: 'widget-kc',
  KCDefault: 'widget-kc',
  KCCluster: 'cluster-1',
  response: {
    responseKC: 'response-kc-1',
    responseKey: 'answer',
  },
};

function authoredDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-7',
        kind: 'region',
        modelTarget: regionTarget,
        children: [{
          id: 'widget-3',
          kind: 'widget',
          modelTarget: widgetTarget,
          children: [{
            id: 'input',
            kind: 'input',
          }],
        }],
      }, {
        id: 'hint-region',
        kind: 'region',
      }],
    },
  };
}

describe('sparcAuthoredModelTargets', function() {
  it('resolves the deepest authored model target for an address inside a region', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      documentId: 'doc-1',
      nodeId: 'region-7',
      path: ['widget-3', 'input'],
    });

    assert.deepEqual(target, widgetTarget);
  });

  it('falls back to an enclosing node model target when nested content has none', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      documentId: 'doc-1',
      nodeId: 'region-7',
    });

    assert.deepEqual(target, regionTarget);
  });

  it('returns undefined for authored content with no model target', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      documentId: 'doc-1',
      nodeId: 'hint-region',
    });

    assert.equal(target, undefined);
  });

  it('fails clearly when the source address is not in the authored document', function() {
    assert.throws(
      () => resolveSparcAuthoredModelTarget(authoredDocument(), {
        documentId: 'doc-1',
        nodeId: 'region-7',
        path: ['missing-widget'],
      }),
      /path segment "missing-widget" not found/,
    );
  });
});
