import {
  defaultProductionCondition,
  defaultProductionEffect,
  defaultProductionRule,
  defaultProductionTest,
  literalExpression,
} from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel.ts';
import {
  parseLooseValue,
  replaceObjectContents,
  updateAddressTemplateValue,
} from './sparcAuthoringEditPrimitives';
import {
  ruleTypeFromCatalogEntry,
  scopedConditionForNode,
} from './sparcAuthoringRuleModel';

export function createScopedProductionRule({ rules, nodeId, entryId }) {
  const rule = defaultProductionRule(rules.length);
  rule.id = `${nodeId}.${entryId.replace(/^rule\./, '').replace(/\./g, '-')}.${rules.length + 1}`;
  rule.module = nodeId;
  rule.when = [scopedConditionForNode(nodeId)];
  const ruleType = ruleTypeFromCatalogEntry(entryId);
  if (ruleType.startsWith('condition:')) {
    rule.when.push(defaultProductionCondition(ruleType.slice('condition:'.length)));
    rule.then = [defaultProductionEffect('classify')];
  } else if (ruleType === 'test:comparison') {
    rule.tests = [defaultProductionTest()];
    rule.then = [defaultProductionEffect('classify')];
  } else if (ruleType.startsWith('effect:')) {
    rule.then = [defaultProductionEffect(ruleType.slice('effect:'.length))];
  }
  rules.push(rule);
  return rules.length - 1;
}

export function addProductionRule(rules) {
  rules.push(defaultProductionRule(rules.length));
  return rules.length - 1;
}

export function removeProductionRule(rules, index) {
  rules.splice(index, 1);
  return Math.max(0, Math.min(index, rules.length - 1));
}

export function moveRule(rules, index, delta) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= rules.length) return index;
  const [rule] = rules.splice(index, 1);
  rules.splice(nextIndex, 0, rule);
  return nextIndex;
}

export function addProductionCondition(rule, kind = 'fact-pattern') {
  if (!rule) return false;
  rule.when = Array.isArray(rule.when) ? rule.when : [];
  rule.when.push(defaultProductionCondition(kind));
  return true;
}

export function removeProductionCondition(rule, index) {
  if (!rule?.when) return false;
  rule.when.splice(index, 1);
  return true;
}

export function changeProductionConditionKind(rule, index, kind) {
  if (!rule?.when) return false;
  rule.when[index] = defaultProductionCondition(kind);
  return true;
}

export function addProductionTest(rule) {
  if (!rule) return false;
  rule.tests = Array.isArray(rule.tests) ? rule.tests : [];
  rule.tests.push(defaultProductionTest());
  return true;
}

export function removeProductionTest(rule, index) {
  if (!rule?.tests) return false;
  rule.tests.splice(index, 1);
  return true;
}

export function updateProductionTestField(test, fieldName, value) {
  if (!test) return false;
  test[fieldName] = value;
  return true;
}

export function addProductionEffect(rule, type = 'classify') {
  if (!rule) return false;
  rule.then = Array.isArray(rule.then) ? rule.then : [];
  rule.then.push(defaultProductionEffect(type));
  return true;
}

export function removeProductionEffect(rule, index) {
  if (!rule?.then) return false;
  rule.then.splice(index, 1);
  return true;
}

export function changeProductionEffectType(rule, index, type) {
  if (!rule?.then) return false;
  rule.then[index] = defaultProductionEffect(type);
  return true;
}

export function updateScopedProductionRuleJson(rule, value) {
  if (!rule) return { changed: false, error: '' };
  try {
    const nextRule = JSON.parse(value);
    if (!nextRule || typeof nextRule !== 'object' || Array.isArray(nextRule)) {
      throw new Error('Production rule JSON must be an object.');
    }
    if (!Array.isArray(nextRule.when)) {
      throw new Error('Production rule JSON must include a when array.');
    }
    if (!Array.isArray(nextRule.then)) {
      throw new Error('Production rule JSON must include a then array.');
    }
    replaceObjectContents(rule, nextRule);
    return { changed: true, error: '' };
  } catch (error) {
    return { changed: false, error: error.message || String(error) };
  }
}

export function addCatalogPartToProductionRule(rule, entryId) {
  if (!rule) return false;
  const ruleType = ruleTypeFromCatalogEntry(entryId);
  if (ruleType.startsWith('condition:')) {
    rule.when = Array.isArray(rule.when) ? rule.when : [];
    rule.when.push(defaultProductionCondition(ruleType.slice('condition:'.length)));
    return true;
  }
  if (ruleType === 'test:comparison') {
    rule.tests = Array.isArray(rule.tests) ? rule.tests : [];
    rule.tests.push(defaultProductionTest());
    return true;
  }
  if (ruleType.startsWith('effect:')) {
    rule.then = Array.isArray(rule.then) ? rule.then : [];
    rule.then.push(defaultProductionEffect(ruleType.slice('effect:'.length)));
    return true;
  }
  return false;
}

export function productionConditionKind(condition) {
  if (condition?.type === 'not') return 'not-fact-pattern';
  if (condition?.type === 'any') return 'any';
  return 'fact-pattern';
}

