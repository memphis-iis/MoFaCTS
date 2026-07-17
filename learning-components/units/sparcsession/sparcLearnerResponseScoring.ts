import { createSparcStableWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcStateTransition,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcLearningTargetScoreInput = {
  readonly clusterKC: string;
  readonly coverage: number;
};

export type SparcDiagnosticMisconceptionScoreInput = {
  readonly id: string;
  readonly supportStrength: number;
};

export type SparcEvidenceDirection = 'supports' | 'contradicts' | 'unaddressed';

export type SparcLearningTargetEvidence = {
  readonly clusterKC: string;
  readonly evidenceDirection: SparcEvidenceDirection;
  readonly evidenceStrength: number;
};

export type SparcDiagnosticMisconceptionEvidence = {
  readonly id: string;
  readonly evidenceDirection: SparcEvidenceDirection;
  readonly evidenceStrength: number;
};

export type SparcLearnerResponseEvidenceEnvelope = {
  readonly learningTargetEvaluations: readonly SparcLearningTargetEvidence[];
  readonly diagnosticMisconceptionEvaluations: readonly SparcDiagnosticMisconceptionEvidence[];
  readonly learnerContribution: {
    readonly type: 'answer' | 'question' | 'off-task' | 'other';
    readonly confidence?: number;
    readonly streakCount?: number;
  };
  readonly learnerQuestion?: {
    readonly contentFocused: boolean;
  };
};

export type SparcLearnerResponseScoringResult = {
  readonly learningTargetScores?: readonly SparcLearningTargetScoreInput[];
  readonly diagnosticMisconceptionScores?: readonly SparcDiagnosticMisconceptionScoreInput[];
  readonly learnerContribution?: {
    readonly type: 'answer' | 'question' | 'off-task' | 'other';
    readonly confidence?: number;
    readonly streakCount?: number;
  };
  readonly learnerQuestion?: {
    readonly contentFocused: boolean;
  };
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function requireUnitScore(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
  }
  return numberValue;
}

function stringSlot(fact: SparcWorkingMemoryFact, slotName: string): string {
  const value = fact.slots?.[slotName];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function knownLearningTargetClusterKcs(facts: readonly SparcWorkingMemoryFact[]): Set<string> {
  return new Set(facts.flatMap((fact) => {
    if (fact.factType !== 'autotutor.expectation') {
      return [];
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    return clusterKC ? [clusterKC] : [];
  }));
}

function knownMisconceptionIds(facts: readonly SparcWorkingMemoryFact[]): Set<string> {
  return new Set(facts.flatMap((fact) => {
    if (fact.factType !== 'autotutor.misconception') {
      return [];
    }
    const id = stringSlot(fact, 'id');
    return id ? [id] : [];
  }));
}

function previousLearningTargetCoverage(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'learningTarget.score') {
      continue;
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    if (!clusterKC) {
      continue;
    }
    const coverage = requireUnitScore(fact.slots?.coverage, `SPARC prior learningTarget.score "${clusterKC}" coverage`);
    scores.set(clusterKC, Math.max(scores.get(clusterKC) ?? 0, coverage));
  }
  return scores;
}

function previousMisconceptionSupportStrength(facts: readonly SparcWorkingMemoryFact[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const fact of facts) {
    if (fact.factType !== 'diagnostic.misconceptionScore') {
      continue;
    }
    const id = stringSlot(fact, 'id');
    if (!id) {
      continue;
    }
    scores.set(id, requireUnitScore(
      fact.slots?.supportStrength,
      `SPARC prior diagnostic.misconceptionScore "${id}" supportStrength`,
    ));
  }
  return scores;
}

function requireEvidenceDirection(value: unknown, label: string): SparcEvidenceDirection {
  if (value !== 'supports' && value !== 'contradicts' && value !== 'unaddressed') {
    throw new Error(`${label} must be supports, contradicts, or unaddressed`);
  }
  return value;
}

function requireEvidenceStrength(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
  }
  return value;
}

function requireExactEvidenceId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function completeEvidenceById<T>(params: {
  readonly evaluations: readonly T[];
  readonly identity: (evaluation: T) => unknown;
  readonly knownIds: ReadonlySet<string>;
  readonly label: string;
}): Map<string, T> {
  if (!Array.isArray(params.evaluations)) {
    throw new Error(`SPARC learner-response evidence ${params.label} evaluations must be an array`);
  }
  const evaluationsById = new Map<string, T>();
  for (const evaluation of params.evaluations) {
    const id = requireExactEvidenceId(params.identity(evaluation), `SPARC learner-response evidence ${params.label} id`);
    if (!params.knownIds.has(id)) {
      throw new Error(`SPARC learner-response evidence references unknown ${params.label} "${id}"`);
    }
    if (evaluationsById.has(id)) {
      throw new Error(`SPARC learner-response evidence contains duplicate ${params.label} "${id}"`);
    }
    evaluationsById.set(id, evaluation);
  }
  for (const id of params.knownIds) {
    if (!evaluationsById.has(id)) {
      throw new Error(`SPARC learner-response evidence is missing ${params.label} "${id}"`);
    }
  }
  return evaluationsById;
}

function validatedEvidence(params: {
  readonly direction: unknown;
  readonly strength: unknown;
  readonly label: string;
}): {
  readonly direction: SparcEvidenceDirection;
  readonly strength: number;
} {
  const direction = requireEvidenceDirection(params.direction, `${params.label} evidenceDirection`);
  const strength = requireEvidenceStrength(params.strength, `${params.label} evidenceStrength`);
  if (direction !== 'unaddressed' && strength === 0) {
    throw new Error(`${params.label} evidenceStrength must be greater than 0 when evidenceDirection is ${direction}`);
  }
  if (direction === 'unaddressed' && strength !== 0) {
    throw new Error(`${params.label} evidenceStrength must be 0 when evidenceDirection is unaddressed`);
  }
  return { direction, strength };
}

export function reduceSparcLearnerResponseEvidence(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly evidence: SparcLearnerResponseEvidenceEnvelope;
}): SparcLearnerResponseScoringResult {
  const knownClusterKcs = knownLearningTargetClusterKcs(params.facts);
  const knownMisconceptions = knownMisconceptionIds(params.facts);
  const previousCoverage = previousLearningTargetCoverage(params.facts);
  const previousSupportStrength = previousMisconceptionSupportStrength(params.facts);
  const learningTargetEvaluations = completeEvidenceById({
    evaluations: params.evidence.learningTargetEvaluations,
    identity: (evaluation) => evaluation.clusterKC,
    knownIds: knownClusterKcs,
    label: 'learning target clusterKC',
  });
  const misconceptionEvaluations = completeEvidenceById({
    evaluations: params.evidence.diagnosticMisconceptionEvaluations,
    identity: (evaluation) => evaluation.id,
    knownIds: knownMisconceptions,
    label: 'diagnostic misconception id',
  });
  const learningTargetScores: SparcLearningTargetScoreInput[] = [];
  const diagnosticMisconceptionScores: SparcDiagnosticMisconceptionScoreInput[] = [];
  const validatedLearningTargetEvidence = new Map<string, ReturnType<typeof validatedEvidence>>();
  const validatedMisconceptionEvidence = new Map<string, ReturnType<typeof validatedEvidence>>();

  for (const clusterKC of knownClusterKcs) {
    const evaluation = learningTargetEvaluations.get(clusterKC)!;
    const evidence = validatedEvidence({
      direction: evaluation.evidenceDirection,
      strength: evaluation.evidenceStrength,
      label: `SPARC learning target evidence "${clusterKC}"`,
    });
    validatedLearningTargetEvidence.set(clusterKC, evidence);
    if (evidence.direction === 'supports' && evidence.strength > (previousCoverage.get(clusterKC) ?? 0)) {
      learningTargetScores.push({ clusterKC, coverage: evidence.strength });
    }
  }

  for (const id of knownMisconceptions) {
    const evaluation = misconceptionEvaluations.get(id)!;
    const evidence = validatedEvidence({
      direction: evaluation.evidenceDirection,
      strength: evaluation.evidenceStrength,
      label: `SPARC diagnostic misconception evidence "${id}"`,
    });
    validatedMisconceptionEvidence.set(id, evidence);
    const priorStrength = previousSupportStrength.get(id) ?? 0;
    if (evidence.direction === 'supports' && evidence.strength !== priorStrength) {
      diagnosticMisconceptionScores.push({ id, supportStrength: evidence.strength });
    } else if (evidence.direction === 'contradicts' && priorStrength !== 0) {
      diagnosticMisconceptionScores.push({ id, supportStrength: 0 });
    }
  }

  const contributionType = params.evidence.learnerContribution?.type;
  if (contributionType !== 'answer' && contributionType !== 'question' && contributionType !== 'off-task' && contributionType !== 'other') {
    throw new Error('SPARC learner-response evidence learnerContribution.type is invalid');
  }
  if (contributionType === 'off-task') {
    const inconsistentInstructionalEvidence = [
      ...validatedLearningTargetEvidence.values(),
      ...validatedMisconceptionEvidence.values(),
    ].some((evidence) => evidence.direction !== 'unaddressed' || evidence.strength !== 0);
    if (inconsistentInstructionalEvidence) {
      throw new Error('SPARC learner-response evidence off-task contribution must leave every instructional proposition unaddressed');
    }
  }
  if (contributionType === 'question' && !params.evidence.learnerQuestion) {
    throw new Error('SPARC learner question metadata is required when learnerContribution.type is question');
  }
  if (
    contributionType === 'question'
    && typeof params.evidence.learnerQuestion?.contentFocused !== 'boolean'
  ) {
    throw new Error('SPARC learner question contentFocused must be boolean');
  }

  return {
    learningTargetScores,
    ...(diagnosticMisconceptionScores.length > 0 ? { diagnosticMisconceptionScores } : {}),
    learnerContribution: {
      type: contributionType,
      ...(params.evidence.learnerContribution.confidence !== undefined
        ? {
            confidence: requireUnitScore(
              params.evidence.learnerContribution.confidence,
              'SPARC dialogue learner contribution confidence',
            ),
          }
        : {}),
      ...(params.evidence.learnerContribution.streakCount !== undefined
        ? { streakCount: params.evidence.learnerContribution.streakCount }
        : {}),
    },
    ...(contributionType === 'question' && params.evidence.learnerQuestion
      ? { learnerQuestion: { contentFocused: params.evidence.learnerQuestion.contentFocused } }
      : {}),
  };
}

