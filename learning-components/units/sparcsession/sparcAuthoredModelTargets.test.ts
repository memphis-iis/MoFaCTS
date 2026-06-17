import assert from 'node:assert/strict';
import {
  resolveSparcAuthoredModelTarget,
  resolveSparcProductionRuleModelTarget,
} from './sparcAuthoredModelTargets';
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
    stimulusRegistry: [{
      stimulusId: 'region-stimulus',
      ...regionTarget,
    }, {
      stimulusId: 'widget-stimulus',
      ...widgetTarget,
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-7',
        kind: 'panel',
        stimulusIds: ['region-stimulus'],
        children: [{
          id: 'widget-3',
          kind: 'widget',
          stimulusIds: ['widget-stimulus'],
          children: [{
            id: 'input',
            kind: 'input',
          }],
        }],
      }, {
        id: 'hint-region',
        kind: 'panel',
      }],
    },
  };
}

describe('sparcAuthoredModelTargets', function() {
  it('resolves the authored model target for the addressed node', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      documentId: 'doc-1',
      nodeId: 'widget-3',
    });

    assert.deepEqual(target, widgetTarget);
  });

  it('resolves an attached registry target for a region node', function() {
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
        nodeId: 'missing-widget',
      }),
      /node "missing-widget" not found/,
    );
  });

  it('requires production-rule model-practice effects to resolve through the stimulus registry', function() {
    const modelTargetOnlyDocument: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'widget-3',
          kind: 'widget',
          modelTarget: widgetTarget,
        }],
      },
    };

    assert.throws(
      () => resolveSparcProductionRuleModelTarget({
        document: modelTargetOnlyDocument,
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'widget-3',
        },
      }),
      /must resolve through stimulusRegistry attachment/,
    );
  });
});
