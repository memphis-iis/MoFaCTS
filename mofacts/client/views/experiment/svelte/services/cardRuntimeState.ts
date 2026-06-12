import { Session } from 'meteor/session';
import { getEngine } from '../../../../lib/engineManager';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { CardStore } from '../../modules/cardStore';
import type { ExperimentState, UnitEngineLike } from '../../../../../common/types';

export type EngineIndices = {
  clusterIndex?: number;
  stimIndex?: number;
  whichStim?: number;
};

export type CardRuntimeEngineSources = {
  explicitEngine?: UnitEngineLike | null | undefined;
  eventEngine?: UnitEngineLike | null | undefined;
  contextEngine?: UnitEngineLike | null | undefined;
};

export type CardRuntimeInitSnapshot = {
  currentTdfFile: unknown;
  overallOutcomeHistory: unknown[];
  overallStudyHistory: unknown[];
};

export const CARD_RUNTIME_SESSION_KEYS = Object.freeze({
  // Owned by card runtime init; mirrored into CardStore until legacy helpers stop reading Session.
  DISPLAY_READY: 'displayReady',
  INPUT_READY: 'inputReady',

  // Owned by video card init after startup reset; read by guards, services, and view components.
  IS_VIDEO_SESSION: 'isVideoSession',
  VIDEO_CHECKPOINTS: 'videoCheckpoints',
  VIDEO_RESUME_ANCHOR: 'videoResumeAnchor',

  // Owned by resume/init flow; services may consume and clear the one-shot resume request.
  IN_RESUME: 'inResume',
  RESUME_TO_QUESTION: 'resumeToQuestion',
  RESUME_IN_PROGRESS: 'resumeInProgress',

  // Owned by unit-engine services; mirrored from model/schedule/video selection state.
  ENGINE_INDICES: 'engineIndices',
  CLUSTER_INDEX: 'clusterIndex',
  WHICH_STIM: 'whichStim',
  STIM_INDEX: 'stimIndex',

  // Owned by launch/content bootstrap; card runtime requires these instead of reconstructing ids.
  CURRENT_TDF_FILE: 'currentTdfFile',
  CURRENT_TDF_ID: 'currentTdfId',

  // Owned by history logging; initialized here because the card flow appends to these arrays.
  OVERALL_OUTCOME_HISTORY: 'overallOutcomeHistory',
  OVERALL_STUDY_HISTORY: 'overallStudyHistory',

  // Owned by delivery/trial services.
  CURRENT_DELIVERY_SETTINGS: 'currentDeliverySettings',
  CURRENT_ANSWER: 'currentAnswer',
} as const);

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ensureArraySessionValue(key: string): unknown[] {
  const current = Session.get(key);
  if (Array.isArray(current)) {
    return current;
  }
  const next: unknown[] = [];
  Session.set(key, next);
  return next;
}

export function resetCardRuntimeForInitialization(): CardRuntimeInitSnapshot {
  CardStore.setScoringEnabled(undefined);
  CardStore.setDisplayReady(false);
  CardStore.setInputReady(false);
  Session.set(CARD_RUNTIME_SESSION_KEYS.DISPLAY_READY, false);
  Session.set(CARD_RUNTIME_SESSION_KEYS.INPUT_READY, false);
  Session.set(CARD_RUNTIME_SESSION_KEYS.IS_VIDEO_SESSION, false);
  Session.set(CARD_RUNTIME_SESSION_KEYS.VIDEO_CHECKPOINTS, null);
  Session.set(CARD_RUNTIME_SESSION_KEYS.VIDEO_RESUME_ANCHOR, null);

  return {
    currentTdfFile: Session.get(CARD_RUNTIME_SESSION_KEYS.CURRENT_TDF_FILE),
    overallOutcomeHistory: ensureArraySessionValue(CARD_RUNTIME_SESSION_KEYS.OVERALL_OUTCOME_HISTORY),
    overallStudyHistory: ensureArraySessionValue(CARD_RUNTIME_SESSION_KEYS.OVERALL_STUDY_HISTORY),
  };
}

export function setDisplayReadyState(isReady: boolean): void {
  CardStore.setDisplayReady(isReady);
  Session.set(CARD_RUNTIME_SESSION_KEYS.DISPLAY_READY, isReady);
}

export function setInputReadyState(isReady: boolean): void {
  CardStore.setInputReady(isReady);
  Session.set(CARD_RUNTIME_SESSION_KEYS.INPUT_READY, isReady);
}

export function markRuntimeResumeInactive(): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.IN_RESUME, false);
}

export function setResumeToQuestion(value: boolean): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.RESUME_TO_QUESTION, value);
}

export function setResumeInProgress(value: boolean): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.RESUME_IN_PROGRESS, value);
}

export function isInResume(): boolean {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.IN_RESUME) === true;
}

export function setInResume(value: boolean): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.IN_RESUME, value);
}

export function markResumeRuntimeInactive(): void {
  setInResume(false);
  setResumeInProgress(false);
}

export function resolveRuntimeEngine(sources: CardRuntimeEngineSources = {}): UnitEngineLike | null | undefined {
  return sources.explicitEngine || sources.eventEngine || sources.contextEngine || (getEngine() as UnitEngineLike | null | undefined);
}

export function getRuntimeExperimentState(): ExperimentState {
  return (ExperimentStateStore.get() || {}) as ExperimentState;
}

export function getOverallOutcomeHistory(): unknown[] {
  const history = Session.get(CARD_RUNTIME_SESSION_KEYS.OVERALL_OUTCOME_HISTORY);
  return Array.isArray(history) ? history : [];
}

