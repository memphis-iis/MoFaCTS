import type { CanonicalHistoryRecord } from './historyEnvelope';
import {
  type ModelPracticeHistoryIdentity,
} from './historyStimulusIdentity';
import {
  modelPracticeIdentityMatches,
  readSharedModelPracticeEvents,
  type SharedModelPracticeEvent,
} from './modelPracticeHistoryExchange';

export const MODEL_PRACTICE_METRICS = [
  'probability',
  'priorCorrect',
  'priorIncorrect',
  'priorStudy',
  'totalPracticeDuration',
  'lastOutcome',
] as const;

export type ModelPracticeMetric = typeof MODEL_PRACTICE_METRICS[number];

export type ModelPracticeStateQuery = {
  readonly target: ModelPracticeHistoryIdentity;
  readonly metric: ModelPracticeMetric;
};

export type ModelPracticeStateProvider = {
  readonly queryModelPracticeState: (query: ModelPracticeStateQuery) => unknown;
};

function isCorrectOutcome(outcome: unknown): boolean {
  return typeof outcome === 'string' && outcome.toLowerCase() === 'correct';
}

function isIncorrectOutcome(outcome: unknown): boolean {
  return typeof outcome === 'string' && outcome.toLowerCase() === 'incorrect';
}

function isStudyEvent(event: SharedModelPracticeEvent): boolean {
  return event.outcome === 'study' || event.record.typeOfResponse === 'study';
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

  for (const event of readSharedModelPracticeEvents(records)) {
    if (!modelPracticeIdentityMatches(query.target, event.identity)) {
      continue;
    }
    if (isCorrectOutcome(event.outcome)) {
      priorCorrect += 1;
    } else if (isIncorrectOutcome(event.outcome)) {
      priorIncorrect += 1;
    }
    if (isStudyEvent(event)) {
      priorStudy += 1;
    }
    totalPracticeDuration += event.practiceDurationMs ?? 0;
    lastOutcome = event.outcome;
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
