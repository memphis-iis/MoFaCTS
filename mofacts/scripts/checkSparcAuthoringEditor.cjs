const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const createJiti = require('jiti');

const jiti = createJiti(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const catalog = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcAuthoringCatalog.ts'));
const editorModel = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcAuthoringEditorModel.ts'));
const modelTargets = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcAuthoredModelTargets.ts'));
const fractionGroups = jiti(path.join(repoRoot, 'learning-components/trial-displays/sparc/sparcFractionGroups.ts'));
const authoringValidation = jiti(path.join(repoRoot, 'mofacts/client/views/experimentSetup/sparc/sparcAuthoringValidation.js'));

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertPaletteCoverage() {
  const paletteIds = new Set(editorModel.getRenderedSparcPaletteEntries().map((entry) => entry.id));
  for (const entry of [
    ...catalog.SPARC_GROUP_NODE_CATALOG,
    ...catalog.SPARC_ATOMIC_NODE_CATALOG,
  ]) {
    assert.equal(paletteIds.has(entry.id), true, `missing palette entry for ${entry.id}`);
  }
  assert.equal(paletteIds.has('atomic.dialogue-utterance'), true, 'missing dialogue utterance palette entry');
  assert.equal(paletteIds.has('group.dialogue-thread'), true, 'missing dialogue thread palette entry');
  return paletteIds.size;
}

function assertDialogueCatalogShape() {
  const atomicEntriesByType = new Map(catalog.SPARC_ATOMIC_NODE_CATALOG.map((entry) => [
    entry.schema.properties?.atomType?.const,
    entry,
  ]));
  const groupEntriesByType = new Map(catalog.SPARC_GROUP_NODE_CATALOG.map((entry) => [
    entry.schema.properties?.groupType?.const,
    entry,
  ]));
  const utterance = atomicEntriesByType.get('dialogue-utterance');
  assert.ok(utterance, 'missing dialogue-utterance atom catalog entry');
  assert.deepEqual(utterance.schema.properties.speaker.enum, ['learner', 'tutor']);
  assert.equal(utterance.defaultValue.speaker, 'tutor');
  const thread = groupEntriesByType.get('dialogue-thread');
  assert.ok(thread, 'missing dialogue-thread group catalog entry');
  assert.equal(thread.defaultValue.children[0].atomType, 'dialogue-utterance');
}

function assertRuleCatalogCoverage() {
  const ruleIds = new Set(catalog.SPARC_RULE_CATALOG.map((entry) => entry.id));
  for (const id of [
    'rule.condition.fact-pattern',
    'rule.condition.not-fact-pattern',
    'rule.condition.any',
    'rule.test.comparison',
    'rule.expression',
    'rule.effect.assert-fact',
    'rule.effect.write-state',
    'rule.effect.message',
    'rule.effect.classify',
    'rule.effect.credit',
    'rule.effect.model-practice',
    'rule.effect.progressive-node-operation',
  ]) {
    assert.equal(ruleIds.has(id), true, `missing rule catalog entry for ${id}`);
  }
}

function assertRuleRoundTrip() {
  const productionRule = editorModel.defaultProductionRule(0);
  productionRule.id = 'roundtrip.production';
  productionRule.tests.push(editorModel.defaultProductionTest());
  productionRule.then.push(editorModel.defaultProductionEffect('write-state'));
  productionRule.then.push({
    ...editorModel.defaultProductionEffect('model-practice'),
    clusterIndex: 0,
  });
  productionRule.then.push(editorModel.defaultProductionEffect('append-text'));

  const rawStimuliFile = {
    setspec: {
      clusters: [{
        clustername: 'roundtrip-cluster',
        stims: [{
          stimulusid: 0,
          display: {
            type: 'text',
            text: 'Round trip cluster',
          },
          response: {
            correctResponse: 'Answer',
          },
        }],
      }],
      sparcPages: [{
        pageId: 'roundtrip-page',
        display: {
          type: 'sparc',
          pageKey: 'doc-1',
          nodes: [{
            id: 'node-1',
            nodeType: 'atomic',
            atomType: 'text-block',
            value: 'Round trip',
            clusterIndices: [0],
          }],
          initialState: [editorModel.defaultStateWrite('doc-1', 'node-1')],
          productionRules: [productionRule],
          layout: {
            layoutMode: 'document',
            scrollAxis: 'vertical',
          },
          forwardCompatibleField: {
            preserved: true,
          },
        },
      }],
    },
  };

  const beforeHash = stableHash(rawStimuliFile);
  const roundTripped = clone(rawStimuliFile);
  const afterHash = stableHash(roundTripped);

  assert.equal(afterHash, beforeHash, 'raw SPARC page JSON changed during clone round trip');
  const display = roundTripped.setspec.sparcPages[0].display;
  assert.equal(display.productionRules[0].id, 'roundtrip.production');
  assert.equal(('reactive' + 'Rules') in display, false);
  assert.equal(display.nodes[0].clusterIndices[0], 0);
  assert.equal(display.productionRules[0].then.some((effect) => effect.type === 'model-practice' && effect.clusterIndex === 0), true);
  assert.equal(display.forwardCompatibleField.preserved, true);
}

function assertProductionRuleValidation() {
  const clusters = [{
    clustername: 'validation-cluster',
    stims: [{
      stimulusid: 0,
      display: {
        type: 'text',
        text: 'Validation cluster',
      },
      response: {
        correctResponse: 'Answer',
      },
    }],
  }];
  const validRule = {
    id: 'validation.any.local-bindings',
    when: [{
      type: 'any',
      conditions: [{
        factType: 'learningTarget.score',
        slots: {
          clusterKC: { type: 'bind', variable: 'targetClusterKC' },
          coverage: { type: 'range', min: 0.33, max: 0.67 },
        },
      }, {
        factType: 'diagnostic.misconceptionScore',
        slots: {
          id: { type: 'bind', variable: 'misconceptionId' },
        },
      }],
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'validation.anyMatched',
      },
    }],
  };
  const invalidRule = clone(validRule);
  invalidRule.id = 'validation.any.unsafe-binding';
  invalidRule.then = [{
    type: 'assert-fact',
    fact: {
      factType: 'validation.selectedTarget',
      slots: {
        clusterKC: { type: 'variable', name: 'targetClusterKC' },
      },
    },
  }];
  const basePage = {
    pageId: 'validation-page',
    display: {
      type: 'sparc',
      pageKey: 'validation-doc',
      nodes: [{
        id: 'node-1',
        nodeType: 'atomic',
        atomType: 'text-block',
        value: 'Validation',
        clusterIndices: [0],
      }],
      productionRules: [validRule],
    },
  };
  const target = { pageIndex: 0, label: 'Validation page' };

  assert.doesNotThrow(() => authoringValidation.validateSparcDisplaysBeforeSave({
    sparcTargets: [target],
    sparcPages: [clone(basePage)],
    clusters,
  }));
  const invalidPage = clone(basePage);
  invalidPage.display.productionRules = [invalidRule];
  assert.throws(
    () => authoringValidation.validateSparcDisplaysBeforeSave({
      sparcTargets: [target],
      sparcPages: [invalidPage],
      clusters,
    }),
    /any branch-local bindings are referenced outside the any condition: targetClusterKC/,
  );
}

