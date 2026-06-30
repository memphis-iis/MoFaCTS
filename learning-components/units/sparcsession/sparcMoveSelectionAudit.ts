import {
  evaluateSparcProductionRules,
} from './sparcProductionRuleEvaluator';
import {
  createSparcUtteranceRequestFromFacts,
  type SparcUtteranceRequest,
} from './sparcUtteranceRequest';
import type {
  SparcProductionRule,
  SparcProductionRuleFiring,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcMoveSelectionAuditCandidate = {
  readonly ruleId: string;
  readonly salience: number;
  readonly action?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly terminal: boolean;
  readonly terminalReason?: string;
  readonly selectedAction?: Readonly<Record<string, unknown>>;
  readonly valid: boolean;
  readonly rejectionReason?: string;
};

export type SparcMoveSelectionAudit = {
  readonly candidates: readonly SparcMoveSelectionAuditCandidate[];
  readonly selected?: SparcMoveSelectionAuditCandidate;
  readonly utteranceRequest?: SparcUtteranceRequest;
};

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function selectedActionFact(firing: SparcProductionRuleFiring | undefined): SparcWorkingMemoryFact | undefined {
  return firing?.assertedFacts.find((fact) => fact.factType === 'controller.selectedAction');
}

function selectedActionTargetId(fact: SparcWorkingMemoryFact | undefined): string | undefined {
  const targetType = fact ? stringSlot(fact, 'targetType') : undefined;
  if (targetType === 'learningTarget') {
    return fact ? stringSlot(fact, 'clusterKC') : undefined;
  }
  if (targetType === 'misconception') {
    return fact ? stringSlot(fact, 'id') : undefined;
  }
  return undefined;
}

function ruleSalienceById(
  rules: readonly SparcProductionRule[],
  overrides: Readonly<Record<string, number>> | undefined,
): ReadonlyMap<string, number> {
  const salience = new Map<string, number>();
  for (const rule of rules) {
    salience.set(rule.id, overrides?.[rule.id] ?? rule.salience ?? 0);
  }
  return salience;
}

function validateSelectedAction(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly selectedAction: SparcWorkingMemoryFact | undefined;
}): { readonly valid: true; readonly utteranceRequest: SparcUtteranceRequest } | { readonly valid: false; readonly reason: string } {
  if (!params.selectedAction) {
    return {
      valid: false,
      reason: 'matched rule did not assert controller.selectedAction',
    };
  }
  try {
    return {
      valid: true,
      utteranceRequest: createSparcUtteranceRequestFromFacts([
        ...params.facts.filter((fact) => fact.factType !== 'controller.selectedAction'),
        params.selectedAction,
      ]),
    };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function auditSparcMoveSelection(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly rules: readonly SparcProductionRule[];
  readonly salienceOverrides?: Readonly<Record<string, number>>;
}): SparcMoveSelectionAudit {
  const salienceById = ruleSalienceById(params.rules, params.salienceOverrides);
  const overriddenRules = params.salienceOverrides
    ? params.rules.map((rule) => ({
        ...rule,
        salience: salienceById.get(rule.id) ?? 0,
      }))
    : params.rules;
  const firings = evaluateSparcProductionRules({
    facts: params.facts,
    rules: overriddenRules,
  });
  const candidates = firings
    .filter((firing) => firing.terminatesProductionPhase || selectedActionFact(firing))
    .map((firing) => {
      const selectedAction = selectedActionFact(firing);
      const action = selectedAction ? stringSlot(selectedAction, 'action') : undefined;
      const targetType = selectedAction ? stringSlot(selectedAction, 'targetType') : undefined;
      const targetId = selectedActionTargetId(selectedAction);
      const validation = validateSelectedAction({
        facts: params.facts,
        selectedAction,
      });
      return {
        ruleId: firing.ruleId,
        salience: salienceById.get(firing.ruleId) ?? 0,
        ...(selectedAction ? { selectedAction: selectedAction.slots ?? {} } : {}),
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
        terminal: firing.terminatesProductionPhase,
        ...(firing.terminalReason ? { terminalReason: firing.terminalReason } : {}),
        valid: validation.valid,
        ...(!validation.valid ? { rejectionReason: validation.reason } : {}),
      };
    })
    .sort((left, right) => (
      right.salience - left.salience
      || left.ruleId.localeCompare(right.ruleId)
    ));
  const selected = candidates.find((candidate) => candidate.terminal && candidate.valid);
  const selectedAction = selected
    ? firings.find((firing) => firing.ruleId === selected.ruleId)
    : undefined;
  const selectedActionFactForRequest = selectedActionFact(selectedAction);
  const utteranceRequest = selectedActionFactForRequest
    ? validateSelectedAction({
        facts: params.facts,
        selectedAction: selectedActionFactForRequest,
      })
    : undefined;
  return {
    candidates,
    ...(selected ? { selected } : {}),
    ...(utteranceRequest?.valid ? { utteranceRequest: utteranceRequest.utteranceRequest } : {}),
  };
}
