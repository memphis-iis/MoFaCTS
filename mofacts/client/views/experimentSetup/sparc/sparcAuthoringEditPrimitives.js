import {
  variableExpression,
} from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel.ts';

export function parseLooseValue(value) {
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

export function stringifyLooseValue(value) {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value);
}

export function replaceObjectContents(target, nextValue) {
  if (!target || !nextValue || typeof nextValue !== 'object') return;
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, nextValue);
}

export function ensureTarget(target) {
  target.pageKey = target.pageKey || '';
  target.nodeId = target.nodeId || '';
  return target;
}

export function updateAddressTemplateValue(target, fieldName, value) {
  if (!target) return;
  target[fieldName] = value.startsWith?.('?') ? variableExpression(value.slice(1)) : value;
}
