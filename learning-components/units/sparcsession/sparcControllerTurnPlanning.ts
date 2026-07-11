import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { evaluateSparcAuthoredProductionRules, type SparcCommittedProductionRuleEvaluation } from './sparcProductionRuleCommit';
import {
  type SparcLearningTargetSelection,
  type SparcLearningTargetSelectionOptions,
} from './sparcTargetSelection';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { requireSparcInstructionalAdapter } from './sparcInstructionalAdapterRegistry';

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
  'instructionalTarget.active',
  'instructionalFocus.episode',
  'learningObservation.targetProgress',
  'scaffold.state',
]);

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
  const adapter = requireSparcInstructionalAdapter(params.document.instructionalController);
  const derivedFacts = adapter.deriveControllerFacts(baseFacts);
  const targetSelection = adapter.selectTarget({
    facts: [
      ...baseFacts,
      ...derivedFacts,
    ],
    ...(params.targetSelectionOptions ? { options: params.targetSelectionOptions } : {}),
  });
  const instructionalFacts = adapter.instantiateInstructionalFacts({
    selection: targetSelection,
    facts: [
      ...baseFacts,
      ...derivedFacts,
      ...targetSelection.facts,
    ],
    config: params.document.instructionalController!,
  });
  const productionRuleFacts = [
    ...targetSelection.facts,
    ...derivedFacts,
    ...instructionalFacts,
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
