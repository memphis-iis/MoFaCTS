import {
  normalizeSparcRichHtml,
  validateSparcRichHtml,
} from '../../experiment/svelte/services/sparcRichHtml.ts';
import {
  flattenNodes,
  nodeStimulusIds,
  stimulusRegistryIdsForDisplay,
} from './sparcAuthoringTargets';

export function validateSparcDisplaysBeforeSave({ sparcTargets, clusters }) {
  for (const target of sparcTargets) {
    const display = clusters[target.clusterIndex]?.stims?.[target.stimIndex]?.display;
    removeDeprecatedGroupLabels(display?.nodes || []);
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
      if (node.atomType === 'html-block' || node.atomType === 'message-box') {
        node.value = normalizeSparcRichHtml(node.value || '');
        const richHtmlIssues = validateSparcRichHtml(node.value, `${target.label} node "${node.id}"`);
        if (richHtmlIssues.length > 0) {
          throw new Error(richHtmlIssues.join('; '));
        }
      }
    }
    validateStimulusRegistryBeforeSave(display, target.label);
    validateRulesBeforeSave(display, target.label);
  }
}

function removeDeprecatedGroupLabels(nodes, parentGroupType = '') {
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.nodeType === 'group') {
      if (parentGroupType !== 'choice-tabs') {
        delete node.label;
      }
      removeDeprecatedGroupLabels(node.children || [], node.groupType || '');
    }
    if (node.atomType === 'panel-selector') {
      for (const panel of node.panels || []) {
        removeDeprecatedGroupLabels(panel.children || [], '');
      }
    }
  }
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
