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
  sparcPageKey: 'doc-1',
  sparcNodeId: 'region-7',
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'region-kc',
  clusterKC: 'cluster-1',
  KCId: 'region-kc',
  KCDefault: 'region-kc',
  KCCluster: 'cluster-1',
};

const widgetTarget: SparcModelTargetIdentity = {
  sparcPageKey: 'doc-1',
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
    clusterTargets: [{
      clusterIndex: 0,
      ...regionTarget,
    }, {
      clusterIndex: 1,
      ...widgetTarget,
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-7',
        kind: 'panel',
        clusterIndices: [0],
        children: [{
          id: 'widget-3',
          kind: 'widget',
          clusterIndices: [1],
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
      pageKey: 'doc-1',
      nodeId: 'widget-3',
    });

    assert.deepEqual(target, widgetTarget);
  });

  it('resolves an attached registry target for a region node', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      pageKey: 'doc-1',
      nodeId: 'region-7',
    });

    assert.deepEqual(target, regionTarget);
  });

  it('normalizes authored cluster target identity without changing stimulus identity', function() {
    const document = {
      ...authoredDocument(),
      clusterTargets: [{
        ...regionTarget,
        clusterIndex: 0,
        clusterKC: ' Fractions.LCD ',
        KCCluster: ' Fractions.LCD ',
        stimulusKC: ' Stim-A ',
        KCId: ' Stim-A ',
        KCDefault: ' Stim-A ',
      }],
    };

    const target = resolveSparcAuthoredModelTarget(document, {
      pageKey: 'doc-1',
      nodeId: 'region-7',
    });

    assert.equal(target?.clusterKC, 'fractions.lcd');
    assert.equal(target?.KCCluster, 'fractions.lcd');
    assert.equal(target?.stimulusKC, ' Stim-A ');
    assert.equal(target?.KCId, ' Stim-A ');
    assert.equal(target?.KCDefault, ' Stim-A ');
  });

  it('returns undefined for authored content with no model target', function() {
    const target = resolveSparcAuthoredModelTarget(authoredDocument(), {
      pageKey: 'doc-1',
      nodeId: 'hint-region',
    });

    assert.equal(target, undefined);
  });

  it('fails clearly when the source address is not in the authored document', function() {
    assert.throws(
      () => resolveSparcAuthoredModelTarget(authoredDocument(), {
        pageKey: 'doc-1',
        nodeId: 'missing-widget',
      }),
      /node "missing-widget" not found/,
    );
  });

  it('requires production-rule model-practice effects to resolve through cluster attachments', function() {
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
          pageKey: 'doc-1',
          nodeId: 'widget-3',
        },
      }),
      /must resolve through cluster attachment/,
    );
  });
});