export function productionConditionPattern(condition) {
  if (condition?.type === 'any') return null;
  return condition?.type === 'not' ? condition.pattern : condition;
}

export function updateProductionConditionFactType(condition, value) {
  const pattern = productionConditionPattern(condition);
  if (!pattern) return false;
  pattern.factType = value;
  return true;
}

export function addFactSlot(condition) {
  const pattern = productionConditionPattern(condition);
  if (!pattern) return false;
  pattern.slots = pattern.slots && typeof pattern.slots === 'object' ? pattern.slots : {};
  let index = Object.keys(pattern.slots).length + 1;
  let key = `slot${index}`;
  while (Object.prototype.hasOwnProperty.call(pattern.slots, key)) {
    index += 1;
    key = `slot${index}`;
  }
  pattern.slots[key] = { type: 'literal', value: '' };
  return true;
}

export function removeFactSlot(condition, key) {
  const pattern = productionConditionPattern(condition);
  if (!pattern?.slots) return false;
  delete pattern.slots[key];
  return true;
}

export function renameFactSlot(condition, oldKey, newKey) {
  const pattern = productionConditionPattern(condition);
  const normalized = String(newKey || '').trim();
  if (!pattern?.slots || !normalized || normalized === oldKey) return false;
  pattern.slots[normalized] = pattern.slots[oldKey];
  delete pattern.slots[oldKey];
  return true;
}

export function updateFactSlotType(slot, type) {
  if (!slot) return false;
  if (type === 'literal') {
    slot.type = 'literal';
    slot.value = '';
    delete slot.variable;
    delete slot.min;
    delete slot.max;
    delete slot.minInclusive;
    delete slot.maxInclusive;
  } else if (type === 'range') {
    slot.type = 'range';
    slot.min = literalExpression(0);
    slot.max = literalExpression(1);
    delete slot.value;
    delete slot.variable;
  } else {
    slot.type = type;
    slot.variable = slot.variable || 'value';
    delete slot.value;
    delete slot.min;
    delete slot.max;
    delete slot.minInclusive;
    delete slot.maxInclusive;
  }
  return true;
}

export function updateFactSlotValue(slot, value) {
  if (!slot) return false;
  if (slot.type === 'literal') {
    slot.value = parseLooseValue(value);
  } else {
    slot.variable = value;
  }
  return true;
}

export function updateRuleExpression(expression, fieldName, value) {
  if (!expression) return false;
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
  return true;
}

export function addExpressionArg(expression) {
  if (!expression || expression.type !== 'function') return false;
  expression.args = Array.isArray(expression.args) ? expression.args : [];
  expression.args.push(literalExpression(0));
  return true;
}

export function removeExpressionArg(expression, index) {
  if (!expression?.args) return false;
  expression.args.splice(index, 1);
  return true;
}

export function updateEffectField(effect, fieldName, value) {
  if (!effect) return false;
  effect[fieldName] = value;
  return true;
}

export function updateOptionalEffectField(effect, fieldName, value) {
  if (!effect) return false;
  if (value === undefined || value === '') {
    delete effect[fieldName];
  } else if (fieldName === 'clusterIndex') {
    effect[fieldName] = Number(value);
  } else {
    effect[fieldName] = value;
  }
  return true;
}

export function ensureEffectExpression(effect, fieldName, defaultValue = '') {
  if (!effect[fieldName]) {
    effect[fieldName] = literalExpression(defaultValue);
  }
  return effect[fieldName];
}

export function updateEffectBoolean(effect, fieldName, checked) {
  if (!effect) return false;
  effect[fieldName] = checked;
  return true;
}

export function ensureEffectFactSlots(effect) {
  effect.fact = effect.fact && typeof effect.fact === 'object' ? effect.fact : { factType: 'model', slots: {} };
  effect.fact.slots = effect.fact.slots && typeof effect.fact.slots === 'object' ? effect.fact.slots : {};
  return effect.fact.slots;
}

export function addEffectFactSlot(effect) {
  const slots = ensureEffectFactSlots(effect);
  let index = Object.keys(slots).length + 1;
  let key = `slot${index}`;
  while (Object.prototype.hasOwnProperty.call(slots, key)) {
    index += 1;
    key = `slot${index}`;
  }
  slots[key] = literalExpression('');
  return true;
}

export function removeEffectFactSlot(effect, key) {
  const slots = ensureEffectFactSlots(effect);
  delete slots[key];
  return true;
}

export function renameEffectFactSlot(effect, oldKey, newKey) {
  const slots = ensureEffectFactSlots(effect);
  const normalized = String(newKey || '').trim();
  if (!normalized || normalized === oldKey) return false;
  slots[normalized] = slots[oldKey];
  delete slots[oldKey];
  return true;
}

export function updateAddressTemplate(target, fieldName, value) {
  if (!target) return false;
  updateAddressTemplateValue(target, fieldName, value);
  return true;
}

export function updateStateWrite(write, fieldName, value) {
  if (!write) return false;
  if (fieldName === 'value') {
    write.value = parseLooseValue(value);
  } else {
    write[fieldName] = value;
  }
  return true;
}

export function updateProgressiveNodeTemplate(effect, fieldName, value) {
  if (!effect) return false;
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
  return true;
}
