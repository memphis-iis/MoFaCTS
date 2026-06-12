import assert from 'node:assert/strict';
import {
  assertSparcAuthoredDocument,
  validateSparcAuthoredDocument,
} from './sparcDocumentValidation';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function validDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
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
              documentId: 'doc-1',
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
    assert.throws(
      () => assertSparcAuthoredDocument(document),
      /missing-region.*width constraints/s,
    );
  });
});