function learningTargetScoreFact(params: {
  readonly input: SparcLearningTargetScoreInput;
  readonly priorCoverage: number;
}): SparcWorkingMemoryFact {
  const clusterKC = requireNonBlank(params.input.clusterKC, 'SPARC learning target score clusterKC');
  const coverage = Math.max(
    params.priorCoverage,
    requireUnitScore(params.input.coverage, `SPARC learning target score "${clusterKC}" coverage`),
  );
  return {
    factType: 'learningTarget.score',
    slots: {
      clusterKC,
      coverage,
    },
  };
}

function misconceptionScoreFact(input: SparcDiagnosticMisconceptionScoreInput): SparcWorkingMemoryFact {
  const id = requireNonBlank(input.id, 'SPARC diagnostic misconception score id');
  return {
    factType: 'diagnostic.misconceptionScore',
    slots: {
      id,
      supportStrength: requireUnitScore(input.supportStrength, `SPARC diagnostic misconception score "${id}" supportStrength`),
    },
  };
}

function uniqueUpdatesById<T>(params: {
  readonly inputs: readonly T[];
  readonly identity: (input: T) => string;
  readonly knownIds: ReadonlySet<string>;
  readonly label: string;
}): Map<string, T> {
  const updates = new Map<string, T>();
  for (const input of params.inputs) {
    const id = requireNonBlank(params.identity(input), `${params.label} id`);
    if (!params.knownIds.has(id)) {
      throw new Error(`SPARC learner-response score references unknown ${params.label} "${id}"`);
    }
    if (updates.has(id)) {
      throw new Error(`SPARC learner-response score contains duplicate ${params.label} "${id}"`);
    }
    updates.set(id, input);
  }
  return updates;
}