export function getOverallStudyHistory(): unknown[] {
  const history = Session.get(CARD_RUNTIME_SESSION_KEYS.OVERALL_STUDY_HISTORY);
  return Array.isArray(history) ? history : [];
}

export function setRuntimeHistories(outcomeHistory: unknown[], studyHistory: unknown[]): void {
  if (!Array.isArray(outcomeHistory) || !Array.isArray(studyHistory)) {
    throw new Error('[Card Runtime State] histories must be arrays');
  }
  Session.set(CARD_RUNTIME_SESSION_KEYS.OVERALL_OUTCOME_HISTORY, outcomeHistory);
  Session.set(CARD_RUNTIME_SESSION_KEYS.OVERALL_STUDY_HISTORY, studyHistory);
}

export function resetRuntimeHistories(): void {
  setRuntimeHistories([], []);
}

export function recordRuntimeOutcomeHistories(testType: string, outcomes: boolean[]): void {
  if (typeof testType !== 'string') {
    throw new Error('[History Logging] testType is missing or invalid');
  }
  const overallOutcomeHistory = Session.get(CARD_RUNTIME_SESSION_KEYS.OVERALL_OUTCOME_HISTORY);
  if (!Array.isArray(overallOutcomeHistory)) {
    throw new Error('[History Logging] overallOutcomeHistory is not initialized');
  }

  if (testType !== 'i' && testType !== 's') {
    if (!Array.isArray(outcomes) || outcomes.length === 0 || outcomes.some((outcome) => typeof outcome !== 'boolean')) {
      throw new Error('[History Logging] outcome history update requires at least one boolean outcome');
    }
    for (const outcome of outcomes) {
      overallOutcomeHistory.push(outcome ? 1 : 0);
    }
    Session.set(CARD_RUNTIME_SESSION_KEYS.OVERALL_OUTCOME_HISTORY, overallOutcomeHistory);
  }

  const overallStudyHistory = Session.get(CARD_RUNTIME_SESSION_KEYS.OVERALL_STUDY_HISTORY);
  if (!Array.isArray(overallStudyHistory)) {
    throw new Error('[History Logging] overallStudyHistory is not initialized');
  }

  if (testType === 's') {
    overallStudyHistory.push(1);
  }
  if (testType === 'd') {
    overallStudyHistory.push(0);
  }
  Session.set(CARD_RUNTIME_SESSION_KEYS.OVERALL_STUDY_HISTORY, overallStudyHistory);
}

export function getEngineIndices(): EngineIndices | undefined {
  const indices = Session.get(CARD_RUNTIME_SESSION_KEYS.ENGINE_INDICES);
  return indices && typeof indices === 'object' ? indices as EngineIndices : undefined;
}

export function setEngineIndices(indices: EngineIndices | undefined): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.ENGINE_INDICES, indices);
}

export function publishEngineIndices(indices: EngineIndices): void {
  if (typeof indices.clusterIndex === 'number') {
    Session.set(CARD_RUNTIME_SESSION_KEYS.CLUSTER_INDEX, indices.clusterIndex);
  }
  if (typeof indices.whichStim === 'number') {
    Session.set(CARD_RUNTIME_SESSION_KEYS.WHICH_STIM, indices.whichStim);
  }
  if (typeof indices.stimIndex === 'number') {
    Session.set(CARD_RUNTIME_SESSION_KEYS.STIM_INDEX, indices.stimIndex);
  }
}

export function setCurrentDeliverySettings(value: unknown): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.CURRENT_DELIVERY_SETTINGS, value);
}

export function setCurrentAnswer(value: unknown): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.CURRENT_ANSWER, value || '');
}

export function getCurrentAnswer(): unknown {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.CURRENT_ANSWER);
}

export function getSessionClusterIndex(defaultValue = 0): number {
  return getFiniteNumber(Session.get(CARD_RUNTIME_SESSION_KEYS.CLUSTER_INDEX)) ?? defaultValue;
}

export function hasCurrentTdfId(): boolean {
  return !!Session.get(CARD_RUNTIME_SESSION_KEYS.CURRENT_TDF_ID);
}

export function isResumeRequested(): boolean {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.RESUME_TO_QUESTION) === true;
}

export function isResumeInProgress(): boolean {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.RESUME_IN_PROGRESS) === true;
}

export function getIsVideoSessionFlag(): unknown {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.IS_VIDEO_SESSION);
}

export function getVideoCheckpoints(): unknown {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.VIDEO_CHECKPOINTS);
}

export function setVideoSessionActive(isActive: boolean): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.IS_VIDEO_SESSION, isActive);
}

export function setVideoCheckpoints(value: unknown): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.VIDEO_CHECKPOINTS, value);
}

export function setVideoResumeAnchor(value: unknown): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.VIDEO_RESUME_ANCHOR, value);
}

export function getVideoResumeAnchor(): unknown {
  return Session.get(CARD_RUNTIME_SESSION_KEYS.VIDEO_RESUME_ANCHOR);
}

export function clearVideoSessionState(): void {
  setVideoSessionActive(false);
  setVideoResumeAnchor(null);
}

export function clearResumeToQuestion(): void {
  Session.set(CARD_RUNTIME_SESSION_KEYS.RESUME_TO_QUESTION, false);
}

export function setVideoEngineIndices(clusterIndex: number): EngineIndices {
  const indices = { clusterIndex, stimIndex: 0 };
  setEngineIndices(indices);
  return indices;
}
