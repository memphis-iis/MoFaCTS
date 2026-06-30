import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

export type SparcLearningTargetCandidate = {
  readonly clusterKC: string;
  readonly anchorClusterKC?: string;
  readonly coverage: number;
  readonly coherenceToAnchor: number;
  readonly frontierScore: number;
  readonly centralityScore: number;
  readonly priorityScore: number;
  readonly eligible: boolean;
};

export type SparcLearningTargetSelection = {
  readonly selectedClusterKC: string;
  readonly candidates: readonly SparcLearningTargetCandidate[];
  readonly facts: readonly SparcWorkingMemoryFact[];
};

export type SparcLearningTargetSelectionWeights = {
  readonly frontierWeight: number;
  readonly coherenceWeight: number;
  readonly centralityWeight: number;
};

export type SparcLearningTargetSelectionOptions = {
  readonly coverageThreshold?: number;
  readonly anchorClusterKC?: string;
  readonly excludeClusterKC?: string;
  readonly weights?: Partial<SparcLearningTargetSelectionWeights>;
};

const DEFAULT_COVERAGE_THRESHOLD = 0.8;
const DEFAULT_WEIGHTS: SparcLearningTargetSelectionWeights = {
  frontierWeight: 0.5,
  coherenceWeight: 0.3,
  centralityWeight: 0.2,
};

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberSlot(fact: SparcWorkingMemoryFact, slotName: string, label: string): number {
  const numberValue = Number(fact.slots?.[slotName]);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number`);
  }
  return numberValue;
}

function finiteOption(value: unknown, label: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number`);
  }
  return numberValue;
}

function nonNegativeIntegerSlot(fact: SparcWorkingMemoryFact, slotName: string, fallback: number): number {
  const value = Number(fact.slots?.[slotName]);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function collectRequiredTargets(facts: readonly SparcWorkingMemoryFact[]): string[] {
  const targets = facts
    .filter((fact) => fact.factType === 'learningTarget.source')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter(Boolean) as string[];
  if (targets.length === 0) {
    throw new Error('SPARC target selection requires at least one learningTarget.source fact');
  }
  const uniqueTargets = new Set(targets);
  if (uniqueTargets.size !== targets.length) {
    throw new Error('SPARC target selection requires unique learningTarget.source clusterKC values');
  }
  return targets;
}

function collectCoverageByClusterKC(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const coverageByClusterKC = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'learningTarget.score') {
      continue;
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    if (!clusterKC) {
      throw new Error('SPARC learningTarget.score fact requires clusterKC');
    }
    coverageByClusterKC.set(clusterKC, numberSlot(fact, 'coverage', `SPARC learningTarget.score "${clusterKC}" coverage`));
  }
  return coverageByClusterKC;
}

function collectCentralityByClusterKC(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const centralityByClusterKC = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'kcGraph.node') {
      continue;
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    if (!clusterKC) {
      throw new Error('SPARC kcGraph.node fact requires clusterKC');
    }
    centralityByClusterKC.set(clusterKC, numberSlot(fact, 'centrality', `SPARC kcGraph.node "${clusterKC}" centrality`));
  }
  return centralityByClusterKC;
}

function collectRelationships(facts: readonly SparcWorkingMemoryFact[]): Map<string, Map<string, number>> {
  const relationships = new Map<string, Map<string, number>>();
  for (const fact of facts) {
    if (fact.factType !== 'kcGraph.relationship') {
      continue;
    }
    const sourceClusterKC = stringSlot(fact, 'sourceClusterKC');
    const targetClusterKC = stringSlot(fact, 'targetClusterKC');
    if (!sourceClusterKC || !targetClusterKC) {
      throw new Error('SPARC kcGraph.relationship facts require sourceClusterKC and targetClusterKC');
    }
    const sourceRelationships = relationships.get(sourceClusterKC) ?? new Map<string, number>();
    sourceRelationships.set(
      targetClusterKC,
      numberSlot(fact, 'strength', `SPARC kcGraph.relationship "${sourceClusterKC}" -> "${targetClusterKC}" strength`),
    );
    relationships.set(sourceClusterKC, sourceRelationships);
  }
  return relationships;
}

function findTargetSelectionPolicy(facts: readonly SparcWorkingMemoryFact[]): Record<string, unknown> | undefined {
  const policies = facts.filter((fact) => fact.factType === 'controller.targetSelectionPolicy');
  if (policies.length > 1) {
    throw new Error('SPARC target selection requires at most one controller.targetSelectionPolicy fact');
  }
  return policies[0]?.slots as Record<string, unknown> | undefined;
}

function relationshipStrength(
  relationships: Map<string, Map<string, number>>,
  sourceClusterKC: string,
  targetClusterKC: string,
): number {
  if (sourceClusterKC === targetClusterKC) {
    return 1;
  }
  const score = relationships.get(sourceClusterKC)?.get(targetClusterKC);
  if (score === undefined) {
    throw new Error(`SPARC target selection is missing kcGraph.relationship from "${sourceClusterKC}" to "${targetClusterKC}"`);
  }
  return score;
}

function mergeWeights(weights: Partial<SparcLearningTargetSelectionWeights> | undefined): SparcLearningTargetSelectionWeights {
  return {
    frontierWeight: finiteOption(weights?.frontierWeight, 'SPARC target selection frontierWeight', DEFAULT_WEIGHTS.frontierWeight),
    coherenceWeight: finiteOption(weights?.coherenceWeight, 'SPARC target selection coherenceWeight', DEFAULT_WEIGHTS.coherenceWeight),
    centralityWeight: finiteOption(weights?.centralityWeight, 'SPARC target selection centralityWeight', DEFAULT_WEIGHTS.centralityWeight),
  };
}