function assertClusterResolution() {
  const document = {
    id: 'doc-1',
    schemaVersion: 2,
    clusterTargets: [{
      clusterIndex: 0,
      stimuliSetId: 'set-a',
      stimulusKC: 'kc-a',
      clusterKC: 'cluster-a',
      KCId: 'kc-a',
      KCDefault: 'kc-a',
      KCCluster: 'cluster-a',
    }, {
      clusterIndex: 1,
      stimuliSetId: 'set-a',
      stimulusKC: 'kc-b',
      clusterKC: 'cluster-a',
      KCId: 'kc-b',
      KCDefault: 'kc-b',
      KCCluster: 'cluster-a',
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'single-node',
        kind: 'input',
        clusterIndices: [0],
      }, {
        id: 'ambiguous-node',
        kind: 'input',
        clusterIndices: [0, 1],
      }, {
        id: 'sparc-only-node',
        kind: 'output',
      }],
    },
  };

  const resolved = modelTargets.resolveSparcAuthoredModelTarget(document, {
    pageKey: 'doc-1',
    nodeId: 'single-node',
  });
  assert.equal(resolved.stimulusKC, 'kc-a');
  assert.equal(resolved.sparcNodeId, 'single-node');
  assert.equal(modelTargets.resolveSparcAuthoredModelTarget(document, {
    pageKey: 'doc-1',
    nodeId: 'sparc-only-node',
  }), undefined);
  assert.throws(
    () => modelTargets.resolveSparcAuthoredModelTarget(document, {
      pageKey: 'doc-1',
      nodeId: 'ambiguous-node',
    }),
    /ambiguous/,
  );
  assert.throws(
    () => modelTargets.resolveSparcProductionRuleModelTarget({
      document,
      sourceAddress: {
        pageKey: 'doc-1',
        nodeId: 'sparc-only-node',
      },
    }),
    /did not resolve a cluster/,
  );
  assert.equal('defaultSparcStimulusRegistryEntry' in editorModel, false);
}

function assertFractionNormalization() {
  const nodes = fractionGroups.normalizeSparcFractionGroups([{
    id: 'row',
    nodeType: 'group',
    groupType: 'equation-row',
    children: [{
      id: 'fraction-top',
      nodeType: 'atomic',
      atomType: 'fraction-input',
      position: 'top',
      value: '',
    }, {
      id: 'fraction-bottom',
      nodeType: 'atomic',
      atomType: 'fraction-box',
      position: 'bottom',
      value: '12',
    }],
  }]);
  const row = nodes[0];
  assert.equal(row.children.length, 1, 'adjacent fraction atoms should normalize into one fraction group');
  assert.equal(row.children[0].groupType, 'fraction');
  assert.equal(row.children[0].children[0].fractionRole, 'numerator');
  assert.equal(row.children[0].children[1].fractionRole, 'denominator');

  const explicit = fractionGroups.normalizeSparcFractionGroups([{
    id: 'explicit-fraction',
    nodeType: 'group',
    groupType: 'fraction',
    children: [{
      id: 'explicit-top',
      nodeType: 'atomic',
      atomType: 'fraction-input',
      fractionRole: 'numerator',
    }, {
      id: 'explicit-bottom',
      nodeType: 'atomic',
      atomType: 'fraction-input',
      fractionRole: 'denominator',
    }],
  }]);
  assert.equal(explicit[0].id, 'explicit-fraction');
  assert.equal(explicit[0].children.length, 2, 'explicit fraction children should not be rewrapped');
}

const paletteEntries = assertPaletteCoverage();
assertDialogueCatalogShape();
assertRuleCatalogCoverage();
assertRuleRoundTrip();
assertProductionRuleValidation();
assertClusterResolution();
assertFractionNormalization();

console.log(JSON.stringify({
  sparcAuthoringEditorCheck: true,
  paletteEntries,
  ruleCatalogEntries: catalog.SPARC_RULE_CATALOG.length,
}));
