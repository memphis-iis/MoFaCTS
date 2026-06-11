import type { CanonicalHistoryRecord } from './historyEnvelope';
import {
  isBlankIdentityValue,
  isModelPracticeHistoryRecord,
  type ModelPracticeHistoryIdentity,
} from './historyStimulusIdentity';

export type ModelPracticeMetric =
  | 'probability'
  | 'priorCorrect'
  | 'priorIncorrect'
  | 'priorStudy'
  | 'totalPracticeDuration'
  | 'lastOutcome';

export type ModelPracticeStateQuery = {
  readonly target: ModelPracticeHistoryIdentity;
  readonly metric: ModelPracticeMetric;
};

export type ModelPracticeStateProvider = {
  readonly queryModelPracticeState: (query: ModelPracticeStateQuery) => unknown;
};

function identityValuesMatch(left: unknown, right: unknown): boolean {
  return !isBlankIdentityValue(left) && !isBlankIdentityValue(right) && String(left) === String(right);
}

function recordMatchesModelTarget(
  record: Record<string, unknown>,
  target: ModelPracticeHistoryIdentity,
): boolean {
  if (!isModelPracticeHistoryRecord(record)) {
    return false;
  }
  if (!identityValuesMatch(record.stimuliSetId, target.stimuliSetId)) {
    return false;
  }
  if (!identityValuesMatch(record.stimulusKC, target.stimulusKC)) {
    return false;
  }
  if (!identityValuesMatch(record.clusterKC, target.clusterKC)) {
    return false;
  }
  if (target.response) {
    if (!identityValuesMatch(record.responseKC, target.response.responseKC)) {
      return false;
    }
    if (!identityValuesMatch(record.responseKey, target.response.responseKey)) {
      return false;
    }
  }
  return true;
}

function isCorrectOutcome(outcome: unknown): boolean {
  return typeof outcome === 'string' && outcome.toLowerCase() === 'correct';
}

function isIncorrectOutcome(outcome: unknown): boolean {
  return typeof outcome === 'string' && outcome.toLowerCase() === 'incorrect';
}

function isStudyOutcome(record: Record<string, unknown>): boolean {
  return record.outcome === 'study' || record.typeOfResponse === 'study';
}

function getPracticeDuration(record: Record<string, unknown>): number {
  if (Number.isFinite(Number(record.responseDuration))) {
    return Number(record.responseDuration);
  }
  if (Number.isFinite(Number(record.practiceDurationMs))) {
    return Number(record.practiceDurationMs);
  }
  if (record.sparc && typeof record.sparc === 'object' && !Array.isArray(record.sparc)) {
    const extension = record.sparc as Record<string, unknown>;
    const observation = extension.practiceObservation;
    if (observation && typeof observation === 'object' && !Array.isArray(observation)) {
      const practiceDurationMs = (observation as Record<string, unknown>).practiceDurationMs;
      if (Number.isFinite(Number(practiceDurationMs))) {
        return Number(practiceDurationMs);
      }
    }
  }
  return 0;
}

export function queryModelPracticeHistory(
  records: Iterable<CanonicalHistoryRecord>,
  query: ModelPracticeStateQuery,
): unknown {
  if (query.metric === 'probability') {
    throw new Error('Model probability queries require a live model-state provider');
  }

  let priorCorrect = 0;
  let priorIncorrect = 0;
  let priorStudy = 0;
  let totalPracticeDuration = 0;
  let lastOutcome: unknown;

  for (const record of records) {
    if (!recordMatchesModelTarget(record, query.target)) {
      continue;
    }
    if (isCorrectOutcome(record.outcome)) {
      priorCorrect += 1;
    } else if (isIncorrectOutcome(record.outcome)) {
      priorIncorrect += 1;
    }
    if (isStudyOutcome(record)) {
      priorStudy += 1;
    }
    totalPracticeDuration += getPracticeDuration(record);
    lastOutcome = record.outcome;
  }

  switch (query.metric) {
    case 'priorCorrect':
      return priorCorrect;
    case 'priorIncorrect':
      return priorIncorrect;
    case 'priorStudy':
      return priorStudy;
    case 'totalPracticeDuration':
      return totalPracticeDuration;
    case 'lastOutcome':
      return lastOutcome;
  }
}

export function createHistoryBackedModelPracticeStateProvider(
  records: Iterable<CanonicalHistoryRecord>,
): ModelPracticeStateProvider {
  return {
    queryModelPracticeState(query) {
      return queryModelPracticeHistory(records, query);
    },
  };
}
