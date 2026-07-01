import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

export type SparcMatchBand = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type SparcCoverageBand = 'LOW' | 'MEDIUM' | 'HIGH';
export type SparcStudentAbilityBand = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
export type SparcStudentVerbosityBand = 'LOW' | 'MEDIUM' | 'HIGH';

export function bandSparcBagMatch(score: number): SparcMatchBand {
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('SPARC bag-match score must be a finite number from 0 to 1');
  }
  if (score < 0.2) return 'NONE';
  if (score < 0.4) return 'LOW';
  if (score < 0.6) return 'MEDIUM';
  if (score < 0.8) return 'HIGH';
  return 'VERY_HIGH';
}

export function bandSparcCurrentExpectationCoverage(score: number): SparcCoverageBand {
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('SPARC current expectation coverage must be a finite number from 0 to 1');
  }
  if (score < 0.3) return 'LOW';
  if (score < 0.8) return 'MEDIUM';
  return 'HIGH';
}

export function bandSparcStudentAbility(score: number): SparcStudentAbilityBand {
  if (!Number.isFinite(score) || score < -1 || score > 1) {
    throw new Error('SPARC student ability score must be a finite number from -1 to 1');
  }
  if (score < 0) return 'VERY_LOW';
  if (score < 0.3) return 'LOW';
  if (score < 0.8) return 'MEDIUM';
  return 'HIGH';
}

export function bandSparcStudentVerbosity(wordCount: number): SparcStudentVerbosityBand {
  if (!Number.isFinite(wordCount) || wordCount < 0) {
    throw new Error('SPARC student verbosity word count must be a non-negative finite number');
  }
  if (wordCount < 12) return 'LOW';
  if (wordCount < 30) return 'MEDIUM';
  return 'HIGH';
}

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string | undefined {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteSlot(fact: SparcWorkingMemoryFact, slotName: string): number | undefined {
  const value = fact.slots?.[slotName];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`SPARC fact "${fact.factType}" slot "${slotName}" must be a finite number`);
  }
  return numberValue;
}

function roundSignal(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function selectedClusterKC(facts: readonly SparcWorkingMemoryFact[]): string | undefined {
  return facts
    .filter((fact) => fact.factType === 'learningTarget.selected')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter(Boolean)
    .at(-1);
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
    coverage.set(clusterKC, finiteSlot(fact, 'coverage') ?? 0);
  }
  return coverage;
}

function requiredClusterKCs(facts: readonly SparcWorkingMemoryFact[]): readonly string[] {
  return [...new Set(facts
    .filter((fact) => fact.factType === 'learningTarget.source')
    .map((fact) => stringSlot(fact, 'clusterKC'))
    .filter(Boolean) as string[])];
}

function misconceptionIds(facts: readonly SparcWorkingMemoryFact[]): readonly string[] {
  const sourceIds = facts
    .filter((fact) => fact.factType === 'diagnostic.misconceptionSource')
    .map((fact) => stringSlot(fact, 'id'))
    .filter(Boolean) as string[];
  if (sourceIds.length > 0) {
    return [...new Set(sourceIds)];
  }
  return [...new Set(facts
    .filter((fact) => fact.factType === 'diagnostic.misconceptionScore')
    .map((fact) => stringSlot(fact, 'id'))
    .filter(Boolean) as string[])];
}

function misconceptionConfidenceById(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const confidence = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'diagnostic.misconceptionScore') {
      continue;
    }
    const id = stringSlot(fact, 'id');
    if (!id) {
      throw new Error('SPARC diagnostic.misconceptionScore fact requires id');
    }
    confidence.set(id, finiteSlot(fact, 'confidence') ?? 0);
  }
  return confidence;
}

function latestCumulativeLearnerWordCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'dialogue.learnerWordCount')
    .map((fact) => finiteSlot(fact, 'cumulative') ?? 0));
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : roundSignal(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function deriveSparcActiveSelectorSignalFacts(
  facts: readonly SparcWorkingMemoryFact[],
): readonly SparcWorkingMemoryFact[] {
  const result: SparcWorkingMemoryFact[] = [];
  const coverage = coverageByClusterKC(facts);
  const selectedTarget = selectedClusterKC(facts);
  if (selectedTarget) {
    const value = coverage.get(selectedTarget) ?? 0;
    result.push({
      factType: 'selector.currentExpectationCoverage',
      slots: {
        clusterKC: selectedTarget,
        value,
        band: bandSparcCurrentExpectationCoverage(value),
      },
    });
  }

  const clusterKCs = requiredClusterKCs(facts);
  const expectationCoverageMean = mean(clusterKCs.map((clusterKC) => coverage.get(clusterKC) ?? 0));
  const misconceptionConfidence = misconceptionConfidenceById(facts);
  const misconceptionConfidenceMean = mean(misconceptionIds(facts).map((id) => misconceptionConfidence.get(id) ?? 0));
  const studentAbilityScore = roundSignal(expectationCoverageMean - misconceptionConfidenceMean);
  result.push({
    factType: 'selector.studentAbility',
    slots: {
      value: studentAbilityScore,
      band: bandSparcStudentAbility(studentAbilityScore),
      expectationCoverageMean,
      misconceptionConfidenceMean,
    },
  });

  const wordCount = latestCumulativeLearnerWordCount(facts);
  result.push({
    factType: 'selector.studentVerbosity',
    slots: {
      wordCount,
      band: bandSparcStudentVerbosity(wordCount),
    },
  });

  return result;
}
