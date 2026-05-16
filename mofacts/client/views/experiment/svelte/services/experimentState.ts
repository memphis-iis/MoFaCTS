/**
 * Experiment State Management Service
 *
 * Handles loading and updating GlobalExperimentStates for resume functionality.
 * Maintains experiment progress, cluster mapping, and session data across page reloads.
 *
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { clientConsole } from '../../../../lib/clientLogger';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import type { ExperimentState } from '../../../../../common/types/experiment';
import { assertIdInvariants, getCanonicalIdContext, logIdInvariantBreachOnce } from '../../../../lib/idContext';

interface ExperimentStateServiceEvent {
  stateUpdate?: ExperimentState;
  source?: string;
}

type MeteorUserProfileLike = {
  profile?: {
    experimentTarget?: string;
  };
};

function mergeExperimentState(
  existingState: ExperimentState | undefined,
  partialState: ExperimentState
): ExperimentState {
  const mergedState: ExperimentState = {
    ...(existingState || {}),
    ...partialState,
  };

  // Ensure only allowed fields are kept in the final state to be persisted
  const allowedFields = [
    'clusterMapping',
    'mappingSignature',
    'conditionTdfId',
    'experimentXCond',
    'subTdfIndex',
    'schedule',
    'scheduleUnitNumber',
    'currentRootTdfId',
    'currentTdfId',
    'currentUnitNumber',
    'lastUnitCompleted',
    'experimentTarget',
    'lastActionTimeStamp'
  ];

  const filteredState: ExperimentState = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(mergedState, field)) {
      filteredState[field] = mergedState[field];
    }
  }

  filteredState.lastActionTimeStamp = Date.now();
  filteredState.currentRootTdfId =
    partialState.currentRootTdfId
    || existingState?.currentRootTdfId
    || Session.get('currentRootTdfId');
  filteredState.currentTdfId =
    partialState.currentTdfId
    || existingState?.currentTdfId
    || Session.get('currentTdfId')
    || Session.get('currentRootTdfId');

  const hasExplicitConditionTdfId = Object.prototype.hasOwnProperty.call(partialState, 'conditionTdfId');
  if (hasExplicitConditionTdfId) {
    filteredState.conditionTdfId = partialState.conditionTdfId ?? null;
  } else if (
    filteredState.currentRootTdfId
    && filteredState.currentTdfId
    && String(filteredState.currentRootTdfId) === String(filteredState.currentTdfId)
  ) {
    filteredState.conditionTdfId = null;
  }

  if (!filteredState.experimentTarget) {
    const targetFromSession = Session.get('experimentTarget');
    const targetFromProfile = (Meteor.user() as MeteorUserProfileLike | null | undefined)?.profile?.experimentTarget;
    const normalizedTarget = String(targetFromSession || targetFromProfile || '').trim().toLowerCase();
    if (normalizedTarget) {
      filteredState.experimentTarget = normalizedTarget;
    }
  }

  return filteredState;
}

/**
 * Get current experiment state from server.
 * Loads state into ExperimentStateStore for reactive access.
 */
export async function getExperimentState(): Promise<ExperimentState> {
  const idCtx = getCanonicalIdContext();
  if (!idCtx.currentRootTdfId) {
    logIdInvariantBreachOnce('experimentState.get:missing-currentRootTdfId');
  }
  let curExperimentState = (await meteorCallAsync(
    'getExperimentState',
    Meteor.userId(),
    idCtx.currentRootTdfId
  )) as ExperimentState | undefined;

  ExperimentStateStore.set(curExperimentState);
  return curExperimentState || {};
}

/**
 * Persist durable control-plane state needed for resume.
 * This is intentionally used for initialization artifacts and unit/branch transitions,
 * but never for the standard per-trial learning loop.
 */
export async function createExperimentState(
  partialState: ExperimentState
): Promise<string | undefined> {
  assertIdInvariants('experimentState.create', { requireCurrentTdfId: true, requireStimuliSetId: false });

  const existingState = ExperimentStateStore.get();
  const stateToPersist = mergeExperimentState(existingState, partialState);
  const persistedState = await meteorCallAsync<ExperimentState>('createExperimentState', stateToPersist);
  const nextState = persistedState || stateToPersist;

  ExperimentStateStore.set(nextState);
  return nextState.currentTdfId as string | undefined;
}

/**
 * XState service for initialization.
 * Only called once when the machine starts to ensure the shuffle is persisted.
 */
export async function experimentStateService(
  _context: unknown,
  event: ExperimentStateServiceEvent
): Promise<{ status: 'created' } | { status: 'error'; error: string }> {
  try {
    const initialState = event.stateUpdate || {};
    // We only ever "create" if we don't have an ID yet. 
    // If we have an ID, we're in resume mode and don't need to write anything.
    const existing = ExperimentStateStore.get();
    if (!existing || !existing.id) {
      await createExperimentState(initialState);
    }

    return { status: 'created' };
  } catch (error) {
    clientConsole(1, '[Experiment State] Service error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', error: message };
  }
}
