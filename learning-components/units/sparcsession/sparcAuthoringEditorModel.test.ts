import assert from 'node:assert/strict';
import {
  defaultProductionCondition,
  defaultProductionEffect,
  defaultProductionRule,
  getRenderedSparcPaletteEntries,
} from './sparcAuthoringEditorModel';
import {
  SPARC_ATOMIC_NODE_CATALOG,
  SPARC_GROUP_NODE_CATALOG,
} from './sparcAuthoringCatalog';

describe('sparcAuthoringEditorModel', function() {
  it('exposes every rendered catalog node and group to the widget palette', function() {
    const paletteIds = new Set(getRenderedSparcPaletteEntries().map((entry) => entry.id));

    for (const entry of [...SPARC_GROUP_NODE_CATALOG, ...SPARC_ATOMIC_NODE_CATALOG]) {
      assert.equal(paletteIds.has(entry.id), true, `missing palette entry for ${entry.id}`);
    }
  });

  it('creates runtime-shaped production rule defaults', function() {
    const rule = defaultProductionRule(0);

    assert.equal(rule.id, 'production-rule-1');
    assert.equal(Array.isArray(rule.when), true);
    assert.equal(Array.isArray(rule.tests), true);
    assert.equal(Array.isArray(rule.then), true);
    assert.deepEqual(defaultProductionCondition('not-fact-pattern'), {
      type: 'not',
      pattern: {
        factType: 'interface-state',
        slots: {},
      },
    });
    assert.deepEqual(defaultProductionEffect('classify'), {
      type: 'classify',
      outcome: 'correct',
    });
  });
});
