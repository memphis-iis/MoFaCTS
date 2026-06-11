import { evaluateSparcCondition, type SparcConditionEvaluationContext } from './sparcConditionEvaluator';
import {
  resolveSparcDocumentAddress,
} from './sparcDocumentAddressing';
import type {
  SparcAuthoredDocument,
  SparcReactiveEvent,
  SparcReactiveRule,
  SparcStateTransition,
  SparcStateWrite,
} from './sparcSessionContracts';

export type SparcReactiveRuleEvaluation = {
  readonly matchedRuleIds: readonly string[];
  readonly skippedRuleIds: readonly string[];
  readonly transition: SparcStateTransition | null;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function assertRuleWriteTargets(
  document: SparcAuthoredDocument,
  rule: SparcReactiveRule,
): void {
  rule.writes.forEach((write, writeIndex) => {
    resolveSparcDocumentAddress(document, write.target);
    requireNonBlank(write.key, `SPARC reactive rule "${rule.id}" write[${writeIndex}].key`);
  });
}

export function evaluateSparcReactiveRules(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcReactiveEvent;
  readonly rules: readonly SparcReactiveRule[];
  readonly context: SparcConditionEvaluationContext;
}): SparcReactiveRuleEvaluation {
  resolveSparcDocumentAddress(params.document, params.event.source);
  const matchedRuleIds: string[] = [];
  const skippedRuleIds: string[] = [];
  const writes: SparcStateWrite[] = [];

  for (const rule of params.rules) {
    requireNonBlank(rule.id, 'SPARC reactive rule id');
    if (!Array.isArray(rule.writes)) {
      throw new Error(`SPARC reactive rule "${rule.id}" writes must be an array`);
    }
    assertRuleWriteTargets(params.document, rule);
    const matches = rule.when
      ? evaluateSparcCondition(rule.when, params.context)
      : true;
    if (!matches) {
      skippedRuleIds.push(rule.id);
      continue;
    }
    matchedRuleIds.push(rule.id);
    writes.push(...rule.writes);
  }

  if (writes.length === 0) {
    return {
      matchedRuleIds,
      skippedRuleIds,
      transition: null,
    };
  }

  return {
    matchedRuleIds,
    skippedRuleIds,
    transition: {
      transitionId: `${params.event.eventId}:rules`,
      event: params.event,
      writes,
    },
  };
}

export function evaluateSparcAuthoredReactiveRules(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcReactiveEvent;
  readonly context: SparcConditionEvaluationContext;
}): SparcReactiveRuleEvaluation {
  return evaluateSparcReactiveRules({
    document: params.document,
    event: params.event,
    rules: params.document.reactiveRules ?? [],
    context: params.context,
  });
}
