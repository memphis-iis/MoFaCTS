<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
  import {
    defaultProductionCondition,
    defaultProductionEffect,
    defaultProductionRule,
    defaultProductionTest,
    defaultReactiveCondition,
    defaultReactiveRule,
    defaultSparcStimulusRegistryEntry,
    defaultStateWrite,
    getRenderedSparcPaletteEntries,
    literalExpression,
    variableExpression,
  } from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel';
  import SparcNode from '../../experiment/svelte/components/SparcNode.svelte';

  export let tdfId = '';
  export let initialTdf = null;
  export let queryParams = {};
  export let onSave = async () => {};
  export let onCancel = () => {};

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const paletteEntries = getRenderedSparcPaletteEntries();
  const productionEffectTypes = [
    'classify',
    'assert-fact',
    'write-state',
    'message',
    'credit',
    'model-practice',
    'append-node',
    'append-node-if-missing',
    'insert-node',
    'append-text',
  ];
  const productionConditionTypes = ['fact-pattern', 'not-fact-pattern'];
  const reactiveConditionTypes = ['state', 'model', 'all', 'any', 'not'];
  const ruleExpressionTypes = ['literal', 'variable', 'function'];
  const comparisonOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
  const reactiveComparisonOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'];
  const classifyOutcomes = ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown', 'buggy'];
  const messageTypes = ['hint', 'buggy', 'success', 'feedback'];
  const functionNames = ['add', 'subtract', 'multiply', 'divide', 'mod', 'gcd', 'lcm'];

  let rawStimuliFile = clone(initialTdf?.rawStimuliFile || { setspec: { clusters: [] } });
  let clusters = rawStimuliFile?.setspec?.clusters || [];
  let sparcTargets = findSparcTargets(clusters);
  let activeTargetKey = sparcTargets[0]?.key || '';
  let activeNodeId = '';
  let htmlEditorElement;
  let htmlEditor = null;
  let saving = false;
  let errorText = '';
  let saveMessage = '';
  let activeEditorTab = 'nodes';
  let activeProductionRuleIndex = 0;
  let activeReactiveRuleIndex = 0;
  let activeStimulusIndex = 0;

  $: activeTarget = sparcTargets.find((target) => target.key === activeTargetKey) || sparcTargets[0] || null;
  $: activeDisplay = activeTarget ? clusters[activeTarget.clusterIndex]?.stims?.[activeTarget.stimIndex]?.display : null;
  $: selectedStimFile = queryParams?.stimFile ? String(queryParams.stimFile) : '';
  $: displayNodes = Array.isArray(activeDisplay?.nodes) ? activeDisplay.nodes : [];
  $: productionRules = Array.isArray(activeDisplay?.productionRules) ? activeDisplay.productionRules : [];
  $: reactiveRules = Array.isArray(activeDisplay?.reactiveRules) ? activeDisplay.reactiveRules : [];
  $: stimulusRegistry = Array.isArray(activeDisplay?.stimulusRegistry) ? activeDisplay.stimulusRegistry : [];
  $: activeProductionRule = productionRules[activeProductionRuleIndex] || productionRules[0] || null;
  $: activeReactiveRule = reactiveRules[activeReactiveRuleIndex] || reactiveRules[0] || null;
  $: activeStimulus = stimulusRegistry[activeStimulusIndex] || stimulusRegistry[0] || null;
  $: flatNodes = flattenNodes(displayNodes);
  $: if (flatNodes.length > 0 && !flatNodes.some((entry) => entry.node?.id === activeNodeId)) {
    activeNodeId = flatNodes[0].node.id;
  }
  $: activeNodeEntry = flatNodes.find((entry) => entry.node?.id === activeNodeId) || flatNodes[0] || null;
  $: activeNode = activeNodeEntry?.node || displayNodes[0] || null;
  $: maintainHtmlEditor(activeNode, htmlEditorElement);
  $: syncHtmlEditor(activeNode);

  function findSparcTargets(candidateClusters) {
    const targets = [];
    (candidateClusters || []).forEach((cluster, clusterIndex) => {
      (cluster?.stims || []).forEach((stim, stimIndex) => {
        if (stim?.display?.type === 'sparc' && Array.isArray(stim.display.nodes)) {
          targets.push({
            key: `${clusterIndex}:${stimIndex}`,
            clusterIndex,
            stimIndex,
            label: stim.display.documentId || cluster.clustername || `Cluster ${clusterIndex + 1}, Stim ${stimIndex + 1}`,
          });
        }
      });
    });
    return targets;
  }

  function flattenNodes(nodes, depth = 0, parent = null) {
    const results = [];
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue;
      results.push({ node, depth, parent });
      if (node.nodeType === 'group') {
        results.push(...flattenNodes(node.children || [], depth + 1, node.id));
      }
      if (node.atomType === 'panel-selector') {
        for (const panel of node.panels || []) {
          results.push(...flattenNodes(panel.children || [], depth + 1, panel.id));
        }
      }
    }
    return results;
  }

  function makeNodeId(entry) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `node-${entry.id.replace('.', '-')}-${suffix}`;
  }

  function createNode(entry) {
    const node = entry.defaultValue === undefined
      ? {
        nodeType: entry.schema?.properties?.nodeType?.const || (entry.id.startsWith('group.') ? 'group' : 'atomic'),
        ...(entry.id.startsWith('group.') ? { groupType: entry.schema?.properties?.groupType?.const } : {}),
        ...(entry.id.startsWith('atomic.') ? { atomType: entry.schema?.properties?.atomType?.const } : {}),
      }
      : clone(entry.defaultValue);
    node.id = makeNodeId(entry);
    if (node.nodeType === 'group') {
      node.children = Array.isArray(node.children) ? node.children : [];
    }
    if (node.atomType === 'panel-selector') {
      node.panels = Array.isArray(node.panels) && node.panels.length
        ? node.panels
        : [{
          id: `${node.id}-panel-1`,
          label: 'Panel 1',
          children: [],
        }];
      node.selectedPanelId = node.selectedPanelId || node.panels[0].id;
    }
    return node;
  }

  function activeChildren() {
    if (!activeDisplay) {
      throw new Error('No active SPARC display is selected.');
    }
    if (activeNode?.nodeType === 'group') {
      activeNode.children = Array.isArray(activeNode.children) ? activeNode.children : [];
      return activeNode.children;
    }
    if (activeNode?.atomType === 'panel-selector') {
      activeNode.panels = Array.isArray(activeNode.panels) && activeNode.panels.length
        ? activeNode.panels
        : [{
          id: `${activeNode.id || 'panel-selector'}-panel-1`,
          label: 'Panel 1',
          children: [],
        }];
      const selectedPanel = activeNode.panels.find((panel) => panel.id === activeNode.selectedPanelId)
        || activeNode.panels[0];
      activeNode.selectedPanelId = selectedPanel.id;
      selectedPanel.children = Array.isArray(selectedPanel.children) ? selectedPanel.children : [];
      return selectedPanel.children;
    }
    return activeDisplay.nodes;
  }

  function addNode(entry) {
    try {
      const node = createNode(entry);
      activeChildren().push(node);
      activeNodeId = node.id;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function updateField(fieldName, value) {
    if (!activeNode) return;
    const oldId = activeNode.id;
    activeNode[fieldName] = value;
    if (fieldName === 'id') {
      activeNodeId = value;
    }
    markChanged();
  }

  function updateOptions(value) {
    updateField('options', value.split('\n').map((option) => option.trim()).filter(Boolean));
  }

  function parseLooseValue(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const numberValue = Number(trimmed);
    if (Number.isFinite(numberValue) && trimmed === String(numberValue)) {
      return numberValue;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  }

  function stringifyLooseValue(value) {
    if (typeof value === 'string') return value;
    if (value === undefined) return '';
    return JSON.stringify(value);
  }

  function ensureProductionRules() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.productionRules = Array.isArray(activeDisplay.productionRules) ? activeDisplay.productionRules : [];
    return activeDisplay.productionRules;
  }

  function ensureReactiveRules() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.reactiveRules = Array.isArray(activeDisplay.reactiveRules) ? activeDisplay.reactiveRules : [];
    return activeDisplay.reactiveRules;
  }

  function ensureStimulusRegistry() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.stimulusRegistry = Array.isArray(activeDisplay.stimulusRegistry) ? activeDisplay.stimulusRegistry : [];
    return activeDisplay.stimulusRegistry;
  }

  function addStimulusRegistryEntry() {
    try {
      const registry = ensureStimulusRegistry();
      registry.push(defaultSparcStimulusRegistryEntry(registry.length));
      activeStimulusIndex = registry.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeStimulusRegistryEntry(index) {
    const registry = ensureStimulusRegistry();
    const removed = registry[index]?.stimulusId;
    registry.splice(index, 1);
    if (removed) {
      for (const entry of flatNodes) {
        const ids = Array.isArray(entry.node.stimulusIds) ? entry.node.stimulusIds : [];
        entry.node.stimulusIds = ids.filter((id) => id !== removed);
      }
    }
    activeStimulusIndex = Math.max(0, Math.min(activeStimulusIndex, registry.length - 1));
    markChanged();
  }

  function updateStimulusField(fieldName, value) {
    if (!activeStimulus) return;
    activeStimulus[fieldName] = fieldName === 'stimulusId' || fieldName === 'label'
      ? String(value)
      : parseLooseValue(value);
    if (fieldName === 'stimulusKC') {
      activeStimulus.KCId = activeStimulus.KCId || activeStimulus.stimulusKC;
      activeStimulus.KCDefault = activeStimulus.KCDefault || activeStimulus.stimulusKC;
    }
    if (fieldName === 'clusterKC') {
      activeStimulus.KCCluster = activeStimulus.KCCluster || activeStimulus.clusterKC;
    }
    markChanged();
  }

  function updateStimulusResponseField(fieldName, value) {
    if (!activeStimulus) return;
    if (!value && fieldName === 'responseKC' && !activeStimulus.response?.responseKey) {
      delete activeStimulus.response;
      markChanged();
      return;
    }
    activeStimulus.response = activeStimulus.response && typeof activeStimulus.response === 'object'
      ? activeStimulus.response
      : { responseKC: '', responseKey: '' };
    activeStimulus.response[fieldName] = fieldName === 'responseKey' ? String(value) : parseLooseValue(value);
    if (!activeStimulus.response.responseKC && !activeStimulus.response.responseKey) {
      delete activeStimulus.response;
    }
    markChanged();
  }

  function nodeStimulusIds(node) {
    return Array.isArray(node?.stimulusIds) ? node.stimulusIds : [];
  }

  function toggleNodeStimulus(stimulusId, checked) {
    if (!activeNode) return;
    const ids = new Set(nodeStimulusIds(activeNode));
    if (checked) ids.add(stimulusId);
    else ids.delete(stimulusId);
    activeNode.stimulusIds = [...ids];
    markChanged();
  }

  function updateProductionRuleField(fieldName, value) {
    if (!activeProductionRule) return;
    if (fieldName === 'salience') {
      const numberValue = Number(value);
      if (value === '') {
        delete activeProductionRule.salience;
      } else if (Number.isFinite(numberValue)) {
        activeProductionRule.salience = numberValue;
      }
    } else if (value === '' && fieldName === 'module') {
      delete activeProductionRule.module;
    } else {
      activeProductionRule[fieldName] = value;
    }
    markChanged();
  }

  function addProductionRule() {
    try {
      const rules = ensureProductionRules();
      rules.push(defaultProductionRule(rules.length));
      activeProductionRuleIndex = rules.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeProductionRule(index) {
    const rules = ensureProductionRules();
    rules.splice(index, 1);
    activeProductionRuleIndex = Math.max(0, Math.min(activeProductionRuleIndex, rules.length - 1));
    markChanged();
  }

  function moveProductionRule(index, delta) {
    const rules = ensureProductionRules();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const [rule] = rules.splice(index, 1);
    rules.splice(nextIndex, 0, rule);
    activeProductionRuleIndex = nextIndex;
    markChanged();
  }

  function addProductionCondition(kind = 'fact-pattern') {
    if (!activeProductionRule) return;
    activeProductionRule.when = Array.isArray(activeProductionRule.when) ? activeProductionRule.when : [];
    activeProductionRule.when.push(defaultProductionCondition(kind));
    markChanged();
  }

  function removeProductionCondition(index) {
    if (!activeProductionRule?.when) return;
    activeProductionRule.when.splice(index, 1);
    markChanged();
  }

  function productionConditionKind(condition) {
    return condition?.type === 'not' ? 'not-fact-pattern' : 'fact-pattern';
  }

  function changeProductionConditionKind(index, kind) {
    if (!activeProductionRule?.when) return;
    activeProductionRule.when[index] = defaultProductionCondition(kind);
    markChanged();
  }

  function productionConditionPattern(condition) {
    return condition?.type === 'not' ? condition.pattern : condition;
  }

  function updateProductionConditionFactType(condition, value) {
    const pattern = productionConditionPattern(condition);
    if (!pattern) return;
    pattern.factType = value;
    markChanged();
  }

  function addFactSlot(condition) {
    const pattern = productionConditionPattern(condition);
    if (!pattern) return;
    pattern.slots = pattern.slots && typeof pattern.slots === 'object' ? pattern.slots : {};
    let index = Object.keys(pattern.slots).length + 1;
    let key = `slot${index}`;
    while (Object.prototype.hasOwnProperty.call(pattern.slots, key)) {
      index += 1;
      key = `slot${index}`;
    }
    pattern.slots[key] = { type: 'literal', value: '' };
    markChanged();
  }

  function removeFactSlot(condition, key) {
    const pattern = productionConditionPattern(condition);
    if (!pattern?.slots) return;
    delete pattern.slots[key];
    markChanged();
  }

  function renameFactSlot(condition, oldKey, newKey) {
    const pattern = productionConditionPattern(condition);
    const normalized = String(newKey || '').trim();
    if (!pattern?.slots || !normalized || normalized === oldKey) return;
    pattern.slots[normalized] = pattern.slots[oldKey];
    delete pattern.slots[oldKey];
    markChanged();
  }

  function updateFactSlotType(slot, type) {
    if (!slot) return;
    if (type === 'literal') {
      slot.type = 'literal';
      slot.value = '';
      delete slot.variable;
    } else {
      slot.type = type;
      slot.variable = slot.variable || 'value';
      delete slot.value;
    }
    markChanged();
  }

  function updateFactSlotValue(slot, value) {
    if (!slot) return;
    if (slot.type === 'literal') {
      slot.value = parseLooseValue(value);
    } else {
      slot.variable = value;
    }
    markChanged();
  }

  function addProductionTest() {
    if (!activeProductionRule) return;
    activeProductionRule.tests = Array.isArray(activeProductionRule.tests) ? activeProductionRule.tests : [];
    activeProductionRule.tests.push(defaultProductionTest());
    markChanged();
  }

  function removeProductionTest(index) {
    if (!activeProductionRule?.tests) return;
    activeProductionRule.tests.splice(index, 1);
    markChanged();
  }

  function updateRuleExpression(expression, fieldName, value) {
    if (!expression) return;
    if (fieldName === 'type') {
      if (value === 'literal') {
        expression.type = 'literal';
        expression.value = '';
        delete expression.name;
        delete expression.args;
      } else if (value === 'variable') {
        expression.type = 'variable';
        expression.name = 'value';
        delete expression.value;
        delete expression.args;
      } else if (value === 'function') {
        expression.type = 'function';
        expression.name = 'add';
        expression.args = [literalExpression(0), literalExpression(0)];
        delete expression.value;
      }
    } else if (fieldName === 'value') {
      expression.value = parseLooseValue(value);
    } else {
      expression[fieldName] = value;
    }
    markChanged();
  }

  function replaceObjectContents(target, nextValue) {
    if (!target || !nextValue || typeof nextValue !== 'object') return;
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    Object.assign(target, nextValue);
  }

  function addExpressionArg(expression) {
    if (!expression || expression.type !== 'function') return;
    expression.args = Array.isArray(expression.args) ? expression.args : [];
    expression.args.push(literalExpression(0));
    markChanged();
  }

  function removeExpressionArg(expression, index) {
    if (!expression?.args) return;
    expression.args.splice(index, 1);
    markChanged();
  }

  function updateProductionTestField(test, fieldName, value) {
    if (!test) return;
    test[fieldName] = value;
    markChanged();
  }

  function addProductionEffect(type = 'classify') {
    if (!activeProductionRule) return;
    activeProductionRule.then = Array.isArray(activeProductionRule.then) ? activeProductionRule.then : [];
    activeProductionRule.then.push(defaultProductionEffect(type));
    markChanged();
  }

  function removeProductionEffect(index) {
    if (!activeProductionRule?.then) return;
    activeProductionRule.then.splice(index, 1);
    markChanged();
  }

  function changeProductionEffectType(index, type) {
    if (!activeProductionRule?.then) return;
    activeProductionRule.then[index] = defaultProductionEffect(type);
    markChanged();
  }

  function updateEffectField(effect, fieldName, value) {
    if (!effect) return;
    effect[fieldName] = value;
    markChanged();
  }

  function updateOptionalEffectField(effect, fieldName, value) {
    if (!effect) return;
    if (value === undefined || value === '') {
      delete effect[fieldName];
    } else {
      effect[fieldName] = value;
    }
    markChanged();
  }

  function ensureEffectExpression(effect, fieldName, defaultValue = '') {
    if (!effect[fieldName]) {
      effect[fieldName] = literalExpression(defaultValue);
    }
    return effect[fieldName];
  }

  function updateEffectBoolean(effect, fieldName, checked) {
    if (!effect) return;
    effect[fieldName] = checked;
    markChanged();
  }

  function ensureEffectFactSlots(effect) {
    effect.fact = effect.fact && typeof effect.fact === 'object' ? effect.fact : { factType: 'model', slots: {} };
    effect.fact.slots = effect.fact.slots && typeof effect.fact.slots === 'object' ? effect.fact.slots : {};
    return effect.fact.slots;
  }

  function addEffectFactSlot(effect) {
    const slots = ensureEffectFactSlots(effect);
    let index = Object.keys(slots).length + 1;
    let key = `slot${index}`;
    while (Object.prototype.hasOwnProperty.call(slots, key)) {
      index += 1;
      key = `slot${index}`;
    }
    slots[key] = literalExpression('');
    markChanged();
  }

  function removeEffectFactSlot(effect, key) {
    const slots = ensureEffectFactSlots(effect);
    delete slots[key];
    markChanged();
  }

  function renameEffectFactSlot(effect, oldKey, newKey) {
    const slots = ensureEffectFactSlots(effect);
    const normalized = String(newKey || '').trim();
    if (!normalized || normalized === oldKey) return;
    slots[normalized] = slots[oldKey];
    delete slots[oldKey];
    markChanged();
  }

  function ensureTarget(target) {
    target.documentId = target.documentId || '';
    target.nodeId = target.nodeId || '';
    return target;
  }

  function updateAddressTemplate(target, fieldName, value) {
    if (!target) return;
    target[fieldName] = value.startsWith?.('?') ? variableExpression(value.slice(1)) : value;
    markChanged();
  }

  function updateStateWrite(write, fieldName, value) {
    if (!write) return;
    if (fieldName === 'value') {
      write.value = parseLooseValue(value);
    } else {
      write[fieldName] = value;
    }
    markChanged();
  }

  function addReactiveRule() {
    try {
      const rules = ensureReactiveRules();
      rules.push(defaultReactiveRule(rules.length));
      activeReactiveRuleIndex = rules.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeReactiveRule(index) {
    const rules = ensureReactiveRules();
    rules.splice(index, 1);
    activeReactiveRuleIndex = Math.max(0, Math.min(activeReactiveRuleIndex, rules.length - 1));
    markChanged();
  }

  function moveReactiveRule(index, delta) {
    const rules = ensureReactiveRules();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const [rule] = rules.splice(index, 1);
    rules.splice(nextIndex, 0, rule);
    activeReactiveRuleIndex = nextIndex;
    markChanged();
  }

  function updateReactiveRuleField(fieldName, value) {
    if (!activeReactiveRule) return;
    activeReactiveRule[fieldName] = value;
    markChanged();
  }

  function setReactiveCondition(type) {
    if (!activeReactiveRule) return;
    activeReactiveRule.when = defaultReactiveCondition(type);
    markChanged();
  }

  function updateReactiveCondition(condition, path, value) {
    if (!condition) return;
    if (path === 'compare') {
      condition.compare = value;
    } else if (path === 'value') {
      condition.value = parseLooseValue(value);
    } else if (path === 'query.key') {
      condition.query = condition.query || {};
      condition.query.key = value;
    } else if (path === 'query.target.documentId') {
      condition.query = condition.query || {};
      condition.query.target = ensureTarget(condition.query.target || {});
      condition.query.target.documentId = value;
    } else if (path === 'query.target.nodeId') {
      condition.query = condition.query || {};
      condition.query.target = ensureTarget(condition.query.target || {});
      condition.query.target.nodeId = value;
    } else if (path === 'query.metric') {
      condition.query = condition.query || {};
      condition.query.metric = value;
    } else if (path.startsWith('query.target.')) {
      const fieldName = path.slice('query.target.'.length);
      condition.query = condition.query || {};
      condition.query.target = condition.query.target || {};
      condition.query.target[fieldName] = value;
    }
    markChanged();
  }

  function changeReactiveCondition(condition, type) {
    if (!condition) return;
    replaceObjectContents(condition, defaultReactiveCondition(type));
    markChanged();
  }

  function addReactiveConditionChild(condition) {
    if (!condition || (condition.type !== 'all' && condition.type !== 'any')) return;
    condition.conditions = Array.isArray(condition.conditions) ? condition.conditions : [];
    condition.conditions.push(defaultReactiveCondition('state'));
    markChanged();
  }

  function removeReactiveConditionChild(condition, index) {
    if (!condition?.conditions) return;
    condition.conditions.splice(index, 1);
    markChanged();
  }

  function ensureNegatedReactiveCondition(condition) {
    if (!condition || condition.type !== 'not') return null;
    condition.condition = condition.condition || defaultReactiveCondition('state');
    return condition.condition;
  }

  function updateProgressiveNodeTemplate(effect, fieldName, value) {
    if (!effect) return;
    effect.node = effect.node && typeof effect.node === 'object' ? effect.node : {};
    if (fieldName === 'value') {
      effect.node.value = parseLooseValue(value);
    } else if (fieldName === 'nodeType') {
      effect.node.nodeType = value;
      if (value === 'group') {
        delete effect.node.atomType;
        effect.node.groupType = effect.node.groupType || 'section';
        effect.node.children = Array.isArray(effect.node.children) ? effect.node.children : [];
      } else {
        delete effect.node.groupType;
        delete effect.node.children;
        effect.node.atomType = effect.node.atomType || 'text-block';
      }
    } else {
      effect.node[fieldName] = value;
    }
    markChanged();
  }

  function addReactiveWrite() {
    if (!activeReactiveRule) return;
    activeReactiveRule.writes = Array.isArray(activeReactiveRule.writes) ? activeReactiveRule.writes : [];
    activeReactiveRule.writes.push(defaultStateWrite(activeDisplay?.documentId || '', activeNodeId || ''));
    markChanged();
  }

  function removeReactiveWrite(index) {
    if (!activeReactiveRule?.writes) return;
    activeReactiveRule.writes.splice(index, 1);
    markChanged();
  }

  function removeActiveNode() {
    if (!activeDisplay || !activeNode) return;
    if (!confirm(`Delete "${activeNode.id}"?`)) return;
    if (removeNodeFromList(activeDisplay.nodes, activeNode.id)) {
      activeNodeId = displayNodes[0]?.id || '';
      markChanged();
    }
  }

  function removeNodeFromList(nodes, id) {
    const index = nodes.findIndex((node) => node?.id === id);
    if (index >= 0) {
      nodes.splice(index, 1);
      return true;
    }
    for (const node of nodes) {
      if (node?.nodeType === 'group' && Array.isArray(node.children) && removeNodeFromList(node.children, id)) {
        return true;
      }
      if (node?.atomType === 'panel-selector') {
        for (const panel of node.panels || []) {
          if (Array.isArray(panel.children) && removeNodeFromList(panel.children, id)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function markChanged() {
    rawStimuliFile = rawStimuliFile;
    clusters = clusters;
    sparcTargets = findSparcTargets(clusters);
    saveMessage = '';
  }

  function syncHtmlEditor(node) {
    if (!htmlEditor || !isRichTextNode(node)) {
      return;
    }
    const current = htmlEditor.getHTML();
    const next = node.value || '<p></p>';
    if (current !== next) {
      htmlEditor.commands.setContent(next, false);
    }
  }

  function isRichTextNode(node) {
    return node && (node.atomType === 'html-block' || node.atomType === 'message-box');
  }

  function maintainHtmlEditor(node) {
    if (!isRichTextNode(node)) {
      if (htmlEditor) {
        htmlEditor.destroy();
        htmlEditor = null;
      }
      return;
    }
    ensureHtmlEditor();
  }

  function ensureHtmlEditor() {
    if (!htmlEditorElement || htmlEditor) return;
    htmlEditor = new Editor({
      element: htmlEditorElement,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: 'Write formatted SPARC content...' }),
      ],
      content: activeNode?.value || '<p></p>',
      onUpdate: ({ editor }) => {
        if (activeNode && (activeNode.atomType === 'html-block' || activeNode.atomType === 'message-box')) {
          activeNode.value = editor.getHTML();
          markChanged();
        }
      },
    });
  }

  async function handleSave() {
    saving = true;
    errorText = '';
    saveMessage = '';
    try {
      validateBeforeSave();
      await onSave(clone(rawStimuliFile));
      saveMessage = 'Saved.';
    } catch (error) {
      errorText = error.reason || error.message || String(error);
    } finally {
      saving = false;
    }
  }

  function validateBeforeSave() {
    for (const target of sparcTargets) {
      const display = clusters[target.clusterIndex]?.stims?.[target.stimIndex]?.display;
      const seen = new Set();
      const stimulusRegistryIds = stimulusRegistryIdsForDisplay(display);
      for (const entry of flattenNodes(display?.nodes || [])) {
        const node = entry.node;
        if (!node.id || typeof node.id !== 'string') {
          throw new Error(`Every SPARC node in "${target.label}" must have a non-empty string id.`);
        }
        if (seen.has(node.id)) {
          throw new Error(`Duplicate SPARC node id "${node.id}" in "${target.label}".`);
        }
        seen.add(node.id);
        for (const stimulusId of node.stimulusIds || []) {
          if (!stimulusRegistryIds.has(stimulusId)) {
            throw new Error(`Node "${node.id}" in "${target.label}" attaches unknown stimulus "${stimulusId}".`);
          }
        }
      }
      validateStimulusRegistryBeforeSave(display, target.label);
      validateRulesBeforeSave(display, target.label);
    }
  }

  function stimulusRegistryIdsForDisplay(display) {
    return new Set((display?.stimulusRegistry || []).map((entry) => entry?.stimulusId).filter(Boolean));
  }

  function validateStimulusRegistryBeforeSave(display, label) {
    const seen = new Set();
    for (const [index, stimulus] of (display?.stimulusRegistry || []).entries()) {
      requireNonBlankString(stimulus?.stimulusId, `${label} stimulusRegistry[${index}] stimulusId`);
      if (seen.has(stimulus.stimulusId)) {
        throw new Error(`${label} has duplicate stimulusId "${stimulus.stimulusId}".`);
      }
      seen.add(stimulus.stimulusId);
      for (const fieldName of ['stimuliSetId', 'stimulusKC', 'clusterKC', 'KCId', 'KCDefault', 'KCCluster']) {
        if (stimulus?.[fieldName] === undefined || stimulus?.[fieldName] === null || String(stimulus[fieldName]).trim() === '') {
          throw new Error(`${label} stimulus "${stimulus.stimulusId}" is missing ${fieldName}.`);
        }
      }
      if (String(stimulus.KCId) !== String(stimulus.stimulusKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCId equal stimulusKC.`);
      }
      if (String(stimulus.KCDefault) !== String(stimulus.stimulusKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCDefault equal stimulusKC.`);
      }
      if (String(stimulus.KCCluster) !== String(stimulus.clusterKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCCluster equal clusterKC.`);
      }
      if (stimulus.response) {
        if (stimulus.response.responseKC === undefined || stimulus.response.responseKC === null || String(stimulus.response.responseKC).trim() === '') {
          throw new Error(`${label} stimulus "${stimulus.stimulusId}" responseKC is required when response identity is used.`);
        }
        requireNonBlankString(stimulus.response.responseKey, `${label} stimulus "${stimulus.stimulusId}" responseKey`);
      }
    }
  }

  function requireNonBlankString(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is required.`);
    }
  }

  function validateRuleExpression(expression, label) {
    if (!expression || typeof expression !== 'object') {
      throw new Error(`${label} must be a rule expression.`);
    }
    if (expression.type === 'literal') {
      return;
    }
    if (expression.type === 'variable') {
      requireNonBlankString(expression.name, `${label} variable name`);
      return;
    }
    if (expression.type === 'function') {
      requireNonBlankString(expression.name, `${label} function name`);
      if (!Array.isArray(expression.args)) {
        throw new Error(`${label} function args must be an array.`);
      }
      expression.args.forEach((arg, index) => validateRuleExpression(arg, `${label} arg[${index}]`));
      return;
    }
    throw new Error(`${label} has unsupported expression type "${String(expression.type)}".`);
  }

  function validateFactPattern(pattern, label) {
    requireNonBlankString(pattern?.factType, `${label} factType`);
    for (const [slotName, slot] of Object.entries(pattern.slots || {})) {
      requireNonBlankString(slotName, `${label} slot name`);
      if (slot?.type === 'literal') {
        continue;
      }
      if (slot?.type === 'bind' || slot?.type === 'bound') {
        requireNonBlankString(slot.variable, `${label} slot "${slotName}" variable`);
        continue;
      }
      throw new Error(`${label} slot "${slotName}" has unsupported pattern type "${String(slot?.type)}".`);
    }
  }

  function validateAddressTemplate(target, label) {
    if (!target || typeof target !== 'object') {
      throw new Error(`${label} target is required.`);
    }
    for (const fieldName of ['documentId', 'nodeId']) {
      const value = target[fieldName];
      if (value && typeof value === 'object') {
        validateRuleExpression(value, `${label} target ${fieldName}`);
      } else {
        requireNonBlankString(value, `${label} target ${fieldName}`);
      }
    }
  }

  function validateProductionEffect(effect, label) {
    switch (effect?.type) {
      case 'assert-fact':
        requireNonBlankString(effect.fact?.factType, `${label} asserted factType`);
        for (const [slotName, expression] of Object.entries(effect.fact?.slots || {})) {
          requireNonBlankString(slotName, `${label} asserted slot name`);
          validateRuleExpression(expression, `${label} asserted slot "${slotName}"`);
        }
        break;
      case 'write-state':
        validateAddressTemplate(effect.write?.target, `${label} write`);
        requireNonBlankString(effect.write?.key, `${label} write key`);
        validateRuleExpression(effect.write?.value, `${label} write value`);
        break;
      case 'message':
        requireNonBlankString(effect.messageType, `${label} messageType`);
        requireNonBlankString(effect.template, `${label} template`);
        if (effect.target) {
          validateAddressTemplate(effect.target, `${label} message`);
        }
        break;
      case 'classify':
        requireNonBlankString(effect.outcome, `${label} outcome`);
        break;
      case 'credit':
        requireNonBlankString(effect.kc, `${label} kc`);
        break;
      case 'model-practice':
        requireNonBlankString(effect.outcome, `${label} outcome`);
        if (effect.stimulusId && typeof effect.stimulusId === 'object') validateRuleExpression(effect.stimulusId, `${label} stimulusId`);
        if (effect.nodeId && typeof effect.nodeId === 'object') validateRuleExpression(effect.nodeId, `${label} nodeId`);
        if (effect.responseValue !== undefined) validateRuleExpression(effect.responseValue, `${label} responseValue`);
        if (effect.input !== undefined) validateRuleExpression(effect.input, `${label} input`);
        break;
      case 'append-node':
      case 'append-node-if-missing':
        if (effect.boxId && typeof effect.boxId === 'object') validateRuleExpression(effect.boxId, `${label} boxId`);
        else requireNonBlankString(effect.boxId, `${label} boxId`);
        if (!effect.node || typeof effect.node !== 'object') throw new Error(`${label} node template is required.`);
        requireNonBlankString(effect.node.id, `${label} node id`);
        break;
      case 'insert-node':
        if (!effect.node || typeof effect.node !== 'object') throw new Error(`${label} node template is required.`);
        requireNonBlankString(effect.node.id, `${label} node id`);
        break;
      case 'append-text':
        if (effect.nodeId && typeof effect.nodeId === 'object') validateRuleExpression(effect.nodeId, `${label} nodeId`);
        else requireNonBlankString(effect.nodeId, `${label} nodeId`);
        if (effect.text && typeof effect.text === 'object') validateRuleExpression(effect.text, `${label} text`);
        else requireNonBlankString(effect.text, `${label} text`);
        break;
      default:
        throw new Error(`${label} has unsupported effect type "${String(effect?.type)}".`);
    }
  }

  function validateReactiveCondition(condition, label) {
    switch (condition?.type) {
      case 'state':
        requireNonBlankString(condition.query?.target?.documentId, `${label} state documentId`);
        requireNonBlankString(condition.query?.target?.nodeId, `${label} state nodeId`);
        requireNonBlankString(condition.query?.key, `${label} state key`);
        requireNonBlankString(condition.compare, `${label} compare`);
        break;
      case 'model':
        requireNonBlankString(condition.query?.target?.sparcDocumentId, `${label} model sparcDocumentId`);
        requireNonBlankString(condition.query?.target?.sparcNodeId, `${label} model sparcNodeId`);
        requireNonBlankString(condition.query?.metric, `${label} model metric`);
        requireNonBlankString(condition.compare, `${label} compare`);
        break;
      case 'all':
      case 'any':
        if (!Array.isArray(condition.conditions)) {
          throw new Error(`${label} ${condition.type} conditions must be an array.`);
        }
        condition.conditions.forEach((child, index) => validateReactiveCondition(child, `${label} ${condition.type}[${index}]`));
        break;
      case 'not':
        validateReactiveCondition(condition.condition, `${label} not`);
        break;
      default:
        throw new Error(`${label} has unsupported condition type "${String(condition?.type)}".`);
    }
  }

  function validateRulesBeforeSave(display, label) {
    const stimulusRegistryIds = stimulusRegistryIdsForDisplay(display);
    const nodesById = new Map(flattenNodes(display?.nodes || []).map((entry) => [entry.node.id, entry.node]));
    for (const [index, rule] of (display?.productionRules || []).entries()) {
      requireNonBlankString(rule.id, `${label} productionRules[${index}] id`);
      if (!Array.isArray(rule.when) || rule.when.length === 0) {
        throw new Error(`${label} productionRules[${index}] requires at least one when condition.`);
      }
      rule.when.forEach((condition, conditionIndex) => {
        if (condition?.type === 'not') {
          validateFactPattern(condition.pattern, `${label} productionRules[${index}].when[${conditionIndex}].not`);
        } else {
          validateFactPattern(condition, `${label} productionRules[${index}].when[${conditionIndex}]`);
        }
      });
      for (const [testIndex, test] of (rule.tests || []).entries()) {
        requireNonBlankString(test.op, `${label} productionRules[${index}].tests[${testIndex}] op`);
        validateRuleExpression(test.left, `${label} productionRules[${index}].tests[${testIndex}] left`);
        validateRuleExpression(test.right, `${label} productionRules[${index}].tests[${testIndex}] right`);
      }
      if (!Array.isArray(rule.then)) {
        throw new Error(`${label} productionRules[${index}].then must be an array.`);
      }
      rule.then.forEach((effect, effectIndex) => {
        validateProductionEffect(effect, `${label} productionRules[${index}].then[${effectIndex}]`);
        if (effect?.type !== 'model-practice') {
          return;
        }
        if (typeof effect.stimulusId === 'string' && effect.stimulusId.trim() && !stimulusRegistryIds.has(effect.stimulusId)) {
          throw new Error(`${label} productionRules[${index}].then[${effectIndex}] targets unknown stimulus "${effect.stimulusId}".`);
        }
        if (!effect.stimulusId && typeof effect.nodeId === 'string' && effect.nodeId.trim()) {
          const node = nodesById.get(effect.nodeId);
          if (!node) {
            throw new Error(`${label} productionRules[${index}].then[${effectIndex}] targets unknown node "${effect.nodeId}".`);
          }
          const ids = nodeStimulusIds(node);
          if (ids.length !== 1) {
            throw new Error(`${label} productionRules[${index}].then[${effectIndex}] node "${effect.nodeId}" must have exactly one stimulus attachment.`);
          }
        }
      });
    }

    for (const [index, rule] of (display?.reactiveRules || []).entries()) {
      requireNonBlankString(rule.id, `${label} reactiveRules[${index}] id`);
      if (rule.when) {
        validateReactiveCondition(rule.when, `${label} reactiveRules[${index}].when`);
      }
      if (!Array.isArray(rule.writes)) {
        throw new Error(`${label} reactiveRules[${index}].writes must be an array.`);
      }
      for (const [writeIndex, write] of rule.writes.entries()) {
        requireNonBlankString(write.target?.documentId, `${label} reactiveRules[${index}].writes[${writeIndex}] documentId`);
        requireNonBlankString(write.target?.nodeId, `${label} reactiveRules[${index}].writes[${writeIndex}] nodeId`);
        requireNonBlankString(write.key, `${label} reactiveRules[${index}].writes[${writeIndex}] key`);
      }
    }
  }

  function inertNodeValue() {}
  function inertCommit() {}
  function inertButton() {}

  onMount(async () => {
    await tick();
    ensureHtmlEditor();
  });

  onDestroy(() => {
    htmlEditor?.destroy();
    htmlEditor = null;
  });
</script>

{#snippet ruleExpressionEditor(expression, label = 'Expression')}
  {#if expression}
    <div class="sparc-expression-editor">
      <div class="sparc-panel-header">
        <h4>{label}</h4>
        <select value={expression.type} on:change={(event) => updateRuleExpression(expression, 'type', event.currentTarget.value)}>
          {#each ruleExpressionTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
      {#if expression.type === 'literal'}
        <label>
          Literal Value
          <input value={stringifyLooseValue(expression.value)} on:input={(event) => updateRuleExpression(expression, 'value', event.currentTarget.value)} />
        </label>
      {:else if expression.type === 'variable'}
        <label>
          Variable Name
          <input value={expression.name || ''} on:input={(event) => updateRuleExpression(expression, 'name', event.currentTarget.value)} />
        </label>
      {:else if expression.type === 'function'}
        <label>
          Function
          <select value={expression.name} on:change={(event) => updateRuleExpression(expression, 'name', event.currentTarget.value)}>
            {#each functionNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
        <div class="sparc-panel-header">
          <h4>Arguments</h4>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addExpressionArg(expression)}>Add Argument</button>
        </div>
        {#each expression.args || [] as arg, argIndex}
          <div class="sparc-nested-rule-card">
            <div class="sparc-inline-actions">
              <strong>Argument {argIndex + 1}</strong>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeExpressionArg(expression, argIndex)}>Remove</button>
            </div>
            {@render ruleExpressionEditor(arg, `Argument ${argIndex + 1}`)}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet reactiveConditionEditor(condition, label = 'Condition')}
  {#if condition}
    <div class="sparc-condition-editor">
      <div class="sparc-panel-header">
        <h4>{label}</h4>
        <select value={condition.type} on:change={(event) => changeReactiveCondition(condition, event.currentTarget.value)}>
          {#each reactiveConditionTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
      {#if condition.type === 'state'}
        <div class="sparc-expression-grid">
          <label>
            Document
            <input value={condition.query?.target?.documentId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.documentId', event.currentTarget.value)} />
          </label>
          <label>
            Node
            <input value={condition.query?.target?.nodeId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.nodeId', event.currentTarget.value)} />
          </label>
        </div>
        <label>
          Key
          <input value={condition.query?.key || ''} on:input={(event) => updateReactiveCondition(condition, 'query.key', event.currentTarget.value)} />
        </label>
        <label>
          Compare
          <select value={condition.compare} on:change={(event) => updateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
            {#each reactiveComparisonOps as op}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </label>
        <label>
          Value
          <input value={stringifyLooseValue(condition.value)} on:input={(event) => updateReactiveCondition(condition, 'value', event.currentTarget.value)} />
        </label>
      {:else if condition.type === 'model'}
        <div class="sparc-expression-grid">
          <label>
            SPARC Document ID
            <input value={condition.query?.target?.sparcDocumentId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.sparcDocumentId', event.currentTarget.value)} />
          </label>
          <label>
            SPARC Node ID
            <input value={condition.query?.target?.sparcNodeId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.sparcNodeId', event.currentTarget.value)} />
          </label>
          <label>
            Stimuli Set ID
            <input value={condition.query?.target?.stimuliSetId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.stimuliSetId', event.currentTarget.value)} />
          </label>
          <label>
            Stimulus KC
            <input value={condition.query?.target?.stimulusKC || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.stimulusKC', event.currentTarget.value)} />
          </label>
          <label>
            Cluster KC
            <input value={condition.query?.target?.clusterKC || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.clusterKC', event.currentTarget.value)} />
          </label>
          <label>
            KC ID
            <input value={condition.query?.target?.KCId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCId', event.currentTarget.value)} />
          </label>
          <label>
            KC Default
            <input value={condition.query?.target?.KCDefault || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCDefault', event.currentTarget.value)} />
          </label>
          <label>
            KC Cluster
            <input value={condition.query?.target?.KCCluster || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCCluster', event.currentTarget.value)} />
          </label>
        </div>
        <label>
          Metric
          <select value={condition.query?.metric || 'probability'} on:change={(event) => updateReactiveCondition(condition, 'query.metric', event.currentTarget.value)}>
            <option value="probability">probability</option>
            <option value="priorCorrect">priorCorrect</option>
            <option value="priorIncorrect">priorIncorrect</option>
            <option value="priorStudy">priorStudy</option>
            <option value="totalPracticeDuration">totalPracticeDuration</option>
            <option value="lastOutcome">lastOutcome</option>
          </select>
        </label>
        <label>
          Compare
          <select value={condition.compare} on:change={(event) => updateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
            {#each reactiveComparisonOps as op}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </label>
        <label>
          Value
          <input value={stringifyLooseValue(condition.value)} on:input={(event) => updateReactiveCondition(condition, 'value', event.currentTarget.value)} />
        </label>
      {:else if condition.type === 'all' || condition.type === 'any'}
        <div class="sparc-panel-header">
          <h4>{condition.type === 'all' ? 'All Conditions' : 'Any Conditions'}</h4>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addReactiveConditionChild(condition)}>Add Child</button>
        </div>
        {#each condition.conditions || [] as child, childIndex}
          <div class="sparc-nested-rule-card">
            <div class="sparc-inline-actions">
              <strong>Child {childIndex + 1}</strong>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveConditionChild(condition, childIndex)}>Remove</button>
            </div>
            {@render reactiveConditionEditor(child, `Child ${childIndex + 1}`)}
          </div>
        {/each}
      {:else if condition.type === 'not'}
        <div class="sparc-nested-rule-card">
          {@render reactiveConditionEditor(ensureNegatedReactiveCondition(condition), 'Negated Condition')}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="sparc-editor-shell">
  <header class="sparc-editor-header">
    <div>
      <h1>SPARC Editor</h1>
      <div class="sparc-editor-subtitle">{initialTdf?.content?.tdfs?.tutor?.setspec?.lessonname || tdfId}</div>
      {#if selectedStimFile}
        <div class="sparc-editor-subtitle">{selectedStimFile}</div>
      {/if}
    </div>
    <div class="sparc-editor-actions">
      {#if saveMessage}<span class="sparc-save-message">{saveMessage}</span>{/if}
      <button type="button" class="btn btn-secondary" on:click={onCancel}>Cancel</button>
      <button type="button" class="btn btn-primary" on:click={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save SPARC Content'}
      </button>
    </div>
  </header>

  {#if errorText}
    <div class="alert alert-danger">{errorText}</div>
  {/if}

  {#if sparcTargets.length > 1}
    <div class="sparc-target-row">
      <label for="sparc-target-select">SPARC display</label>
      <select id="sparc-target-select" bind:value={activeTargetKey}>
        {#each sparcTargets as target}
          <option value={target.key}>{target.label}</option>
        {/each}
      </select>
    </div>
  {/if}

  <div class="sparc-editor-tabs" role="tablist" aria-label="SPARC editor sections">
    <button type="button" class:active={activeEditorTab === 'nodes'} on:click={() => activeEditorTab = 'nodes'}>Nodes</button>
    <button type="button" class:active={activeEditorTab === 'model'} on:click={() => activeEditorTab = 'model'}>Stimuli</button>
    <button type="button" class:active={activeEditorTab === 'preview'} on:click={() => activeEditorTab = 'preview'}>Preview</button>
    <button type="button" class:active={activeEditorTab === 'production'} on:click={() => activeEditorTab = 'production'}>Production Rules</button>
    <button type="button" class:active={activeEditorTab === 'reactive'} on:click={() => activeEditorTab = 'reactive'}>Reactive Rules</button>
  </div>

  {#if activeEditorTab === 'nodes'}
  <div class="sparc-editor-grid">
    <aside class="sparc-palette" aria-label="SPARC node palette">
      <h2>Palette</h2>
      {#each paletteEntries as entry}
        <button type="button" class="sparc-palette-item" on:click={() => addNode(entry)}>
          <span>{entry.label}</span>
          <small>{entry.category}</small>
        </button>
      {/each}
    </aside>

    <main class="sparc-canvas">
      <div class="sparc-panel-header">
        <h2>Canvas</h2>
        <button type="button" class="btn btn-outline-danger btn-sm" on:click={removeActiveNode} disabled={!activeNode}>
          Delete Selected
        </button>
      </div>
      <div class="sparc-node-list">
        {#each flatNodes as entry}
          <button
            type="button"
            class:selected={entry.node.id === activeNodeId}
            class="sparc-node-row"
            style={`padding-left: ${12 + (entry.depth || 0) * 18}px`}
            on:click={() => activeNodeId = entry.node.id}
          >
            <span>{entry.node.id}</span>
            <small>{entry.node.nodeType === 'group' ? entry.node.groupType : entry.node.atomType}</small>
          </button>
        {/each}
      </div>
    </main>

    <section class="sparc-inspector">
      <h2>Inspector</h2>
      {#if activeNode}
        <label>
          ID
          <input value={activeNode.id || ''} on:input={(event) => updateField('id', event.currentTarget.value)} />
        </label>
        {#if activeNode.nodeType === 'group'}
          <label>
            Group Type
            <input value={activeNode.groupType || ''} on:input={(event) => updateField('groupType', event.currentTarget.value)} />
          </label>
          <label>
            Label
            <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
          </label>
        {:else}
          <label>
            Atom Type
            <input value={activeNode.atomType || ''} readonly />
          </label>
          {#if activeNode.atomType === 'html-block' || activeNode.atomType === 'message-box'}
            <div class="sparc-rich-text-editor" bind:this={htmlEditorElement}></div>
          {:else if activeNode.atomType === 'dropdown'}
            <label>
              Selected
              <input value={activeNode.selected || ''} on:input={(event) => updateField('selected', event.currentTarget.value)} />
            </label>
            <label>
              Options
              <textarea rows="6" value={(activeNode.options || []).join('\n')} on:input={(event) => updateOptions(event.currentTarget.value)}></textarea>
            </label>
          {:else if activeNode.atomType === 'button'}
            <label>
              Label
              <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
            </label>
            <label>
              Value
              <input value={activeNode.value || ''} on:input={(event) => updateField('value', event.currentTarget.value)} />
            </label>
          {:else if activeNode.atomType === 'learning-progress'}
            <label>
              Label
              <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
            </label>
          {:else if activeNode.atomType === 'panel-selector'}
            <label>
              Label
              <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
            </label>
            <label>
              Selected Panel ID
              <input value={activeNode.selectedPanelId || ''} on:input={(event) => updateField('selectedPanelId', event.currentTarget.value)} />
            </label>
          {:else}
            <label>
              Value
              <textarea rows="5" value={activeNode.value || ''} on:input={(event) => updateField('value', event.currentTarget.value)}></textarea>
            </label>
          {/if}
        {/if}
        {#if stimulusRegistry.length > 0}
          <div class="sparc-rule-section">
            <div class="sparc-panel-header">
              <h3>Stimulus Attachments</h3>
            </div>
            {#each stimulusRegistry as stimulus}
              <label class="sparc-checkbox-row">
                <input
                  type="checkbox"
                  checked={nodeStimulusIds(activeNode).includes(stimulus.stimulusId)}
                  on:change={(event) => toggleNodeStimulus(stimulus.stimulusId, event.currentTarget.checked)}
                />
                <span>{stimulus.label || stimulus.stimulusId}</span>
              </label>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="sparc-muted">Select a node or add one from the palette.</p>
      {/if}
    </section>
  </div>
  {:else if activeEditorTab === 'model'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Stimulus Registry</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addStimulusRegistryEntry}>Add Stimulus</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each stimulusRegistry as stimulus, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeStimulusIndex}
              on:click={() => activeStimulusIndex = index}
            >
              <span>{stimulus.label || stimulus.stimulusId || `Stimulus ${index + 1}`}</span>
              <small>{stimulus.stimulusKC || 'missing stimulusKC'}</small>
            </button>
          {/each}
          {#if stimulusRegistry.length === 0}
            <p class="sparc-muted">No model stimuli are defined for this SPARC display.</p>
          {/if}
        </div>
        <div class="sparc-rule-detail">
          {#if activeStimulus}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeStimulusRegistryEntry(activeStimulusIndex)}>Delete Stimulus</button>
            </div>
            <div class="sparc-expression-grid">
              <label>
                Stimulus ID
                <input value={activeStimulus.stimulusId || ''} on:input={(event) => updateStimulusField('stimulusId', event.currentTarget.value)} />
              </label>
              <label>
                Label
                <input value={activeStimulus.label || ''} on:input={(event) => updateStimulusField('label', event.currentTarget.value)} />
              </label>
              <label>
                Stimuli Set ID
                <input value={stringifyLooseValue(activeStimulus.stimuliSetId)} on:input={(event) => updateStimulusField('stimuliSetId', event.currentTarget.value)} />
              </label>
              <label>
                Stimulus KC
                <input value={stringifyLooseValue(activeStimulus.stimulusKC)} on:input={(event) => updateStimulusField('stimulusKC', event.currentTarget.value)} />
              </label>
              <label>
                Cluster KC
                <input value={stringifyLooseValue(activeStimulus.clusterKC)} on:input={(event) => updateStimulusField('clusterKC', event.currentTarget.value)} />
              </label>
              <label>
                KC ID
                <input value={stringifyLooseValue(activeStimulus.KCId)} on:input={(event) => updateStimulusField('KCId', event.currentTarget.value)} />
              </label>
              <label>
                KC Default
                <input value={stringifyLooseValue(activeStimulus.KCDefault)} on:input={(event) => updateStimulusField('KCDefault', event.currentTarget.value)} />
              </label>
              <label>
                KC Cluster
                <input value={stringifyLooseValue(activeStimulus.KCCluster)} on:input={(event) => updateStimulusField('KCCluster', event.currentTarget.value)} />
              </label>
              <label>
                Response KC
                <input value={stringifyLooseValue(activeStimulus.response?.responseKC || '')} on:input={(event) => updateStimulusResponseField('responseKC', event.currentTarget.value)} />
              </label>
              <label>
                Response Key
                <input value={activeStimulus.response?.responseKey || ''} on:input={(event) => updateStimulusResponseField('responseKey', event.currentTarget.value)} />
              </label>
            </div>
          {:else}
            <p class="sparc-muted">Add a stimulus before attaching nodes to model identities.</p>
          {/if}
        </div>
      </div>
    </section>
  {:else if activeEditorTab === 'preview'}
    <section class="sparc-preview">
      <h2>Renderer Preview</h2>
      <div class="sparc-preview-surface">
        {#each displayNodes as node}
          <SparcNode
            {node}
            nodeValues={{}}
            onNodeValueChange={inertNodeValue}
            onNodeCommit={inertCommit}
            onNodeFocus={inertCommit}
            onButtonActivate={inertButton}
          />
        {/each}
      </div>
    </section>
  {:else if activeEditorTab === 'production'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Production Rules</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addProductionRule}>Add Rule</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each productionRules as rule, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeProductionRuleIndex}
              on:click={() => activeProductionRuleIndex = index}
            >
              <span>{rule.id || `Rule ${index + 1}`}</span>
              <small>{rule.when?.length || 0} when / {rule.then?.length || 0} then</small>
            </button>
          {/each}
          {#if productionRules.length === 0}
            <p class="sparc-muted">No production rules on this SPARC display.</p>
          {/if}
        </div>

        <div class="sparc-rule-detail">
          {#if activeProductionRule}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveProductionRule(activeProductionRuleIndex, -1)} disabled={activeProductionRuleIndex === 0}>Move Up</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveProductionRule(activeProductionRuleIndex, 1)} disabled={activeProductionRuleIndex >= productionRules.length - 1}>Move Down</button>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionRule(activeProductionRuleIndex)}>Delete Rule</button>
            </div>
            <label>
              Rule ID
              <input value={activeProductionRule.id || ''} on:input={(event) => updateProductionRuleField('id', event.currentTarget.value)} />
            </label>
            <label>
              Module
              <input value={activeProductionRule.module || ''} on:input={(event) => updateProductionRuleField('module', event.currentTarget.value)} />
            </label>
            <label>
              Salience
              <input type="number" value={activeProductionRule.salience ?? ''} on:input={(event) => updateProductionRuleField('salience', event.currentTarget.value)} />
            </label>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>When</h3>
                <select on:change={(event) => addProductionCondition(event.currentTarget.value)}>
                  <option value="">Add condition...</option>
                  {#each productionConditionTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </div>
              {#each activeProductionRule.when || [] as condition, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={productionConditionKind(condition)} on:change={(event) => changeProductionConditionKind(index, event.currentTarget.value)}>
                      {#each productionConditionTypes as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionCondition(index)}>Remove</button>
                  </div>
                  <label>
                    Fact Type
                    <input value={productionConditionPattern(condition)?.factType || ''} on:input={(event) => updateProductionConditionFactType(condition, event.currentTarget.value)} />
                  </label>
                  <div class="sparc-panel-header">
                    <h4>Slots</h4>
                    <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addFactSlot(condition)}>Add Slot</button>
                  </div>
                  {#each Object.entries(productionConditionPattern(condition)?.slots || {}) as [slotKey, slot]}
                    <div class="sparc-slot-row">
                      <input value={slotKey} on:change={(event) => renameFactSlot(condition, slotKey, event.currentTarget.value)} aria-label="slot name" />
                      <select value={slot.type} on:change={(event) => updateFactSlotType(slot, event.currentTarget.value)} aria-label="slot pattern type">
                        <option value="literal">literal</option>
                        <option value="bind">bind</option>
                        <option value="bound">bound</option>
                      </select>
                      <input value={slot.type === 'literal' ? stringifyLooseValue(slot.value) : slot.variable || ''} on:input={(event) => updateFactSlotValue(slot, event.currentTarget.value)} aria-label="slot value" />
                      <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeFactSlot(condition, slotKey)}>Remove</button>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Tests</h3>
                <button type="button" class="btn btn-outline-secondary btn-sm" on:click={addProductionTest}>Add Test</button>
              </div>
              {#each activeProductionRule.tests || [] as test, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={test.op} on:change={(event) => updateProductionTestField(test, 'op', event.currentTarget.value)}>
                      {#each comparisonOps as op}
                        <option value={op}>{op}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionTest(index)}>Remove</button>
                  </div>
                  <div class="sparc-expression-grid">
                    <div>
                      {@render ruleExpressionEditor(test.left, 'Left Expression')}
                    </div>
                    <div>
                      {@render ruleExpressionEditor(test.right, 'Right Expression')}
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Then</h3>
                <select on:change={(event) => addProductionEffect(event.currentTarget.value)}>
                  <option value="">Add effect...</option>
                  {#each productionEffectTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </div>
              {#each activeProductionRule.then || [] as effect, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={effect.type} on:change={(event) => changeProductionEffectType(index, event.currentTarget.value)}>
                      {#each productionEffectTypes as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionEffect(index)}>Remove</button>
                  </div>
                  {#if effect.type === 'classify'}
                    <label>
                      Outcome
                      <select value={effect.outcome} on:change={(event) => updateEffectField(effect, 'outcome', event.currentTarget.value)}>
                        {#each classifyOutcomes as outcome}
                          <option value={outcome}>{outcome}</option>
                        {/each}
                      </select>
                    </label>
                  {:else if effect.type === 'message'}
                    <label>
                      Message Type
                      <select value={effect.messageType} on:change={(event) => updateEffectField(effect, 'messageType', event.currentTarget.value)}>
                        {#each messageTypes as type}
                          <option value={type}>{type}</option>
                        {/each}
                      </select>
                    </label>
                    <label>
                      Template
                      <textarea rows="3" value={effect.template || ''} on:input={(event) => updateEffectField(effect, 'template', event.currentTarget.value)}></textarea>
                    </label>
                    <div class="sparc-expression-grid">
                      <label>
                        Target Document
                        <input value={stringifyLooseValue(effect.target?.documentId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); updateAddressTemplate(effect.target, 'documentId', event.currentTarget.value); }} />
                      </label>
                      <label>
                        Target Node
                        <input value={stringifyLooseValue(effect.target?.nodeId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); updateAddressTemplate(effect.target, 'nodeId', event.currentTarget.value); }} />
                      </label>
                    </div>
                  {:else if effect.type === 'write-state'}
                    <div class="sparc-expression-grid">
                      <label>
                        Target Document
                        <input value={stringifyLooseValue(effect.write?.target?.documentId || '')} on:input={(event) => updateAddressTemplate(effect.write.target, 'documentId', event.currentTarget.value)} />
                      </label>
                      <label>
                        Target Node
                        <input value={stringifyLooseValue(effect.write?.target?.nodeId || '')} on:input={(event) => updateAddressTemplate(effect.write.target, 'nodeId', event.currentTarget.value)} />
                      </label>
                    </div>
                    <label>
                      Key
                      <input value={effect.write?.key || ''} on:input={(event) => updateEffectField(effect.write, 'key', event.currentTarget.value)} />
                    </label>
                    <label>
                      Value Expression
                      {@render ruleExpressionEditor(effect.write.value, 'Value Expression')}
                    </label>
                  {:else if effect.type === 'assert-fact'}
                    <label>
                      Fact Type
                      <input value={effect.fact?.factType || ''} on:input={(event) => { effect.fact = effect.fact || { slots: {} }; effect.fact.factType = event.currentTarget.value; markChanged(); }} />
                    </label>
                    <label>
                      Persist
                      <input type="checkbox" checked={effect.persist !== false} on:change={(event) => updateEffectBoolean(effect, 'persist', event.currentTarget.checked)} />
                    </label>
                    <div class="sparc-panel-header">
                      <h4>Fact Slots</h4>
                      <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addEffectFactSlot(effect)}>Add Slot</button>
                    </div>
                    {#each Object.entries(effect.fact?.slots || {}) as [slotKey, expression]}
                      <div class="sparc-slot-row">
                        <input value={slotKey} on:change={(event) => renameEffectFactSlot(effect, slotKey, event.currentTarget.value)} />
                        <div class="sparc-slot-expression">
                          {@render ruleExpressionEditor(expression, slotKey)}
                        </div>
                        <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeEffectFactSlot(effect, slotKey)}>Remove</button>
                      </div>
                    {/each}
                  {:else if effect.type === 'credit'}
                    <label>
                      KC
                      <input value={effect.kc || ''} on:input={(event) => updateEffectField(effect, 'kc', event.currentTarget.value)} />
                    </label>
                  {:else if effect.type === 'model-practice'}
                    <label>
                      Outcome
                      <select value={effect.outcome} on:change={(event) => updateEffectField(effect, 'outcome', event.currentTarget.value)}>
                        {#each classifyOutcomes.filter((outcome) => outcome !== 'buggy') as outcome}
                          <option value={outcome}>{outcome}</option>
                        {/each}
                      </select>
                    </label>
                    <div class="sparc-expression-grid">
                      <label>
                        Explicit Stimulus
                        <select value={typeof effect.stimulusId === 'string' ? effect.stimulusId : ''} on:change={(event) => updateOptionalEffectField(effect, 'stimulusId', event.currentTarget.value)}>
                          <option value="">Resolve from node attachment</option>
                          {#each stimulusRegistry as stimulus}
                            <option value={stimulus.stimulusId}>{stimulus.label || stimulus.stimulusId}</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        Node ID
                        <input value={stringifyLooseValue(effect.nodeId || '')} on:input={(event) => updateOptionalEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                      </label>
                    </div>
                    <div class="sparc-expression-grid">
                      <label>
                        Response Value
                        {@render ruleExpressionEditor(ensureEffectExpression(effect, 'responseValue', ''), 'Response Value')}
                      </label>
                      <label>
                        Input
                        {@render ruleExpressionEditor(ensureEffectExpression(effect, 'input', ''), 'Input')}
                      </label>
                    </div>
                  {:else if effect.type === 'append-text'}
                    <label>
                      Node ID
                      <input value={stringifyLooseValue(effect.nodeId)} on:input={(event) => updateEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                    <label>
                      Text
                      <input value={stringifyLooseValue(effect.text)} on:input={(event) => updateEffectField(effect, 'text', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                    <label>
                      Separator
                      <input value={stringifyLooseValue(effect.separator || '')} on:input={(event) => updateEffectField(effect, 'separator', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                  {:else}
                    <div class="sparc-expression-grid">
                      <label>
                        Box ID
                        <input value={stringifyLooseValue(effect.boxId || '')} on:input={(event) => updateEffectField(effect, 'boxId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                      </label>
                      {#if effect.type === 'append-node' || effect.type === 'append-node-if-missing'}
                        <label>
                          Frontier
                          <input value={stringifyLooseValue(effect.frontier || '')} on:input={(event) => updateEffectField(effect, 'frontier', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                      {/if}
                      {#if effect.type === 'append-node-if-missing' || effect.type === 'insert-node'}
                        <label>
                          Before Node ID
                          <input value={stringifyLooseValue(effect.beforeNodeId || '')} on:input={(event) => updateEffectField(effect, 'beforeNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                        <label>
                          After Node ID
                          <input value={stringifyLooseValue(effect.afterNodeId || '')} on:input={(event) => updateEffectField(effect, 'afterNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                      {/if}
                    </div>
                    <div class="sparc-expression-grid">
                      <label>
                        Node ID
                        <input value={effect.node?.id || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'id', event.currentTarget.value)} />
                      </label>
                      <label>
                        Node Type
                        <select value={effect.node?.nodeType || 'atomic'} on:change={(event) => updateProgressiveNodeTemplate(effect, 'nodeType', event.currentTarget.value)}>
                          <option value="atomic">atomic</option>
                          <option value="group">group</option>
                        </select>
                      </label>
                      {#if effect.node?.nodeType === 'group'}
                        <label>
                          Group Type
                          <input value={effect.node?.groupType || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'groupType', event.currentTarget.value)} />
                        </label>
                      {:else}
                        <label>
                          Atom Type
                          <input value={effect.node?.atomType || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'atomType', event.currentTarget.value)} />
                        </label>
                        <label>
                          Value
                          <input value={stringifyLooseValue(effect.node?.value)} on:input={(event) => updateProgressiveNodeTemplate(effect, 'value', event.currentTarget.value)} />
                        </label>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="sparc-muted">Add a production rule to edit rule conditions and effects.</p>
          {/if}
        </div>
      </div>
    </section>
  {:else if activeEditorTab === 'reactive'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Reactive Rules</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addReactiveRule}>Add Rule</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each reactiveRules as rule, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeReactiveRuleIndex}
              on:click={() => activeReactiveRuleIndex = index}
            >
              <span>{rule.id || `Rule ${index + 1}`}</span>
              <small>{rule.when?.type || 'always'} / {rule.writes?.length || 0} writes</small>
            </button>
          {/each}
          {#if reactiveRules.length === 0}
            <p class="sparc-muted">No reactive rules on this SPARC display.</p>
          {/if}
        </div>
        <div class="sparc-rule-detail">
          {#if activeReactiveRule}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveReactiveRule(activeReactiveRuleIndex, -1)} disabled={activeReactiveRuleIndex === 0}>Move Up</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveReactiveRule(activeReactiveRuleIndex, 1)} disabled={activeReactiveRuleIndex >= reactiveRules.length - 1}>Move Down</button>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveRule(activeReactiveRuleIndex)}>Delete Rule</button>
            </div>
            <label>
              Rule ID
              <input value={activeReactiveRule.id || ''} on:input={(event) => updateReactiveRuleField('id', event.currentTarget.value)} />
            </label>
            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>When</h3>
                {#if !activeReactiveRule.when}
                  <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => setReactiveCondition('state')}>Add Condition</button>
                {/if}
              </div>
              {#if activeReactiveRule.when}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => { delete activeReactiveRule.when; markChanged(); }}>Remove Condition</button>
                  </div>
                  {@render reactiveConditionEditor(activeReactiveRule.when, 'When')}
                </div>
              {/if}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Writes</h3>
                <button type="button" class="btn btn-outline-secondary btn-sm" on:click={addReactiveWrite}>Add Write</button>
              </div>
              {#each activeReactiveRule.writes || [] as write, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <strong>Write {index + 1}</strong>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveWrite(index)}>Remove</button>
                  </div>
                  <div class="sparc-expression-grid">
                    <label>
                      Target Document
                      <input value={write.target?.documentId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.documentId = event.currentTarget.value; markChanged(); }} />
                    </label>
                    <label>
                      Target Node
                      <input value={write.target?.nodeId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.nodeId = event.currentTarget.value; markChanged(); }} />
                    </label>
                  </div>
                  <label>
                    Key
                    <input value={write.key || ''} on:input={(event) => updateStateWrite(write, 'key', event.currentTarget.value)} />
                  </label>
                  <label>
                    Value
                    <input value={stringifyLooseValue(write.value)} on:input={(event) => updateStateWrite(write, 'value', event.currentTarget.value)} />
                  </label>
                </div>
              {/each}
            </div>
          {:else}
            <p class="sparc-muted">Add a reactive rule to edit state/model conditions and writes.</p>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .sparc-editor-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--app-text-color);
  }

  .sparc-editor-header,
  .sparc-panel-header,
  .sparc-editor-actions,
  .sparc-target-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sparc-editor-header {
    justify-content: space-between;
    padding: 12px 0;
  }

  .sparc-editor-header h1,
  .sparc-palette h2,
  .sparc-canvas h2,
  .sparc-inspector h2,
  .sparc-preview h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .sparc-editor-subtitle,
  .sparc-muted,
  .sparc-palette-item small,
  .sparc-node-row small {
    color: var(--app-secondary-text-color);
  }

  .sparc-editor-grid {
    display: grid;
    grid-template-columns: minmax(170px, 220px) minmax(220px, 1fr) minmax(250px, 340px);
    grid-template-rows: auto minmax(280px, 1fr);
    gap: 12px;
  }

  .sparc-editor-tabs,
  .sparc-inline-actions,
  .sparc-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sparc-editor-tabs button {
    border: 1px solid var(--border-color);
    background: var(--app-subtle-surface-color);
    color: var(--app-text-color);
    border-radius: 4px;
    padding: 7px 10px;
  }

  .sparc-editor-tabs button.active {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-palette,
  .sparc-canvas,
  .sparc-inspector,
  .sparc-preview,
  .sparc-rule-editor {
    border: 1px solid var(--border-color);
    background: var(--app-surface-color);
    border-radius: 6px;
    padding: 10px;
    min-width: 0;
  }

  .sparc-preview {
    grid-column: 1 / -1;
  }

  .sparc-palette,
  .sparc-node-list,
  .sparc-inspector,
  .sparc-rule-list,
  .sparc-rule-detail,
  .sparc-rule-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sparc-palette-item,
  .sparc-node-row,
  .sparc-rule-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--app-subtle-surface-color);
    color: var(--app-text-color);
    border-radius: 4px;
    padding: 8px;
    text-align: left;
  }

  .sparc-node-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-rule-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-inspector label,
  .sparc-rule-detail label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
  }

  .sparc-inspector input,
  .sparc-inspector textarea,
  .sparc-target-row select,
  .sparc-rule-editor input,
  .sparc-rule-editor textarea,
  .sparc-rule-editor select {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--input-background-color, var(--app-surface-color));
    color: var(--app-text-color);
    border-radius: 4px;
    padding: 6px 8px;
  }

  .sparc-checkbox-row input {
    width: auto;
  }

  .sparc-rule-layout {
    display: grid;
    grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
    gap: 12px;
    margin-top: 10px;
  }

  .sparc-rule-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--border-color);
    background: var(--app-subtle-surface-color);
    border-radius: 4px;
    padding: 10px;
  }

  .sparc-rule-section {
    margin-top: 8px;
  }

  .sparc-rule-section h3,
  .sparc-rule-card h4 {
    margin: 0;
    font-size: 0.95rem;
  }

  .sparc-expression-grid,
  .sparc-slot-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .sparc-slot-row {
    grid-template-columns: minmax(90px, 1fr) minmax(95px, 120px) minmax(110px, 1.4fr) auto;
    align-items: center;
  }

  .sparc-rich-text-editor {
    min-height: 150px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px;
    background: var(--app-subtle-surface-color);
  }

  .sparc-rich-text-editor :global(.ProseMirror) {
    min-height: 130px;
    outline: none;
  }

  .sparc-preview-surface {
    min-height: 220px;
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--app-subtle-surface-color);
    border-radius: 4px;
    padding: 12px;
  }

  .sparc-save-message {
    color: var(--feedback-success-color, var(--app-success-color));
  }

  @media (max-width: 1000px) {
    .sparc-editor-grid {
      grid-template-columns: 1fr;
    }

    .sparc-preview {
      grid-column: auto;
    }

    .sparc-rule-layout,
    .sparc-expression-grid,
    .sparc-slot-row {
      grid-template-columns: 1fr;
    }

    .sparc-editor-header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
