import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

export type SparcControllerDerivedFactOptions = {
  readonly includeCurrentTurn?: boolean;
};

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteSlot(fact: SparcWorkingMemoryFact, slotName: string, label: string): number {
  const value = Number(fact.slots?.[slotName]);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function optionalFiniteSlot(fact: SparcWorkingMemoryFact, slotName: string): number | undefined {
  const rawValue = fact.slots?.[slotName];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return undefined;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`SPARC fact "${fact.factType}" slot "${slotName}" must be a finite number`);
  }
  return value;
}

function wordCount(value: unknown): number {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.split(/\s+/).length : 0;
}

function currentLearnerWordCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return facts
    .filter((fact) => (
      fact.factType === 'interface-event'
      && fact.slots?.eventType === 'response-submitted'
    ))
    .reduce((sum, fact) => sum + wordCount(fact.slots?.input), 0);
}

function previousLearnerWordCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'dialogue.learnerWordCount')
    .map((fact) => finiteSlot(fact, 'cumulative', 'SPARC dialogue.learnerWordCount cumulative')));
}

function previousTurnCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'session.turnState')
    .map((fact) => finiteSlot(fact, 'turnCount', 'SPARC session.turnState turnCount')));
}

function completionCoverageThreshold(facts: readonly SparcWorkingMemoryFact[]): number {
  const thresholdFact = facts.find((fact) => fact.factType === 'dialogue.thresholds');
  const threshold = thresholdFact ? optionalFiniteSlot(thresholdFact, 'coverageThreshold') : undefined;
  if (threshold !== undefined) {
    return threshold;
  }
  const targetSelectionPolicy = facts.find((fact) => fact.factType === 'controller.targetSelectionPolicy');
  return targetSelectionPolicy ? optionalFiniteSlot(targetSelectionPolicy, 'coverageThreshold') ?? 0.8 : 0.8;
}

function graduationPolicy(facts: readonly SparcWorkingMemoryFact[], targetCount: number): {
  readonly requiredTargetCount: number;
  readonly maxTurns?: number;
} {
  const graduation = facts.find((fact) => fact.factType === 'dialogue.graduation');
  const requiredTargetCount = graduation
    ? optionalFiniteSlot(graduation, 'requiredTargetCount') ?? targetCount
    : targetCount;
  const maxTurns = graduation ? optionalFiniteSlot(graduation, 'maxTurns') : undefined;
  return {
    requiredTargetCount: Math.max(0, Math.min(targetCount, Math.ceil(requiredTargetCount))),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
  };
}

function hasCurrentLearnerTurn(facts: readonly SparcWorkingMemoryFact[]): boolean {
  return facts.some((fact) => (
    fact.factType === 'interface-event'
    && fact.slots?.eventType === 'response-submitted'
    && wordCount(fact.slots?.input) > 0
  ));
}

function requiredClusterKCs(facts: readonly SparcWorkingMemoryFact[]): string[] {
  const values = facts
    .filter((fact) => fact.factType === 'autotutor.expectation')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter(Boolean) as string[];
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 0) {
    throw new Error('SPARC controller derived facts require at least one clean autotutor.expectation fact');
  }
  return uniqueValues;
}

function coverageByClusterKC(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'learningTarget.score') {
      continue;
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    if (!clusterKC) {
      throw new Error('SPARC learningTarget.score fact requires clusterKC');
    }
    coverage.set(clusterKC, optionalFiniteSlot(fact, 'coverage') ?? 0);
  }
  return coverage;
}

function meanRequiredCoverage(facts: readonly SparcWorkingMemoryFact[]): number {
  const clusterKCs = requiredClusterKCs(facts);
  const coverage = coverageByClusterKC(facts);
  const sum = clusterKCs.reduce((total, clusterKC) => total + (coverage.get(clusterKC) ?? 0), 0);
  return Math.round((sum / clusterKCs.length) * 1_000_000) / 1_000_000;
}

export function deriveSparcControllerFacts(
  facts: readonly SparcWorkingMemoryFact[],
  options: SparcControllerDerivedFactOptions = {},
): SparcWorkingMemoryFact[] {
  const includeCurrentTurn = options.includeCurrentTurn !== false;
  const currentTurn = includeCurrentTurn && hasCurrentLearnerTurn(facts);
  const clusterKCs = requiredClusterKCs(facts);
  const coverage = coverageByClusterKC(facts);
  const coverageThreshold = completionCoverageThreshold(facts);
  const coveredTargetCount = clusterKCs
    .filter((clusterKC) => (coverage.get(clusterKC) ?? 0) >= coverageThreshold)
    .length;
  const policy = graduationPolicy(facts, clusterKCs.length);
  const turnCount = previousTurnCount(facts) + (currentTurn ? 1 : 0);
  const maxTurnsReached = policy.maxTurns !== undefined && turnCount >= policy.maxTurns;
  const requiredCoverageReached = coveredTargetCount >= policy.requiredTargetCount;
  const completed = requiredCoverageReached || maxTurnsReached;
  return [{
    factType: 'dialogue.learnerWordCount',
    slots: {
      cumulative: previousLearnerWordCount(facts) + (includeCurrentTurn ? currentLearnerWordCount(facts) : 0),
    },
  }, {
    factType: 'learningTarget.coverageMean',
    slots: {
      scope: 'required',
      value: meanRequiredCoverage(facts),
    },
  }, {
    factType: 'session.turnState',
    slots: {
      turnCount,
    },
  }, {
    factType: 'controller.completionState',
    slots: {
      completed,
      reason: requiredCoverageReached ? 'required-coverage' : (maxTurnsReached ? 'max-turns' : 'in-progress'),
      coveredTargetCount,
      requiredTargetCount: policy.requiredTargetCount,
      totalTargetCount: clusterKCs.length,
      coverageThreshold,
      turnCount,
      ...(policy.maxTurns !== undefined ? { maxTurns: policy.maxTurns } : {}),
    },
  }];
}
