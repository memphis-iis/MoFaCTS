import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import {
  requireActiveSparcMoveDefinition,
  type SparcMoveDefinition,
} from './sparcMoveDefinitions';

export type SparcUtteranceRequest = {
  readonly problemStatement: string;
  readonly targetType: 'learningTarget' | 'misconception' | 'learnerQuestion' | 'completion';
  readonly action: string;
  readonly targetId: string;
  readonly contentTexts: readonly string[];
  readonly selectedAction: Readonly<Record<string, unknown>>;
  readonly moveDefinition: SparcMoveDefinition;
  readonly sourceRuleId?: string;
  readonly learnerText?: string;
  readonly learnerContribution?: Readonly<Record<string, unknown>>;
  readonly pedagogicalState?: Readonly<Record<string, unknown>>;
  readonly targetContent?: unknown;
  readonly plannerState?: unknown;
  readonly dialogueHistory?: readonly Readonly<Record<string, unknown>>[];
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
  const generalTargetId = stringSlot(selectedAction, 'targetId');
  if (generalTargetId) {
    return generalTargetId;
  }
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
  if (targetType === 'learnerQuestion') {
    return 'learner-question';
  }
  throw new Error(`SPARC selected action targetType "${targetType}" is not supported for utterance generation`);
}

function factsByType(facts: readonly SparcWorkingMemoryFact[], factType: string): readonly SparcWorkingMemoryFact[] {
  return facts.filter((fact) => fact.factType === factType);
}

function latestFact(facts: readonly SparcWorkingMemoryFact[], factType: string): SparcWorkingMemoryFact | undefined {
  return factsByType(facts, factType).at(-1);
}

export function buildSparcDialogueHistory(
  facts: readonly SparcWorkingMemoryFact[],
): readonly Readonly<Record<string, unknown>>[] {
  return factsByType(facts, 'dialogue.utterance')
    .map((fact) => ({
      role: fact.slots?.speaker === 'learner' ? 'student' : 'tutor',
      text: stringSlot(fact, 'text') ?? '',
    }))
    .filter((entry) => entry.text);
}

function learningTargetContent(facts: readonly SparcWorkingMemoryFact[], clusterKC: string): unknown {
  const source = factsByType(facts, 'autotutor.expectation')
    .find((fact) => stringSlot(fact, 'clusterKC') === clusterKC);
  return source?.slots ?? { clusterKC, text: '' };
}

function misconceptionContent(facts: readonly SparcWorkingMemoryFact[], id: string): unknown {
  const source = factsByType(facts, 'autotutor.misconception')
    .find((fact) => stringSlot(fact, 'id') === id);
  return {
    selectedMisconception: source?.slots ?? { id, text: '' },
    correctExpectations: factsByType(facts, 'autotutor.expectation')
      .map((fact) => fact.slots ?? {})
      .filter((slots) => stringSlot({ factType: 'autotutor.expectation', slots }, 'text')),
  };
}

function targetContent(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly targetType: string;
  readonly targetId: string;
  readonly contentTexts: readonly string[];
}): unknown {
  if (params.targetType === 'learningTarget') {
    return learningTargetContent(params.facts, params.targetId);
  }
  if (params.targetType === 'misconception') {
    return misconceptionContent(params.facts, params.targetId);
  }
  if (params.targetType === 'learnerQuestion') {
    return latestFact(params.facts, 'dialogue.learnerQuestion')?.slots ?? {};
  }
  const completionState = latestFact(params.facts, 'controller.completionState')?.slots ?? {};
  const coverageThresholdValue = Number(completionState.coverageThreshold);
  const coverageThreshold = Number.isFinite(coverageThresholdValue) ? coverageThresholdValue : 0.8;
  const expectationScores = new Map(factsByType(params.facts, 'learningTarget.score').flatMap((fact) => {
    const id = stringSlot(fact, 'clusterKC');
    const coverage = Number(fact.slots?.coverage);
    return id && Number.isFinite(coverage) ? [[id, coverage] as const] : [];
  }));
  const misconceptionScores = new Map(factsByType(params.facts, 'diagnostic.misconceptionScore').flatMap((fact) => {
    const id = stringSlot(fact, 'id');
    const confidence = Number(fact.slots?.confidence);
    return id && Number.isFinite(confidence) ? [[id, confidence] as const] : [];
  }));
  return {
    completion: completionState,
    expectations: factsByType(params.facts, 'autotutor.expectation').map((fact) => {
      const clusterKC = stringSlot(fact, 'clusterKC') ?? '';
      const coverage = expectationScores.get(clusterKC) ?? 0;
      return {
        clusterKC,
        text: stringSlot(fact, 'text') ?? '',
        coverage,
        status: coverage >= coverageThreshold ? 'covered' : 'uncovered',
      };
    }),
    misconceptions: factsByType(params.facts, 'autotutor.misconception').map((fact) => {
      const id = stringSlot(fact, 'id') ?? '';
      const confidence = misconceptionScores.get(id) ?? 0;
      return {
        id,
        text: stringSlot(fact, 'text') ?? '',
        confidence,
        status: confidence >= 1 - coverageThreshold ? 'active' : 'inactive',
      };
    }),
  };
}