export function createSparcLearnerResponseScoreFacts(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly score: SparcLearnerResponseScoringResult;
}): readonly SparcWorkingMemoryFact[] {
  const knownClusterKcs = knownLearningTargetClusterKcs(params.facts);
  const knownMisconceptions = knownMisconceptionIds(params.facts);
  const previousCoverage = previousLearningTargetCoverage(params.facts);
  const previousSupportStrength = previousMisconceptionSupportStrength(params.facts);
  const scoredFacts: SparcWorkingMemoryFact[] = [];
  const contributionType = params.score.learnerContribution?.type;
  const learningTargetUpdates = uniqueUpdatesById({
    inputs: params.score.learningTargetScores ?? [],
    identity: (input) => input.clusterKC,
    knownIds: knownClusterKcs,
    label: 'learning target clusterKC',
  });
  const misconceptionUpdates = uniqueUpdatesById({
    inputs: params.score.diagnosticMisconceptionScores ?? [],
    identity: (input) => input.id,
    knownIds: knownMisconceptions,
    label: 'diagnostic misconception id',
  });
  for (const clusterKC of knownClusterKcs) {
    const input = learningTargetUpdates.get(clusterKC) ?? {
      clusterKC,
      coverage: previousCoverage.get(clusterKC) ?? 0,
    };
    scoredFacts.push(learningTargetScoreFact({
      input,
      priorCoverage: previousCoverage.get(clusterKC) ?? 0,
    }));
  }
  for (const id of knownMisconceptions) {
    const input = misconceptionUpdates.get(id) ?? {
      id,
      supportStrength: previousSupportStrength.get(id) ?? 0,
    };
    scoredFacts.push(misconceptionScoreFact(input));
  }
  if (params.score.learnerContribution) {
    scoredFacts.push({
      factType: 'learnerResponse.contribution',
      slots: {
        type: params.score.learnerContribution.type,
        ...(params.score.learnerContribution.confidence !== undefined
          ? {
              confidence: requireUnitScore(
                params.score.learnerContribution.confidence,
                'SPARC learner response contribution confidence',
              ),
            }
          : {}),
        ...(params.score.learnerContribution.streakCount !== undefined
          ? { streakCount: params.score.learnerContribution.streakCount }
          : {}),
      },
    });
  }
  if (contributionType === 'question' && !params.score.learnerQuestion) {
    throw new Error('SPARC learner question metadata is required when learnerContribution.type is question');
  }
  if (contributionType === 'question' && params.score.learnerQuestion) {
    scoredFacts.push({
      factType: 'dialogue.learnerQuestion',
      slots: {
        contentFocused: params.score.learnerQuestion.contentFocused,
      },
    });
  }
  return scoredFacts;
}

