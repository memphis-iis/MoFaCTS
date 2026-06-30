import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

export type SparcUtteranceRequest = {
  readonly targetType: 'learningTarget' | 'misconception' | 'completion';
  readonly action: string;
  readonly targetId: string;
  readonly contentTexts: readonly string[];
  readonly selectedAction: Readonly<Record<string, unknown>>;
  readonly sourceRuleId?: string;
  readonly templateVersion?: string;
};

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function selectedActionFacts(facts: readonly SparcWorkingMemoryFact[]): readonly SparcWorkingMemoryFact[] {
  return facts.filter((fact) => fact.factType === 'controller.selectedAction');
}

function requireSelectedAction(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact {
  const matches = selectedActionFacts(facts);
  if (matches.length !== 1) {
    throw new Error(`SPARC utterance request requires exactly one controller.selectedAction fact; found ${matches.length}`);
  }
  return matches[0]!;
}

function selectedTargetId(selectedAction: SparcWorkingMemoryFact, targetType: string): string {
  if (targetType === 'learningTarget') {
    const clusterKC = stringSlot(selectedAction, 'clusterKC');
    if (!clusterKC) {
      throw new Error('SPARC selected learningTarget action requires clusterKC');
    }
    return clusterKC;
  }
  if (targetType === 'misconception') {
    const id = stringSlot(selectedAction, 'id');
    if (!id) {
      throw new Error('SPARC selected misconception action requires id');
    }
    return id;
  }
  if (targetType === 'completion') {
    return stringSlot(selectedAction, 'id') ?? 'completion';
  }
  throw new Error(`SPARC selected action targetType "${targetType}" is not supported for utterance generation`);
}

function moveContentMatches(params: {
  readonly fact: SparcWorkingMemoryFact;
  readonly targetType: string;
  readonly targetId: string;
  readonly action: string;
}): boolean {
  if (params.fact.factType !== 'dialogue.moveContent') {
    return false;
  }
  if (stringSlot(params.fact, 'targetType') !== params.targetType) {
    return false;
  }
  if (stringSlot(params.fact, 'action') !== params.action) {
    return false;
  }
  if (params.targetType === 'learningTarget') {
    return stringSlot(params.fact, 'clusterKC') === params.targetId;
  }
  if (params.targetType === 'completion') {
    const id = stringSlot(params.fact, 'id');
    return !id || id === params.targetId;
  }
  return stringSlot(params.fact, 'id') === params.targetId;
}

export function createSparcUtteranceRequestFromFacts(
  facts: readonly SparcWorkingMemoryFact[],
): SparcUtteranceRequest {
  const selectedAction = requireSelectedAction(facts);
  const targetType = stringSlot(selectedAction, 'targetType');
  const action = stringSlot(selectedAction, 'action');
  if (!targetType || !action) {
    throw new Error('SPARC selected action requires targetType and action');
  }
  if (targetType !== 'learningTarget' && targetType !== 'misconception' && targetType !== 'completion') {
    throw new Error(`SPARC selected action targetType "${targetType}" is not supported for utterance generation`);
  }
  const targetId = selectedTargetId(selectedAction, targetType);
  const matchingContent = facts.filter((fact) => moveContentMatches({
    fact,
    targetType,
    targetId,
    action,
  }));
  const contentTexts = matchingContent
    .map((fact) => stringSlot(fact, 'text'))
    .filter(Boolean) as string[];
  if (contentTexts.length === 0) {
    throw new Error(`SPARC utterance request missing dialogue.moveContent for ${targetType} "${targetId}" action "${action}"`);
  }
  const sourceRuleId = stringSlot(selectedAction, 'sourceRuleId');
  const templateVersion = stringSlot(selectedAction, 'templateVersion');

  return {
    targetType,
    action,
    targetId,
    contentTexts,
    selectedAction: selectedAction.slots ?? {},
    ...(sourceRuleId ? { sourceRuleId } : {}),
    ...(templateVersion ? { templateVersion } : {}),
  };
}
