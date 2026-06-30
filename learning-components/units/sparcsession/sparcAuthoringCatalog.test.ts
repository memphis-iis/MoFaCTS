import assert from 'node:assert/strict';
import {
  SPARC_AUTHORING_CATALOG,
  SPARC_ATOMIC_NODE_CATALOG,
  SPARC_GROUP_NODE_CATALOG,
  SPARC_RULE_CATALOG,
} from './sparcAuthoringCatalog';

describe('sparcAuthoringCatalog', function() {
  it('catalogs the renderer-supported atomic node palette', function() {
    const atomTypes = new Set(SPARC_ATOMIC_NODE_CATALOG.map((entry) => (
      entry.schema.properties?.atomType?.const
    )));

    for (const atomType of [
      'html-block',
      'text-block',
      'message-box',
      'dialogue-utterance',
      'button',
      'text-input',
      'dropdown',
      'checkbox',
      'panel-selector',
      'skill-bar',
      'operator',
      'header-cell',
      'text',
    ]) {
      assert.equal(atomTypes.has(atomType), true, `missing atomic node catalog entry for ${atomType}`);
    }
  });

  it('distinguishes static skill bars from model-backed progress reporters', function() {
    const entriesByAtomType = new Map(SPARC_ATOMIC_NODE_CATALOG.map((entry) => [
      entry.schema.properties?.atomType?.const,
      entry,
    ]));

    const skillBar = entriesByAtomType.get('skill-bar');
    const learningProgress = entriesByAtomType.get('learning-progress');
    const dialogueUtterance = entriesByAtomType.get('dialogue-utterance');

    assert.match(skillBar?.description ?? '', /Static authored/);
    assert.match(skillBar?.description ?? '', /does not read or update adaptive model probabilities/);
    assert.match(learningProgress?.description ?? '', /Model-backed adaptive progress reporter/);
    assert.match(learningProgress?.description ?? '', /shared sidebar progress panel/);
    assert.match(dialogueUtterance?.description ?? '', /Sequential learner or tutor message/);
    assert.deepEqual(dialogueUtterance?.schema.properties?.speaker?.enum, ['learner', 'tutor']);
  });

  it('catalogs the OLI-generated SPARC group patterns', function() {
    const groupTypes = new Set(SPARC_GROUP_NODE_CATALOG.map((entry) => (
      entry.schema.properties?.groupType?.const
    )));

    for (const groupType of [
      'section',
      'dialogue-thread',
      'multiple-choice',
      'answer-list',
      'targeted-cata',
      'checkbox-choice',
      'dropdown-exercise',
      'dropdown-row',
      'text-input-exercise',
      'text-input-row',
      'short-answer',
      'fraction',
      'oli-group',
    ]) {
      assert.equal(groupTypes.has(groupType), true, `missing group node catalog entry for ${groupType}`);
    }
  });

  it('provides authored starter templates for rendered group palette entries', function() {
    for (const entry of SPARC_GROUP_NODE_CATALOG) {
      const template = entry.defaultValue as any;
      assert.equal(template?.nodeType, 'group', `${entry.id} missing group default`);
      assert.equal(template?.groupType, entry.schema.properties?.groupType?.const, `${entry.id} default groupType mismatch`);
      assert.equal(Array.isArray(template?.children), true, `${entry.id} default children must be an array`);
      assert.equal(template.children.length > 0, true, `${entry.id} default children must not be empty`);
    }
  });

  it('catalogs production rule conditions, tests, expressions, and effects', function() {
    const ruleIds = new Set(SPARC_RULE_CATALOG.map((entry) => entry.id));

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
      'rule.effect.terminate-production-phase',
      'rule.effect.progressive-node-operation',
    ]) {
      assert.equal(ruleIds.has(id), true, `missing rule catalog entry for ${id}`);
    }
  });

  it('packages the editor-facing catalog as a single stable object', function() {
    assert.equal(SPARC_AUTHORING_CATALOG.schemaVersion, 1);
    assert.equal(SPARC_AUTHORING_CATALOG.source, 'sparc-authoring-catalog');
    assert.equal(SPARC_AUTHORING_CATALOG.nodeEntries.length > 0, true);
    assert.equal(SPARC_AUTHORING_CATALOG.groupEntries.length > 0, true);
    assert.equal(SPARC_AUTHORING_CATALOG.semanticEntries.length > 0, true);
    assert.equal(SPARC_AUTHORING_CATALOG.layoutEntries.length > 0, true);
    assert.equal(SPARC_AUTHORING_CATALOG.ruleEntries.length > 0, true);
  });
});