function stableIdentitySlots(fact: SparcWorkingMemoryFact): Readonly<Record<string, unknown>> {
  const slots = fact.slots ?? {};
  if (fact.factType === 'learningTarget.score') {
    return { clusterKC: slots.clusterKC };
  }
  if (fact.factType === 'diagnostic.misconceptionScore') {
    return { id: slots.id };
  }
  if (fact.factType === 'learningTarget.coverageMean') {
    return { scope: slots.scope };
  }
  return {};
}

export function createSparcLearnerResponseScoreStateWrites(params: {
  readonly target: SparcStateWrite['target'];
  readonly facts: readonly SparcWorkingMemoryFact[];
}): readonly SparcStateWrite[] {
  return params.facts
    .filter((fact) => fact.factType !== 'dialogue.learnerQuestion')
    .map((fact) => createSparcStableWorkingMemoryFactStateWrite({
      target: params.target,
      fact,
      identitySlots: stableIdentitySlots(fact),
    }));
}

export function createSparcLearnerResponseScoreTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly score: SparcLearnerResponseScoringResult;
}): SparcStateTransition {
  const scoredFacts = createSparcLearnerResponseScoreFacts({
    facts: params.facts,
    score: params.score,
  });
  return {
    transitionId: `${params.event.eventId}:learner-response-score`,
    event: params.event,
    writes: createSparcLearnerResponseScoreStateWrites({
      target: {
        pageKey: params.event.source.pageKey,
        nodeId: params.document.root.id,
      },
      facts: scoredFacts,
    }),
  };
}
