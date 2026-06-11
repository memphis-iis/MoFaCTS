import type {
  SparcCondition,
  SparcConditionComparison,
} from './sparcSessionContracts';
import type { SparcReplayState } from './sparcStateReplay';
import { createSparcStateCellKey } from './sparcStateReplay';
import {
  evaluateSparcModelQuery,
  type SparcModelQueryCapability,
} from './sparcModelQueries';

export type SparcConditionEvaluationContext = {
  readonly replayState: SparcReplayState;
  readonly modelQueries?: SparcModelQueryCapability;
};

function compareNumbers(
  actual: unknown,
  expected: unknown,
  compare: Extract<SparcConditionComparison, 'gt' | 'gte' | 'lt' | 'lte'>,
): boolean {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
    throw new Error(`SPARC condition "${compare}" comparison requires finite numeric values`);
  }
  switch (compare) {
    case 'gt':
      return actualNumber > expectedNumber;
    case 'gte':
      return actualNumber >= expectedNumber;
    case 'lt':
      return actualNumber < expectedNumber;
    case 'lte':
      return actualNumber <= expectedNumber;
  }
}

function evaluateComparison(
  actual: unknown,
  compare: SparcConditionComparison,
  expected: unknown,
): boolean {
  switch (compare) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'truthy':
      return Boolean(actual);
    case 'falsy':
      return !actual;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareNumbers(actual, expected, compare);
  }
}

function readStateConditionValue(
  condition: Extract<SparcCondition, { type: 'state' }>,
  context: SparcConditionEvaluationContext,
): unknown {
  const cellKey = createSparcStateCellKey(condition.query.target, condition.query.key);
  return context.replayState.cells[cellKey]?.value;
}

function readModelConditionValue(
  condition: Extract<SparcCondition, { type: 'model' }>,
  context: SparcConditionEvaluationContext,
): unknown {
  if (!context.modelQueries) {
    throw new Error('SPARC model condition requires model query capability');
  }
  return evaluateSparcModelQuery(context.modelQueries, condition.query);
}

export function evaluateSparcCondition(
  condition: SparcCondition,
  context: SparcConditionEvaluationContext,
): boolean {
  switch (condition.type) {
    case 'state':
      return evaluateComparison(
        readStateConditionValue(condition, context),
        condition.compare,
        condition.value,
      );
    case 'model':
      return evaluateComparison(
        readModelConditionValue(condition, context),
        condition.compare,
        condition.value,
      );
    case 'all':
      return condition.conditions.every((child) => evaluateSparcCondition(child, context));
    case 'any':
      return condition.conditions.some((child) => evaluateSparcCondition(child, context));
    case 'not':
      return !evaluateSparcCondition(condition.condition, context);
  }
}
