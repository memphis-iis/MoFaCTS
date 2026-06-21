export function selectedNodeBehaviorKeys(display, nodeId) {
  const keys = new Set();
  if (nodeId) {
    keys.add(nodeId);
    keys.add(`node:${nodeId}`);
  }
  const behaviorRefs = display?.behaviorRefs;
  if (behaviorRefs && typeof behaviorRefs === 'object') {
    for (const [refName, refNodeId] of Object.entries(behaviorRefs)) {
      if (refNodeId === nodeId) {
        keys.add(refName);
      }
    }
  }
  const behavior = display?.behavior;
  for (const step of behavior?.steps || []) {
    for (const response of step?.responses || []) {
      if (response?.nodeRef === nodeId && response.selection) {
        keys.add(response.selection);
      }
    }
  }
  for (const path of behavior?.paths || []) {
    for (const response of path?.responses || []) {
      if (response?.nodeRef === nodeId && response.selection) {
        keys.add(response.selection);
      }
    }
  }
  return keys;
}

export function valueContainsBehaviorKey(value, keys) {
  if (!keys?.size) {
    return false;
  }
  if (typeof value === 'string' && keys.has(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => valueContainsBehaviorKey(entry, keys));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => valueContainsBehaviorKey(entry, keys));
  }
  return false;
}

export function productionRuleReferencesNode(display, rule, nodeId) {
  if (!rule || !nodeId) {
    return false;
  }
  return valueContainsBehaviorKey(rule, selectedNodeBehaviorKeys(display, nodeId));
}

export function scopedConditionForNode(nodeId) {
  return {
    factType: 'interface-event',
    slots: {
      selection: { type: 'literal', value: nodeId },
      action: { type: 'bind', variable: 'action' },
      input: { type: 'bind', variable: 'value' },
    },
  };
}

export function ruleTypeFromCatalogEntry(entryId) {
  if (entryId === 'rule.condition.fact-pattern') return 'condition:fact-pattern';
  if (entryId === 'rule.condition.not-fact-pattern') return 'condition:not-fact-pattern';
  if (entryId === 'rule.test.comparison') return 'test:comparison';
  if (entryId === 'rule.effect.assert-fact') return 'effect:assert-fact';
  if (entryId === 'rule.effect.write-state') return 'effect:write-state';
  if (entryId === 'rule.effect.message') return 'effect:message';
  if (entryId === 'rule.effect.classify') return 'effect:classify';
  if (entryId === 'rule.effect.credit') return 'effect:credit';
  if (entryId === 'rule.effect.model-practice') return 'effect:model-practice';
  if (entryId === 'rule.effect.progressive-node-operation') return 'effect:append-node';
  return 'effect:classify';
}
