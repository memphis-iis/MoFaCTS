import assert from 'node:assert/strict';
import {
  assertSparcVerticalLayout,
  validateSparcVerticalLayout,
} from './sparcLayoutPolicy';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function validDocument(): SparcAuthoredDocument {
  return {
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
      layout: {
        scrollAxis: 'vertical',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      children: [{
        id: 'wide-region',
        kind: 'region',
        layout: {
          maxWidth: '100%',
          wideContent: 'stack',
        },
      }],
    },
  };
}

describe('sparcLayoutPolicy', function() {
  it('accepts vertical chapter-scale layout with explicit wide-content behavior', function() {
    const result = validateSparcVerticalLayout(validDocument());

    assert.deepEqual(result, {
      valid: true,
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcVerticalLayout(validDocument()));
  });

  it('rejects document-level horizontal scrolling', function() {
    const document = {
      ...validDocument(),
      layout: {
        scrollAxis: 'horizontal',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
    } as unknown as SparcAuthoredDocument;

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.kind), ['horizontal-scroll-axis']);
  });

  it('flags wide authored nodes that do not declare shrink/reflow/stack/constrain behavior', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'wide-region',
          kind: 'region',
          layout: {
            maxWidth: '1200px',
          },
        }],
      },
    };

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues, [{
      kind: 'missing-wide-content-policy',
      nodeId: 'wide-region',
      message: 'SPARC node "wide-region" with maxWidth must declare reflow, shrink, stack, or constrain behavior',
    }]);
  });

  it('requires a document-level vertical layout declaration', function() {
    const document = {
      ...validDocument(),
      layout: undefined,
    } as unknown as SparcAuthoredDocument;

    assert.throws(
      () => assertSparcVerticalLayout(document),
      /must declare vertical document layout/,
    );
  });
});
