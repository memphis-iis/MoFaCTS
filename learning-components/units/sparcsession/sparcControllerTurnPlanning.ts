import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { deriveSparcControllerFacts } from './sparcControllerDerivedFacts';
import { evaluateSparcAuthoredProductionRules, type SparcCommittedProductionRuleEvaluation } from './sparcProductionRuleCommit';
import {
  selectSparcLearningTargetFromFacts,
  type SparcLearningTargetSelection,
  type SparcLearningTargetSelectionOptions,
} from './sparcTargetSelection';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcControllerTurnPlanningResult = {
  readonly targetSelection: SparcLearningTargetSelection;
  readonly derivedFacts: readonly SparcWorkingMemoryFact[];
  readonly productionRuleEvaluation: SparcCommittedProductionRuleEvaluation;
  readonly productionRuleFacts: readonly SparcWorkingMemoryFact[];
};

const CURRENT_CONTROLLER_FACT_TYPES = new Set([
  'learningTarget.selected',
  'diagnostic.misconceptionSelected',
  'dialogue.completionSelected',
  'controller.completionState',
  'controller.selectedAction',
  'controller.moveSelectionAudit',
]);

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericSlot(fact: SparcWorkingMemoryFact, slotName: string): number {
  const value = Number(fact.slots?.[slotName]);
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeIntegerSlot(fact: SparcWorkingMemoryFact, slotName: string, fallback: number): number {
  const value = Number(fact.slots?.[slotName]);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function completionState(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  return facts.find((fact) => fact.factType === 'controller.completionState');
}

function currentTurnCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'session.turnState')
    .map((fact) => nonNegativeIntegerSlot(fact, 'turnCount', 0)));
}

function previousSelectedTarget(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  return facts.filter((fact) => fact.factType === 'learningTarget.selected').at(-1);
}

function selectedLearningTargetFact(clusterKC: string, facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact {
  const previous = previousSelectedTarget(facts);
  const focusContinues = stringSlot(previous ?? { factType: 'none' }, 'clusterKC') === clusterKC;
  const turnCount = currentTurnCount(facts);
  const previousFocusTurnCount = previous ? nonNegativeIntegerSlot(previous, 'focusTurnCount', 0) : 0;
  const previousMoveCycleIndex = previous ? nonNegativeIntegerSlot(previous, 'moveCycleIndex', -1) : -1;
  return {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC,
      focusActive: true,
      focusTurnCount: focusContinues ? previousFocusTurnCount + 1 : 0,
      firstFocusTurn: focusContinues && previous ? nonNegativeIntegerSlot(previous, 'firstFocusTurn', turnCount) : turnCount,
      moveCycleIndex: previousMoveCycleIndex + 1,
    },
  };
}

function selectCompletionSummaryTarget(facts: readonly SparcWorkingMemoryFact[]): SparcLearningTargetSelection {
  const targets = facts
    .filter((fact) => fact.factType === 'learningTarget.source')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter(Boolean) as string[];
  const uniqueTargets = [...new Set(targets)];
  if (uniqueTargets.length === 0) {
    throw new Error('SPARC completion target selection requires at least one learningTarget.source fact');
  }
  const coverageByClusterKC = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType === 'learningTarget.score') {
      const clusterKC = stringSlot(fact, 'clusterKC');
      if (clusterKC) coverageByClusterKC.set(clusterKC, numericSlot(fact, 'coverage'));
    }
  }
  const candidates = uniqueTargets
    .map((clusterKC) => {
      const coverage = coverageByClusterKC.get(clusterKC) ?? 0;
      return {
        clusterKC,
        coverage,
        coherenceToAnchor: 0,
        frontierScore: 0,
        centralityScore: 0,
        priorityScore: coverage,
        eligible: false,
      };
    })
    .sort((left, right) => (
      right.coverage - left.coverage
      || left.clusterKC.localeCompare(right.clusterKC)
    ));
  const selected = candidates[0]!;
  return {
    selectedClusterKC: selected.clusterKC,
    candidates,
    facts: [
      ...candidates.map((candidate) => ({
        factType: 'learningTarget.candidate',
        slots: {
          clusterKC: candidate.clusterKC,
          coverage: candidate.coverage,
          coherenceToAnchor: candidate.coherenceToAnchor,
          frontierScore: candidate.frontierScore,
          centralityScore: candidate.centralityScore,
          priorityScore: candidate.priorityScore,
          eligible: candidate.eligible,
        },
      })),
      selectedLearningTargetFact(selected.clusterKC, facts),
      {
        factType: 'dialogue.completionSelected',
        slots: {
          reason: stringSlot(completionState(facts)!, 'reason') ?? 'completed',
        },
      },
    ],
  };
}

function selectControllerTarget(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
}): SparcLearningTargetSelection {
  if (completionState(params.facts)?.slots?.completed === true) {
    return selectCompletionSummaryTarget(params.facts);
  }
  return selectSparcLearningTargetFromFacts(params.facts, params.targetSelectionOptions);
}

export function evaluateSparcControllerTurnPlanning(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
  readonly maxProductionRuleCycles?: number;
}): SparcControllerTurnPlanningResult {
  const baseFacts = buildSparcWorkingMemoryFacts({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
  });
  const derivedFacts = deriveSparcControllerFacts(baseFacts);
  const targetSelection = selectControllerTarget({
    facts: [
      ...baseFacts,
      ...derivedFacts,
    ],
    ...(params.targetSelectionOptions ? { targetSelectionOptions: params.targetSelectionOptions } : {}),
  });
  const productionRuleFacts = [
    ...targetSelection.facts,
    ...derivedFacts,
  ];
  const productionRuleEvaluation = evaluateSparcAuthoredProductionRules({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    extraFacts: [
      ...(params.extraFacts ?? []),
      ...productionRuleFacts,
    ],
    factFilter: (fact) => !CURRENT_CONTROLLER_FACT_TYPES.has(fact.factType),
    ...(params.maxProductionRuleCycles !== undefined ? { maxCycles: params.maxProductionRuleCycles } : {}),
  });
  return {
    targetSelection,
    derivedFacts,
    productionRuleFacts,
    productionRuleEvaluation,
  };
}
