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
      layoutMode: 'document',
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
        layoutMode: 'stack',
        visualPreset: 'chapter',
        density: 'comfortable',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      children: [{
        id: 'wide-region',
        kind: 'panel',
        layout: {
          layoutMode: 'stack',
          visualPreset: 'section',
          density: 'comfortable',
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
        visualPreset: 'assignment',
        density: 'comfortable',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
    } as unknown as SparcAuthoredDocument;

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.kind), ['horizontal-scroll-axis']);
  });

  it('requires document-level assignment/chapter visual presets', function() {
    const missingPreset = {
      ...validDocument(),
      layout: {
        scrollAxis: 'vertical',
        layoutMode: 'document',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
    } as unknown as SparcAuthoredDocument;
    const panelPreset = {
      ...validDocument(),
      layout: {
        scrollAxis: 'vertical',
        layoutMode: 'document',
        visualPreset: 'practice-panel',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
    } as unknown as SparcAuthoredDocument;

    assert.deepEqual(validateSparcVerticalLayout(missingPreset).issues.map((issue) => issue.kind), [
      'missing-document-visual-preset',
    ]);
    assert.deepEqual(validateSparcVerticalLayout(panelPreset).issues.map((issue) => issue.kind), [
      'invalid-visual-preset',
    ]);
  });

  it('rejects unrecognized visual preset and density tokens', function() {
    const document = {
      ...validDocument(),
      layout: {
        scrollAxis: 'vertical',
        layoutMode: 'document',
        visualPreset: 'assignment',
        density: 'dense',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      root: {
        ...validDocument().root,
        children: [{
          id: 'novel-section',
          kind: 'section',
          layout: {
            layoutMode: 'stack',
            visualPreset: 'dashboard',
            density: 'quiet',
            maxWidth: '100%',
            wideContent: 'reflow',
          },
        }],
      },
    } as unknown as SparcAuthoredDocument;

    assert.deepEqual(validateSparcVerticalLayout(document).issues, [{
      kind: 'invalid-visual-density',
      message: 'SPARC document "doc-1" density "dense" is not recognized',
    }, {
      kind: 'invalid-visual-preset',
      nodeId: 'novel-section',
      message: 'SPARC node "novel-section" visualPreset "dashboard" is not recognized',
    }, {
      kind: 'invalid-visual-density',
      nodeId: 'novel-section',
      message: 'SPARC node "novel-section" density "quiet" is not recognized',
    }]);
  });

  it('flags wide authored nodes that do not declare shrink/reflow/stack/constrain behavior', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'wide-region',
          kind: 'panel',
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
          kind: 'panel',
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
          kind: 'panel',
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

  it('accepts Shiny-style sidebar/module layout when it stacks on narrow widths', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'practice-module',
          kind: 'module',
          layout: {
            layoutMode: 'sidebar',
            visualPreset: 'practice-panel',
            density: 'comfortable',
            maxWidth: '100%',
            wideContent: 'stack',
          },
          children: [{
            id: 'controls-panel',
            kind: 'panel',
            layout: {
              layoutMode: 'stack',
              visualPreset: 'control-panel',
              density: 'compact',
              maxWidth: '100%',
              wideContent: 'reflow',
            },
          }, {
            id: 'output-panel',
            kind: 'panel',
            layout: {
              layoutMode: 'stack',
              visualPreset: 'feedback-panel',
              density: 'comfortable',
              maxWidth: '100%',
              wideContent: 'reflow',
            },
          }],
        }],
      },
    };

    assert.deepEqual(validateSparcVerticalLayout(document), {
      valid: true,
      issues: [],
    });
  });

  it('rejects column/sidebar layout modes without stack or reflow behavior', function() {
    const document: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'two-column-panel',
          kind: 'panel',
          layout: {
            layoutMode: 'columns',
            visualPreset: 'practice-panel',
            maxWidth: '100%',
            wideContent: 'shrink',
          },
        }],
      },
    };

    const result = validateSparcVerticalLayout(document);

    assert.equal(result.valid, false);
    assert.deepEqual(result.issues, [{
      kind: 'missing-responsive-layout-policy',
      nodeId: 'two-column-panel',
      message: 'SPARC node "two-column-panel" layoutMode "columns" must declare wideContent "reflow" or "stack"',
    }]);
  });

  it('requires panel and module nodes to declare panel visual presets', function() {
    const missingPreset: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'unstyled-panel',
          kind: 'panel',
          layout: {
            layoutMode: 'stack',
            maxWidth: '100%',
            wideContent: 'reflow',
          },
        }],
      },
    };
    const documentPreset: SparcAuthoredDocument = {
      ...validDocument(),
      root: {
        ...validDocument().root,
        children: [{
          id: 'chapter-panel',
          kind: 'panel',
          layout: {
            layoutMode: 'stack',
            visualPreset: 'chapter',
            maxWidth: '100%',
            wideContent: 'reflow',
          },
        }],
      },
    };

    assert.deepEqual(validateSparcVerticalLayout(missingPreset).issues, [{
      kind: 'missing-panel-visual-preset',
      nodeId: 'unstyled-panel',
      message: 'SPARC panel "unstyled-panel" must declare a panel visualPreset',
    }]);
    assert.deepEqual(validateSparcVerticalLayout(documentPreset).issues, [{
      kind: 'invalid-visual-preset',
      nodeId: 'chapter-panel',
      message: 'SPARC panel "chapter-panel" visualPreset "chapter" is not a panel preset',
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
