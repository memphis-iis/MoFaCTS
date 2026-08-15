import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

export type SparcInstructionalTargetKind = 'expectation' | 'misconception';

export type SparcExpectationCandidate = {
  readonly targetKind: 'expectation';
  readonly targetId: string;
  readonly targetKey: string;
  readonly anchorClusterKC?: string;
  readonly coverage: number;
  readonly goalValue: number;
  readonly instructionalNeed: number;
  readonly coherenceToAnchor: number;
  readonly frontierScore: number;
  readonly centralityScore: number;
  readonly structuralPriorityScore: number;
  readonly priorityScore: number;
  readonly eligible: boolean;
  readonly rankWithinKind: number;
  readonly isMaximumWithinKind: boolean;
};

export type SparcMisconceptionCandidate = {
  readonly targetKind: 'misconception';
  readonly targetId: string;
  readonly targetKey: string;
  readonly supportStrength: number;
  readonly goalValue: number;
  readonly instructionalNeed: number;
  readonly priorityScore: number;
  readonly eligible: boolean;
  readonly rankWithinKind: number;
  readonly isMaximumWithinKind: boolean;
};

export type SparcInstructionalCandidateWeights = {
  readonly frontierWeight: number;
  readonly coherenceWeight: number;
  readonly centralityWeight: number;
};

export type SparcInstructionalCandidateOptions = {
  readonly coverageThreshold?: number;
  readonly misconceptionThreshold?: number;
  readonly anchorClusterKC?: string;
  readonly excludeClusterKC?: string;
  readonly weights?: Partial<SparcInstructionalCandidateWeights>;
};

export type SparcInstructionalCandidateProjection = {
  readonly snapshotId: string;
  readonly coverageThreshold: number;
  readonly misconceptionThreshold: number;
  readonly expectations: readonly SparcExpectationCandidate[];
  readonly misconceptions: readonly SparcMisconceptionCandidate[];
  readonly maximumExpectation?: SparcExpectationCandidate;
  readonly maximumMisconception?: SparcMisconceptionCandidate;
  readonly facts: readonly SparcWorkingMemoryFact[];
};

