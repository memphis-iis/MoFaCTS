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
      message: 'SPARC node "wide-region" with width constraints must declare reflow, shrink, stack, or constrain behavior',
    }]);
  });

  it('flags fixed minimum widths without reflow behavior', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'wide-table',
          kind: 'region',
          layout: {
            minWidth: '1200px',
          },
        }],
      },
    };

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues, [{
      kind: 'missing-wide-content-policy',
      nodeId: 'wide-table',
      message: 'SPARC node "wide-table" with width constraints must declare reflow, shrink, stack, or constrain behavior',
    }]);
  });

  it('rejects explicit horizontal overflow on authored nodes', function() {
    const document = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'scrolling-table',
          kind: 'region',
          layout: {
            maxWidth: '100%',
            wideContent: 'stack',
            overflowX: 'auto',
          },
        }],
      },
    } as unknown as SparcAuthoredDocument;

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues, [{
      kind: 'horizontal-overflow',
      nodeId: 'scrolling-table',
      message: 'SPARC node "scrolling-table" declares horizontal overflow',
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
