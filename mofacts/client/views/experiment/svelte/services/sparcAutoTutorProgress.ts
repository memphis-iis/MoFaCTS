import type { SparcTrialDisplay } from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';

export const SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY = '__sparcDialogueProgressFacts';
const DEFAULT_COVERAGE_THRESHOLD = 0.8;
const DEFAULT_MISCONCEPTION_THRESHOLD = 0.65;

type SparcFact = {
  readonly factType?: unknown;
  readonly slots?: Record<string, unknown>;
};

export type SparcAutoTutorProgressTarget = {
  readonly id: string;
  readonly label: string;
  readonly coverage: number;
  readonly covered: boolean;
};

export type SparcAutoTutorProgressMisconception = {
  readonly id: string;
  readonly label: string;
  readonly confidence: number;
  readonly active: boolean;
  readonly repaired: boolean;
};

export type SparcAutoTutorProgressSnapshot = {
  readonly available: boolean;
  readonly coverageThreshold: number;
  readonly coveredExpectations: number;
  readonly requiredExpectations: number;
  readonly neededExpectations: number;
  readonly activeMisconceptions: number;
  readonly totalMisconceptions: number;
  readonly maxActiveMisconceptions: number;
  readonly turnCount: number;
  readonly targets: readonly SparcAutoTutorProgressTarget[];
  readonly misconceptions: readonly SparcAutoTutorProgressMisconception[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringSlot(fact: SparcFact, slotName: string): string {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberSlot(fact: SparcFact, slotName: string, fallback: number): number {
  const value = Number(fact.slots?.[slotName]);
  return Number.isFinite(value) ? value : fallback;
}

function unitSlot(fact: SparcFact, slotName: string): number {
  const value = numberSlot(fact, slotName, 0);
  return Math.max(0, Math.min(1, value));
}

function booleanSlot(fact: SparcFact, slotName: string): boolean {
  return fact.slots?.[slotName] === true;
}

function displayFacts(display: SparcTrialDisplay | null | undefined): SparcFact[] {
  const facts = isRecord(display) && Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts
    : [];
  return facts.filter(isRecord) as SparcFact[];
}

function runtimeFacts(runtimeNodeValues: Record<string, unknown> | null | undefined): SparcFact[] {
  const facts = isRecord(runtimeNodeValues)
    ? runtimeNodeValues[SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]
    : [];
  return (Array.isArray(facts) ? facts : []).filter(isRecord) as SparcFact[];
}

function factsByType(facts: readonly SparcFact[], factType: string): SparcFact[] {
  return facts.filter((fact) => fact.factType === factType);
}

function latestFactById(
  facts: readonly SparcFact[],
  factType: string,
  idSlot: string,
): Map<string, SparcFact> {
  const map = new Map<string, SparcFact>();
  for (const fact of factsByType(facts, factType)) {
    const id = stringSlot(fact, idSlot);
    if (id) {
      map.set(id, fact);
    }
  }
  return map;
}

function progressPolicy(facts: readonly SparcFact[], targetCount: number): {
  readonly coverageThreshold: number;
  readonly misconceptionThreshold: number;
  readonly requiredTargetCount: number;
  readonly maxActiveMisconceptions: number;
} {
  const thresholds = factsByType(facts, 'dialogue.thresholds').at(-1);
  const graduation = factsByType(facts, 'dialogue.graduation').at(-1);
  const policy = factsByType(facts, 'controller.targetSelectionPolicy').at(-1);
  const coverageThreshold = numberSlot(thresholds ?? policy ?? {}, 'coverageThreshold', DEFAULT_COVERAGE_THRESHOLD);
  const misconceptionThreshold = numberSlot(thresholds ?? {}, 'misconceptionThreshold', DEFAULT_MISCONCEPTION_THRESHOLD);
  const requiredTargetCount = Math.max(0, Math.min(
    targetCount,
    Math.ceil(numberSlot(graduation ?? {}, 'requiredTargetCount', targetCount)),
  ));
  const maxActiveMisconceptions = Math.max(0, Math.floor(
    numberSlot(graduation ?? {}, 'maxActiveMisconceptions', 0),
  ));
  return {
    coverageThreshold: Math.max(0, Math.min(1, coverageThreshold)),
    misconceptionThreshold: Math.max(0, Math.min(1, misconceptionThreshold)),
    requiredTargetCount,
    maxActiveMisconceptions,
  };
}

function expectationCredit(coverage: number, coverageThreshold: number): number {
  return coverage >= coverageThreshold ? 1 : coverage;
}

export function buildSparcAutoTutorProgressSnapshot(params: {
  readonly display: SparcTrialDisplay | null | undefined;
  readonly runtimeNodeValues?: Record<string, unknown> | null;
}): SparcAutoTutorProgressSnapshot {
  const authoredFacts = displayFacts(params.display);
  const currentFacts = [...authoredFacts, ...runtimeFacts(params.runtimeNodeValues)];
  const scoreByClusterKC = latestFactById(currentFacts, 'learningTarget.score', 'clusterKC');
  const misconceptionScoreById = latestFactById(currentFacts, 'diagnostic.misconceptionScore', 'id');
  const sourceTargets = factsByType(authoredFacts, 'learningTarget.source');
  const sourceMisconceptions = factsByType(authoredFacts, 'diagnostic.misconceptionSource');
  const policy = progressPolicy(currentFacts, sourceTargets.length);
  const targets = sourceTargets.map((fact, index) => {
    const clusterKC = stringSlot(fact, 'clusterKC') || `target-${index + 1}`;
    const score = scoreByClusterKC.get(clusterKC);
    const coverage = score ? unitSlot(score, 'coverage') : 0;
    return {
      id: clusterKC,
      label: stringSlot(fact, 'label') || stringSlot(fact, 'proposition') || `Expectation ${index + 1}`,
      coverage,
      covered: coverage >= policy.coverageThreshold,
    };
  });
  const misconceptions = sourceMisconceptions.map((fact, index) => {
    const id = stringSlot(fact, 'id') || `misconception-${index + 1}`;
    const score = misconceptionScoreById.get(id);
    const confidence = score ? unitSlot(score, 'confidence') : 0;
    return {
      id,
      label: stringSlot(fact, 'label') || stringSlot(fact, 'description') || `Misconception ${index + 1}`,
      confidence,
      active: score ? booleanSlot(score, 'current') && confidence >= policy.misconceptionThreshold : false,
      repaired: score ? booleanSlot(score, 'repaired') : false,
    };
  });
  const completionState = factsByType(currentFacts, 'controller.completionState').at(-1);
  const turnState = factsByType(currentFacts, 'session.turnState').at(-1);
  return {
    available: targets.length > 0 || misconceptions.length > 0,
    coverageThreshold: policy.coverageThreshold,
    coveredExpectations: targets.reduce(
      (sum, target) => sum + expectationCredit(target.coverage, policy.coverageThreshold),
      0,
    ),
    requiredExpectations: targets.length,
    neededExpectations: policy.requiredTargetCount,
    activeMisconceptions: misconceptions.filter((misconception) => misconception.active).length,
    totalMisconceptions: misconceptions.length,
    maxActiveMisconceptions: policy.maxActiveMisconceptions,
    turnCount: Math.max(0, Math.floor(numberSlot(completionState ?? turnState ?? {}, 'turnCount', 0))),
    targets,
    misconceptions,
  };
}