const DEFAULT_COVERAGE_THRESHOLD = 0.8;
const DEFAULT_MISCONCEPTION_THRESHOLD = 0.2;
const DEFAULT_WEIGHTS: SparcInstructionalCandidateWeights = {
  frontierWeight: 0.5,
  coherenceWeight: 0.3,
  centralityWeight: 0.2,
};

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberSlot(fact: SparcWorkingMemoryFact, slotName: string, label: string): number {
  const value = Number(fact.slots?.[slotName]);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function finiteOption(value: unknown, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${label} must be a finite number`);
  return normalized;
}

function unitInterval(value: number, label: string): number {
  if (value < 0 || value > 1) throw new Error(`${label} must be from 0 to 1`);
  return value;
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function singletonSlots(
  facts: readonly SparcWorkingMemoryFact[],
  factType: string,
): Readonly<Record<string, unknown>> | undefined {
  const matches = facts.filter((fact) => fact.factType === factType);
  if (matches.length > 1) throw new Error(`SPARC candidate projection requires at most one ${factType} fact`);
  return matches[0]?.slots;
}

function requiredExpectationIds(facts: readonly SparcWorkingMemoryFact[]): string[] {
  const ids = facts
    .filter((fact) => fact.factType === 'autotutor.expectation')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) throw new Error('SPARC candidate projection requires at least one clean autotutor.expectation fact');
  if (new Set(ids).size !== ids.length) throw new Error('SPARC expectation clusterKC values must be unique');
  return ids;
}

function authoredMisconceptionIds(facts: readonly SparcWorkingMemoryFact[]): string[] {
  const ids = facts
    .filter((fact) => fact.factType === 'autotutor.misconception')
    .map((fact) => stringSlot(fact, 'id'))
    .filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) throw new Error('SPARC misconception ids must be unique');
  return ids;
}

function latestScores(
  facts: readonly SparcWorkingMemoryFact[],
  factType: string,
  idSlot: string,
  valueSlot: string,
): Map<string, number> {
  const values = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== factType) continue;
    const id = stringSlot(fact, idSlot);
    if (!id) throw new Error(`SPARC ${factType} fact requires ${idSlot}`);
    values.set(id, numberSlot(fact, valueSlot, `SPARC ${factType} "${id}" ${valueSlot}`));
  }
  return values;
}

function centralityByExpectation(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const values = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'kcGraph.node') continue;
    const id = stringSlot(fact, 'clusterKC');
    if (!id) throw new Error('SPARC kcGraph.node fact requires clusterKC');
    values.set(id, numberSlot(fact, 'centrality', `SPARC kcGraph.node "${id}" centrality`));
  }
  return values;
}

function relationshipMap(facts: readonly SparcWorkingMemoryFact[]): Map<string, Map<string, number>> {
  const relationships = new Map<string, Map<string, number>>();
  for (const fact of facts) {
    if (fact.factType !== 'kcGraph.relationship') continue;
    const source = stringSlot(fact, 'sourceClusterKC');
    const target = stringSlot(fact, 'targetClusterKC');
    if (!source || !target) throw new Error('SPARC kcGraph.relationship facts require sourceClusterKC and targetClusterKC');
    const targets = relationships.get(source) ?? new Map<string, number>();
    targets.set(target, numberSlot(fact, 'strength', `SPARC kcGraph.relationship "${source}" -> "${target}" strength`));
    relationships.set(source, targets);
  }
  return relationships;
}

function relationshipStrength(
  relationships: Map<string, Map<string, number>>,
  source: string,
  target: string,
): number {
  if (source === target) return 1;
  const value = relationships.get(source)?.get(target);
  if (value === undefined) throw new Error(`SPARC candidate projection is missing kcGraph.relationship from "${source}" to "${target}"`);
  return value;
}

function weights(
  options: SparcInstructionalCandidateOptions,
  policy: Readonly<Record<string, unknown>> | undefined,
): SparcInstructionalCandidateWeights {
  return {
    frontierWeight: finiteOption(options.weights?.frontierWeight ?? policy?.frontierWeight, 'SPARC frontierWeight', DEFAULT_WEIGHTS.frontierWeight),
    coherenceWeight: finiteOption(options.weights?.coherenceWeight ?? policy?.coherenceWeight, 'SPARC coherenceWeight', DEFAULT_WEIGHTS.coherenceWeight),
    centralityWeight: finiteOption(options.weights?.centralityWeight ?? policy?.centralityWeight, 'SPARC centralityWeight', DEFAULT_WEIGHTS.centralityWeight),
  };
}

function rankedExpectations(
  candidates: readonly Omit<SparcExpectationCandidate, 'rankWithinKind' | 'isMaximumWithinKind'>[],
): SparcExpectationCandidate[] {
  const rankedIds = candidates
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => right.priorityScore - left.priorityScore || left.targetId.localeCompare(right.targetId))
    .map((candidate) => candidate.targetId);
  return candidates.map((candidate) => {
    const index = rankedIds.indexOf(candidate.targetId);
    return {
      ...candidate,
      rankWithinKind: index < 0 ? 0 : index + 1,
      isMaximumWithinKind: index === 0,
    };
  });
}

function rankedMisconceptions(
  candidates: readonly Omit<SparcMisconceptionCandidate, 'rankWithinKind' | 'isMaximumWithinKind'>[],
): SparcMisconceptionCandidate[] {
  const rankedIds = candidates
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => right.supportStrength - left.supportStrength || left.targetId.localeCompare(right.targetId))
    .map((candidate) => candidate.targetId);
  return candidates.map((candidate) => {
    const index = rankedIds.indexOf(candidate.targetId);
    return {
      ...candidate,
      rankWithinKind: index < 0 ? 0 : index + 1,
      isMaximumWithinKind: index === 0,
    };
  });
}

function candidateFact(
  snapshotId: string,
  candidate: SparcExpectationCandidate | SparcMisconceptionCandidate,
): SparcWorkingMemoryFact {
  return {
    factType: 'instructional.candidate',
    slots: {
      snapshotId,
      targetKind: candidate.targetKind,
      targetId: candidate.targetId,
      targetKey: candidate.targetKey,
      currentValue: candidate.targetKind === 'expectation' ? candidate.coverage : candidate.supportStrength,
      goalValue: candidate.goalValue,
      instructionalNeed: candidate.instructionalNeed,
      priorityScore: candidate.priorityScore,
      eligible: candidate.eligible,
      rankWithinKind: candidate.rankWithinKind,
      isMaximumWithinKind: candidate.isMaximumWithinKind,
      ...(candidate.targetKind === 'expectation' ? {
        coverage: candidate.coverage,
        coherenceToAnchor: candidate.coherenceToAnchor,
        frontierScore: candidate.frontierScore,
        centralityScore: candidate.centralityScore,
        structuralPriorityScore: candidate.structuralPriorityScore,
      } : {
        supportStrength: candidate.supportStrength,
      }),
    },
  };
}

export function projectSparcInstructionalCandidates(params: {
  readonly snapshotId: string;
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly options?: SparcInstructionalCandidateOptions;
}): SparcInstructionalCandidateProjection {
  const snapshotId = params.snapshotId.trim();
  if (!snapshotId) throw new Error('SPARC candidate projection requires snapshotId');
  const options = params.options ?? {};
  const policy = singletonSlots(params.facts, 'controller.targetSelectionPolicy');
  const thresholds = singletonSlots(params.facts, 'dialogue.thresholds');
  const coverageThreshold = unitInterval(finiteOption(
    options.coverageThreshold ?? thresholds?.coverageThreshold ?? policy?.coverageThreshold,
    'SPARC coverageThreshold',
    DEFAULT_COVERAGE_THRESHOLD,
  ), 'SPARC coverageThreshold');
  const misconceptionThreshold = unitInterval(finiteOption(
    options.misconceptionThreshold ?? thresholds?.misconceptionThreshold ?? policy?.misconceptionThreshold,
    'SPARC misconceptionThreshold',
    DEFAULT_MISCONCEPTION_THRESHOLD,
  ), 'SPARC misconceptionThreshold');
  const expectationIds = requiredExpectationIds(params.facts);
  const expectationSet = new Set(expectationIds);
  const misconceptionIds = authoredMisconceptionIds(params.facts);
  const coverage = latestScores(params.facts, 'learningTarget.score', 'clusterKC', 'coverage');
  const support = latestScores(params.facts, 'diagnostic.misconceptionScore', 'id', 'supportStrength');
  const centrality = centralityByExpectation(params.facts);
  const relationships = relationshipMap(params.facts);
  const configuredWeights = weights(options, policy);
  const anchorClusterKC = options.anchorClusterKC?.trim() || undefined;
  const excludeClusterKC = options.excludeClusterKC?.trim() || undefined;
  if (anchorClusterKC && !expectationSet.has(anchorClusterKC)) {
    throw new Error(`SPARC anchorClusterKC "${anchorClusterKC}" is not a required expectation`);
  }

  const expectations = rankedExpectations(expectationIds.map((targetId) => {
    if (!centrality.has(targetId)) throw new Error(`SPARC candidate projection is missing kcGraph.node for "${targetId}"`);
    const currentCoverage = coverage.get(targetId) ?? 0;
    const instructionalNeed = coverageThreshold > 0
      ? rounded(Math.max(0, coverageThreshold - currentCoverage) / coverageThreshold)
      : 0;
    const coherenceToAnchor = anchorClusterKC
      ? relationshipStrength(relationships, anchorClusterKC, targetId)
      : 0;
    const frontierScore = anchorClusterKC ? instructionalNeed * coherenceToAnchor : 0;
    const centralityScore = centrality.get(targetId) ?? 0;
    const structuralPriorityScore = configuredWeights.frontierWeight * frontierScore
      + configuredWeights.coherenceWeight * coherenceToAnchor
      + configuredWeights.centralityWeight * centralityScore;
    return {
      targetKind: 'expectation' as const,
      targetId,
      targetKey: `expectation:${targetId}`,
      ...(anchorClusterKC ? { anchorClusterKC } : {}),
      coverage: currentCoverage,
      goalValue: coverageThreshold,
      instructionalNeed,
      coherenceToAnchor,
      frontierScore,
      centralityScore,
      structuralPriorityScore,
      // Prefer the most structurally ready expectation the learner is already
      // closest to meeting; remaining need is a penalty, not a reward.
      priorityScore: structuralPriorityScore - instructionalNeed,
      eligible: targetId !== excludeClusterKC && currentCoverage < coverageThreshold,
    };
  }));

  const misconceptions = rankedMisconceptions(misconceptionIds.map((targetId) => {
    const supportStrength = support.get(targetId) ?? 0;
    const instructionalNeed = misconceptionThreshold < 1
      ? rounded(Math.max(0, supportStrength - misconceptionThreshold) / (1 - misconceptionThreshold))
      : 0;
    return {
      targetKind: 'misconception' as const,
      targetId,
      targetKey: `misconception:${targetId}`,
      supportStrength,
      goalValue: misconceptionThreshold,
      instructionalNeed,
      priorityScore: supportStrength,
      eligible: supportStrength >= misconceptionThreshold,
    };
  }));
  const maximumExpectation = expectations.find((candidate) => candidate.isMaximumWithinKind);
  const maximumMisconception = misconceptions.find((candidate) => candidate.isMaximumWithinKind);
  const facts: SparcWorkingMemoryFact[] = [{
    factType: 'instructional.assessmentSnapshot',
    slots: { snapshotId },
  }, {
    factType: 'instructional.thresholds',
    slots: { snapshotId, coverageThreshold, misconceptionThreshold },
  },
  ...expectations.map((candidate) => candidateFact(snapshotId, candidate)),
  ...misconceptions.map((candidate) => candidateFact(snapshotId, candidate))];
  return {
    snapshotId,
    coverageThreshold,
    misconceptionThreshold,
    expectations,
    misconceptions,
    ...(maximumExpectation ? { maximumExpectation } : {}),
    ...(maximumMisconception ? { maximumMisconception } : {}),
    facts,
  };
}
