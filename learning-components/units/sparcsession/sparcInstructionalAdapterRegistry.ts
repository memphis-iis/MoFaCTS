import { deriveSparcControllerFacts } from './sparcControllerDerivedFacts';
import {
  assertSparcInstructionalControllerConfig,
  instantiateSparcAutoTutorInstructionalFacts,
  SPARC_AUTOTUTOR_ADAPTER_ID,
} from './sparcInstructionalControl';
import {
  selectSparcLearningTargetFromFacts,
  type SparcLearningTargetSelection,
  type SparcLearningTargetSelectionOptions,
} from './sparcTargetSelection';
import type {
  SparcInstructionalControllerConfig,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcInstructionalAdapter = {
  readonly adapterId: string;
  readonly deriveControllerFacts: (
    facts: readonly SparcWorkingMemoryFact[],
  ) => readonly SparcWorkingMemoryFact[];
  readonly selectTarget: (params: {
    readonly facts: readonly SparcWorkingMemoryFact[];
    readonly options?: SparcLearningTargetSelectionOptions;
  }) => SparcLearningTargetSelection;
  readonly instantiateInstructionalFacts: (params: {
    readonly selection: SparcLearningTargetSelection;
    readonly facts: readonly SparcWorkingMemoryFact[];
    readonly config: SparcInstructionalControllerConfig;
  }) => readonly SparcWorkingMemoryFact[];
};

function stringSlot(fact: SparcWorkingMemoryFact | undefined, slot: string): string | undefined {
  const value = fact?.slots?.[slot];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericSlot(fact: SparcWorkingMemoryFact, slot: string): number {
  const value = Number(fact.slots?.[slot]);
  return Number.isFinite(value) ? value : 0;
}

function optionalNumericSlot(fact: SparcWorkingMemoryFact | undefined, slot: string): number | undefined {
  const raw = fact?.slots?.[slot];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`SPARC fact "${fact?.factType}" slot "${slot}" must be finite`);
  return value;
}

function coverageThreshold(facts: readonly SparcWorkingMemoryFact[]): number {
  return optionalNumericSlot(facts.find((fact) => fact.factType === 'dialogue.thresholds'), 'coverageThreshold')
    ?? optionalNumericSlot(facts.find((fact) => fact.factType === 'controller.targetSelectionPolicy'), 'coverageThreshold')
    ?? 0.8;
}

function repairActive(facts: readonly SparcWorkingMemoryFact[]): boolean {
  const repairThreshold = 1 - coverageThreshold(facts);
  const ids = new Set(facts
    .filter((fact) => fact.factType === 'autotutor.misconception')
    .map((fact) => stringSlot(fact, 'id'))
    .filter((id): id is string => Boolean(id)));
  const confidence = new Map<string, number>();
  for (const fact of facts) {
    const id = fact.factType === 'diagnostic.misconceptionScore' ? stringSlot(fact, 'id') : undefined;
    if (id && ids.has(id)) confidence.set(id, numericSlot(fact, 'confidence'));
  }
  return [...confidence.values()].some((value) => value >= repairThreshold);
}

function selectedExpectationFact(clusterKC: string, facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact {
  const previous = facts.filter((fact) => fact.factType === 'learningTarget.selected').at(-1);
  const continues = stringSlot(previous, 'clusterKC') === clusterKC;
  const turnCount = Math.max(0, ...facts
    .filter((fact) => fact.factType === 'session.turnState')
    .map((fact) => Math.floor(numericSlot(fact, 'turnCount'))));
  const previousFocusTurns = previous ? Math.floor(numericSlot(previous, 'focusTurnCount')) : 0;
  const previousCycle = previous ? Math.floor(numericSlot(previous, 'moveCycleIndex')) : -1;
  return {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC,
      focusActive: true,
      focusTurnCount: continues ? previousFocusTurns + 1 : 0,
      firstFocusTurn: continues ? numericSlot(previous!, 'firstFocusTurn') : turnCount,
      moveCycleIndex: previousCycle + 1,
    },
  };
}

function completionSelection(facts: readonly SparcWorkingMemoryFact[]): SparcLearningTargetSelection {
  const targets = [...new Set(facts
    .filter((fact) => fact.factType === 'autotutor.expectation')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter((id): id is string => Boolean(id)))];
  if (targets.length === 0) throw new Error('SPARC AutoTutor completion requires an expectation');
  const coverage = new Map<string, number>();
  for (const fact of facts) {
    const id = fact.factType === 'learningTarget.score' ? stringSlot(fact, 'clusterKC') : undefined;
    if (id) coverage.set(id, numericSlot(fact, 'coverage'));
  }
  const candidates = targets.map((clusterKC) => ({
    clusterKC,
    coverage: coverage.get(clusterKC) ?? 0,
    coherenceToAnchor: 0,
    frontierScore: 0,
    centralityScore: 0,
    priorityScore: coverage.get(clusterKC) ?? 0,
    eligible: false,
  })).sort((left, right) => right.coverage - left.coverage || left.clusterKC.localeCompare(right.clusterKC));
  const selected = candidates[0]!;
  return {
    selectedTargetType: 'learningTarget',
    selectedClusterKC: selected.clusterKC,
    misconceptionCandidates: [],
    candidates,
    facts: [
      ...candidates.map((candidate) => ({ factType: 'learningTarget.candidate', slots: candidate })),
      selectedExpectationFact(selected.clusterKC, facts),
      {
        factType: 'dialogue.completionSelected',
        slots: {
          reason: stringSlot(facts.find((fact) => fact.factType === 'controller.completionState'), 'reason') ?? 'completed',
        },
      },
    ],
  };
}

const autoTutorAdapter: SparcInstructionalAdapter = {
  adapterId: SPARC_AUTOTUTOR_ADAPTER_ID,
  deriveControllerFacts: deriveSparcControllerFacts,
  selectTarget({ facts, options }) {
    const completion = facts.find((fact) => fact.factType === 'controller.completionState');
    if (completion?.slots?.completed === true && !repairActive(facts)) return completionSelection(facts);
    return selectSparcLearningTargetFromFacts(facts, options);
  },
  instantiateInstructionalFacts: instantiateSparcAutoTutorInstructionalFacts,
};

const adapters = new Map<string, SparcInstructionalAdapter>([
  [autoTutorAdapter.adapterId, autoTutorAdapter],
]);

export function requireSparcInstructionalAdapter(
  config: SparcInstructionalControllerConfig | undefined,
): SparcInstructionalAdapter {
  assertSparcInstructionalControllerConfig(config);
  const adapter = adapters.get(config.adapterId);
  if (!adapter) throw new Error(`SPARC instructional adapter "${config.adapterId}" is not registered`);
  return adapter;
}