function policyWeights(
  options: SparcLearningTargetSelectionOptions,
  policy: Record<string, unknown> | undefined,
): Partial<SparcLearningTargetSelectionWeights> {
  const frontierWeight = options.weights?.frontierWeight ?? policy?.frontierWeight;
  const coherenceWeight = options.weights?.coherenceWeight ?? policy?.coherenceWeight;
  const centralityWeight = options.weights?.centralityWeight ?? policy?.centralityWeight;
  return {
    ...(frontierWeight !== undefined ? { frontierWeight: Number(frontierWeight) } : {}),
    ...(coherenceWeight !== undefined ? { coherenceWeight: Number(coherenceWeight) } : {}),
    ...(centralityWeight !== undefined ? { centralityWeight: Number(centralityWeight) } : {}),
  };
}

function candidateToFact(candidate: SparcLearningTargetCandidate): SparcWorkingMemoryFact {
  return {
    factType: 'learningTarget.candidate',
    slots: {
      clusterKC: candidate.clusterKC,
      ...(candidate.anchorClusterKC ? { anchorClusterKC: candidate.anchorClusterKC } : {}),
      coverage: candidate.coverage,
      coherenceToAnchor: candidate.coherenceToAnchor,
      frontierScore: candidate.frontierScore,
      centralityScore: candidate.centralityScore,
      priorityScore: candidate.priorityScore,
      eligible: candidate.eligible,
    },
  };
}

function currentTurnCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'session.turnState')
    .map((fact) => nonNegativeIntegerSlot(fact, 'turnCount', 0)));
}

function previousSelectedTarget(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  const selectedFacts = facts.filter((fact) => fact.factType === 'learningTarget.selected');
  return selectedFacts.at(-1);
}

function selectedTargetFact(
  clusterKC: string,
  facts: readonly SparcWorkingMemoryFact[],
): SparcWorkingMemoryFact {
  const previous = previousSelectedTarget(facts);
  const previousClusterKC = previous ? stringSlot(previous, 'clusterKC') : undefined;
  const focusContinues = previousClusterKC === clusterKC;
  const turnCount = currentTurnCount(facts);
  const previousFocusTurnCount = previous ? nonNegativeIntegerSlot(previous, 'focusTurnCount', 0) : 0;
  const previousMoveCycleIndex = previous ? nonNegativeIntegerSlot(previous, 'moveCycleIndex', -1) : -1;
  const firstFocusTurn = focusContinues && previous
    ? nonNegativeIntegerSlot(previous, 'firstFocusTurn', turnCount)
    : turnCount;
  return {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC,
      focusActive: true,
      focusTurnCount: focusContinues ? previousFocusTurnCount + 1 : 0,
      firstFocusTurn,
      moveCycleIndex: previousMoveCycleIndex + 1,
    },
  };
}

export function selectSparcLearningTargetFromFacts(
  facts: readonly SparcWorkingMemoryFact[],
  options: SparcLearningTargetSelectionOptions = {},
): SparcLearningTargetSelection {
  const requiredTargets = collectRequiredTargets(facts);
  const requiredTargetSet = new Set(requiredTargets);
  const coverageByClusterKC = collectCoverageByClusterKC(facts);
  const centralityByClusterKC = collectCentralityByClusterKC(facts);
  const relationships = collectRelationships(facts);
  const policy = findTargetSelectionPolicy(facts);
  const coverageThreshold = finiteOption(
    options.coverageThreshold ?? policy?.coverageThreshold,
    'SPARC target selection coverageThreshold',
    DEFAULT_COVERAGE_THRESHOLD,
  );
  const weights = mergeWeights(policyWeights(options, policy));
  const anchorClusterKC = typeof options.anchorClusterKC === 'string' && options.anchorClusterKC.trim()
    ? options.anchorClusterKC.trim()
    : undefined;
  const excludeClusterKC = typeof options.excludeClusterKC === 'string' && options.excludeClusterKC.trim()
    ? options.excludeClusterKC.trim()
    : undefined;

  if (anchorClusterKC && !requiredTargetSet.has(anchorClusterKC)) {
    throw new Error(`SPARC target selection anchorClusterKC "${anchorClusterKC}" is not a required learning target`);
  }

  const candidates: SparcLearningTargetCandidate[] = requiredTargets.map((clusterKC) => {
    if (!centralityByClusterKC.has(clusterKC)) {
      throw new Error(`SPARC target selection is missing kcGraph.node for "${clusterKC}"`);
    }
    const coverage = coverageByClusterKC.get(clusterKC) ?? 0;
    const coherenceToAnchor = anchorClusterKC ? relationshipStrength(relationships, anchorClusterKC, clusterKC) : 0;
    const frontierScore = anchorClusterKC ? (1 - coverage) * coherenceToAnchor : 0;
    const centralityScore = centralityByClusterKC.get(clusterKC) ?? 0;
    const priorityScore =
      weights.frontierWeight * frontierScore +
      weights.coherenceWeight * coherenceToAnchor +
      weights.centralityWeight * centralityScore;
    return {
      clusterKC,
      ...(anchorClusterKC ? { anchorClusterKC } : {}),
      coverage,
      coherenceToAnchor,
      frontierScore,
      centralityScore,
      priorityScore,
      eligible: clusterKC !== excludeClusterKC && coverage < coverageThreshold,
    };
  });

  const selected = candidates
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => (
      right.priorityScore - left.priorityScore
      || left.clusterKC.localeCompare(right.clusterKC)
    ))[0];

  if (!selected) {
    throw new Error('SPARC target selection could not select an uncovered required learning target');
  }

  return {
    selectedClusterKC: selected.clusterKC,
    candidates,
    facts: [
      ...candidates.map(candidateToFact),
      selectedTargetFact(selected.clusterKC, facts),
    ],
  };
}
