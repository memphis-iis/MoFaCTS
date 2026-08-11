import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { evaluateSparcAuthoredProductionRules, type SparcCommittedProductionRuleEvaluation } from './sparcProductionRuleCommit';
import type { SparcInstructionalCandidateOptions } from './sparcInstructionalCandidates';
import type { SparcAutoTutorInstructionalProjection } from './sparcInstructionalControl';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { requireSparcInstructionalAdapter } from './sparcInstructionalAdapterRegistry';

export type SparcControllerTurnPlanningResult = {
  readonly instructionalProjection: SparcAutoTutorInstructionalProjection;
  readonly derivedFacts: readonly SparcWorkingMemoryFact[];
  readonly productionRuleEvaluation: SparcCommittedProductionRuleEvaluation;
  readonly productionRuleFacts: readonly SparcWorkingMemoryFact[];
};

const CURRENT_CONTROLLER_FACT_TYPES = new Set([
  'learningTarget.selected',
  'learningTarget.candidate',
  'diagnostic.misconceptionSelected',
  'dialogue.completionSelected',
  'controller.completionState',
  'controller.selectedAction',
  'controller.moveSelectionAudit',
  'instructionalTarget.active',
  'instructionalFocus.episode',
  'learningObservation.targetProgress',
  'scaffold.state',
  'instructional.assessmentSnapshot',
  'instructional.thresholds',
  'instructional.candidate',
  'instructional.progress',
  'instructional.cycleStatus',
  'instructional.activeCycle',
  'instructional.decision',
]);

function currentDecisionFacts(
  facts: readonly SparcWorkingMemoryFact[],
  snapshotId: string,
): readonly SparcWorkingMemoryFact[] {
  return facts.filter((fact) => (
    fact.factType === 'instructional.decision'
    && fact.slots?.snapshotId === snapshotId
  ));
}

function currentSelectedActionFacts(
  facts: readonly SparcWorkingMemoryFact[],
  snapshotId: string,
): readonly SparcWorkingMemoryFact[] {
  return facts.filter((fact) => (
    fact.factType === 'controller.selectedAction'
    && fact.slots?.snapshotId === snapshotId
  ));
}

function assertSingleInstructionalDecision(params: {
  readonly snapshotId: string;
  readonly evaluation: SparcCommittedProductionRuleEvaluation;
}): void {
  const facts = params.evaluation.execution.facts;
  const decisions = currentDecisionFacts(facts, params.snapshotId);
  const actions = currentSelectedActionFacts(facts, params.snapshotId);
  if (decisions.length !== 1) {
    throw new Error(`SPARC instructional control requires exactly one decision for snapshot "${params.snapshotId}"; found ${decisions.length}`);
  }
  if (actions.length !== 1) {
    throw new Error(`SPARC instructional control requires exactly one selected action for snapshot "${params.snapshotId}"; found ${actions.length}`);
  }
  const decision = decisions[0]!.slots ?? {};
  const action = actions[0]!.slots ?? {};
  if (
    decision.targetKind !== action.targetType
    || decision.targetId !== action.targetId
    || decision.action !== action.action
  ) {
    throw new Error('SPARC instructional decision does not match controller.selectedAction');
  }
}

export function evaluateSparcControllerTurnPlanning(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly candidateOptions?: SparcInstructionalCandidateOptions;
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
  const currentFacts = [
    ...baseFacts,
    ...derivedFacts,
  ];
  const instructionalProjection = adapter.projectInstructionalFacts({
    snapshotId: params.event.eventId,
    facts: currentFacts,
    config: params.document.instructionalController!,
    ...(params.candidateOptions ? { candidateOptions: params.candidateOptions } : {}),
  });
  const productionRuleFacts = [
    ...derivedFacts,
    ...instructionalProjection.facts,
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
  assertSingleInstructionalDecision({
    snapshotId: params.event.eventId,
    evaluation: productionRuleEvaluation,
  });
  return {
    instructionalProjection,
    derivedFacts,
    productionRuleFacts,
    productionRuleEvaluation,
  };
}
