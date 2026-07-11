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
  readonly evidence?: string;
  readonly missingElements?: readonly string[];
};

export type SparcDiagnosticMisconceptionScoreInput = {
  readonly id: string;
  readonly confidence: number;
  readonly evidence?: string;
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
    readonly answerableFromAuthoredContent: boolean;
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
    if (fact.factType !== 'autotutor.expectation' && fact.factType !== 'learningTarget.score') {
      return [];
    }
    const clusterKC = stringSlot(fact, 'clusterKC');
    return clusterKC ? [clusterKC] : [];
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
      ...(params.input.evidence ? { evidence: params.input.evidence } : {}),
      ...(params.input.missingElements ? { missingElements: params.input.missingElements } : {}),
    },
  };
}

function misconceptionScoreFact(input: SparcDiagnosticMisconceptionScoreInput): SparcWorkingMemoryFact {
  const id = requireNonBlank(input.id, 'SPARC diagnostic misconception score id');
  return {
    factType: 'diagnostic.misconceptionScore',
    slots: {
      id,
      confidence: requireUnitScore(input.confidence, `SPARC diagnostic misconception score "${id}" confidence`),
      ...(input.evidence ? { evidence: input.evidence } : {}),
    },
  };
}

export function createSparcLearnerResponseScoreFacts(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly score: SparcLearnerResponseScoringResult;
}): readonly SparcWorkingMemoryFact[] {
  const knownClusterKcs = knownLearningTargetClusterKcs(params.facts);
  const previousCoverage = previousLearningTargetCoverage(params.facts);
  const scoredFacts: SparcWorkingMemoryFact[] = [];
  const contributionType = params.score.learnerContribution?.type;
  for (const input of params.score.learningTargetScores ?? []) {
    const clusterKC = requireNonBlank(input.clusterKC, 'SPARC learning target score clusterKC');
    if (!knownClusterKcs.has(clusterKC)) {
      throw new Error(`SPARC learner-response score references unknown learning target clusterKC "${clusterKC}"`);
    }
    scoredFacts.push(learningTargetScoreFact({
      input,
      priorCoverage: previousCoverage.get(clusterKC) ?? 0,
    }));
  }
  for (const input of params.score.diagnosticMisconceptionScores ?? []) {
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
        answerableFromAuthoredContent: params.score.learnerQuestion.answerableFromAuthoredContent,
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
  return params.facts.map((fact) => createSparcStableWorkingMemoryFactStateWrite({
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