function cleanContentTextForTarget(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly targetType: string;
  readonly targetId: string;
}): readonly string[] {
  if (params.targetType === 'learningTarget') {
    const target = factsByType(params.facts, 'autotutor.expectation')
      .find((fact) => stringSlot(fact, 'clusterKC') === params.targetId);
    const text = target ? stringSlot(target, 'text') : undefined;
    if (!text) {
      throw new Error(`SPARC utterance request missing clean expectation text for clusterKC "${params.targetId}"`);
    }
    return [text];
  }
  if (params.targetType === 'misconception') {
    const misconception = factsByType(params.facts, 'autotutor.misconception')
      .find((fact) => stringSlot(fact, 'id') === params.targetId);
    const text = misconception ? stringSlot(misconception, 'text') : undefined;
    if (!text) {
      throw new Error(`SPARC utterance request missing clean misconception text for id "${params.targetId}"`);
    }
    return [text];
  }
  if (params.targetType === 'learnerQuestion') {
    return [];
  }
  const expectationTexts = factsByType(params.facts, 'autotutor.expectation')
    .map((fact) => stringSlot(fact, 'text'))
    .filter(Boolean) as string[];
  if (expectationTexts.length === 0) {
    throw new Error('SPARC utterance request missing clean expectation text for completion summary');
  }
  return expectationTexts;
}

function plannerState(facts: readonly SparcWorkingMemoryFact[]): unknown {
  const latestByIdentity = (factType: string, identitySlot: string) => {
    const latest = new Map<string, Readonly<Record<string, unknown>>>();
    for (const fact of factsByType(facts, factType)) {
      const identity = stringSlot(fact, identitySlot);
      if (identity) latest.set(identity, fact.slots ?? {});
    }
    return [...latest.values()];
  };
  return {
    expectations: latestByIdentity('learningTarget.score', 'clusterKC'),
    misconceptions: latestByIdentity('diagnostic.misconceptionScore', 'id'),
    selectedTarget: latestFact(facts, 'learningTarget.selected')?.slots ?? null,
    selectedMisconception: latestFact(facts, 'diagnostic.misconceptionSelected')?.slots ?? null,
    completionState: latestFact(facts, 'controller.completionState')?.slots ?? null,
    candidates: factsByType(facts, 'learningTarget.candidate').map((fact) => fact.slots ?? {}),
  };
}

function pedagogicalState(selectedAction: SparcWorkingMemoryFact): Readonly<Record<string, unknown>> {
  const slots = selectedAction.slots ?? {};
  return {
    targetType: slots.targetType,
    targetId: slots.targetId ?? slots.clusterKC ?? slots.id ?? null,
    selectedMove: slots.action,
  };
}

export function createSparcUtteranceRequestFromFacts(
  facts: readonly SparcWorkingMemoryFact[],
): SparcUtteranceRequest {
  const problemStatement = stringSlot(
    latestFact(facts, 'dialogue.problemStatement') ?? { factType: 'dialogue.problemStatement' },
    'text',
  );
  if (!problemStatement) {
    throw new Error('SPARC utterance request requires dialogue.problemStatement.text');
  }
  const selectedAction = requireSelectedAction(facts);
  const authoredTargetType = stringSlot(selectedAction, 'targetType');
  const action = stringSlot(selectedAction, 'action');
  if (!authoredTargetType || !action) {
    throw new Error('SPARC selected action requires targetType and action');
  }
  const targetType = authoredTargetType === 'expectation' ? 'learningTarget' : authoredTargetType;
  if (targetType !== 'learningTarget' && targetType !== 'misconception' && targetType !== 'learnerQuestion' && targetType !== 'completion') {
    throw new Error(`SPARC selected action targetType "${targetType}" is not supported for utterance generation`);
  }
  const moveDefinition = requireActiveSparcMoveDefinition(action);
  const targetId = selectedTargetId(selectedAction, targetType);
  const contentTexts = cleanContentTextForTarget({
    facts,
    targetType,
    targetId,
  });
  const sourceRuleId = stringSlot(selectedAction, 'sourceRuleId');
  const contribution = latestFact(facts, 'learnerResponse.contribution')?.slots;

  return {
    problemStatement,
    targetType,
    action,
    targetId,
    contentTexts,
    selectedAction: selectedAction.slots ?? {},
    moveDefinition,
    ...(contribution ? { learnerContribution: contribution } : {}),
    pedagogicalState: pedagogicalState(selectedAction),
    targetContent: targetContent({ facts, targetType, targetId, contentTexts }),
    plannerState: plannerState(facts),
    dialogueHistory: buildSparcDialogueHistory(facts),
    ...(sourceRuleId ? { sourceRuleId } : {}),
  };
}
