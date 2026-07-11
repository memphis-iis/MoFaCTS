import assert from 'node:assert/strict';
import {
  assertSparcAuthoredDocument,
  sparcAuthoredDocumentUsesModelBackedFeatures,
  validateSparcAuthoredDocument,
} from './sparcDocumentValidation';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function validDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 2,
    layout: {
      scrollAxis: 'vertical',
      visualPreset: 'assignment',
      density: 'comfortable',
      maxWidth: '100%',
      wideContent: 'reflow',
    },
    root: {
      id: 'root',
      kind: 'document',
      layout: {
        scrollAxis: 'vertical',
        visualPreset: 'chapter',
        density: 'comfortable',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      children: [{
        id: 'region-1',
        kind: 'panel',
        layout: {
          visualPreset: 'section',
          density: 'comfortable',
          maxWidth: '100%',
          wideContent: 'stack',
        },
      }],
    },
  };
}

describe('sparcDocumentValidation', function() {
  it('accepts authored documents through the combined validation gate', function() {
    const document = validDocument();

    assert.deepEqual(validateSparcAuthoredDocument(document), {
      valid: true,
      referenceIssues: [],
      layoutIssues: [],
      modelConfigIssues: [],
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcAuthoredDocument(document));
  });

  it('combines reference and layout validation issues for authored documents', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'wide-region',
          kind: 'panel',
          refs: [{
            relation: 'depends-on',
            target: {
              pageKey: 'doc-1',
              nodeId: 'missing-region',
            },
          }],
          layout: {
            minWidth: '1200px',
          },
        }],
      },
    };

    const result = validateSparcAuthoredDocument(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.source), ['references', 'layout']);
    assert.match(result.referenceIssues[0]?.message ?? '', /node "missing-region" not found/);
    assert.deepEqual(result.layoutIssues, [{
      kind: 'missing-wide-content-policy',
      nodeId: 'wide-region',
      message: 'SPARC node "wide-region" with width constraints must declare reflow, shrink, stack, or constrain behavior',
    }]);
    assert.deepEqual(result.modelConfigIssues, []);
    assert.throws(
      () => assertSparcAuthoredDocument(document),
      /missing-region.*width constraints/s,
    );
  });

  it('requires unit-level sparcsession model config for model-backed authored features', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'progress',
          kind: 'output',
          atomType: 'learning-progress',
        } as never],
      },
    };

    assert.equal(sparcAuthoredDocumentUsesModelBackedFeatures(document), true);

    const missingUnitResult = validateSparcAuthoredDocument(document, {});
    assert.equal(missingUnitResult.valid, false);
    assert.deepEqual(missingUnitResult.modelConfigIssues.map((issue) => issue.kind), [
      'missing-sparcsession-model-config',
    ]);

    const incompleteUnitResult = validateSparcAuthoredDocument(document, {
      sparcsession: {},
    });
    assert.equal(incompleteUnitResult.valid, true);
    assert.deepEqual(incompleteUnitResult.modelConfigIssues, []);

    const validUnitResult = validateSparcAuthoredDocument(document, {
      sparcsession: {
        pageId: 'page-1',
        calculateProbability: 'return p;',
      },
    });
    assert.equal(validUnitResult.valid, true);
    assert.deepEqual(validUnitResult.modelConfigIssues, []);
  });

  it('detects model-practice effects and model-targeted node attachments', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'adaptive-panel',
          kind: 'panel',
          clusterIndices: [0],
        }],
      },
      productionRules: [{
        id: 'credit-model',
        when: [{
          factType: 'interface-event',
        }],
        then: [{
          type: 'model-practice',
          outcome: 'correct',
          clusterIndex: 0,
        }],
      }],
    };

    assert.equal(sparcAuthoredDocumentUsesModelBackedFeatures(document), true);
  });
});
