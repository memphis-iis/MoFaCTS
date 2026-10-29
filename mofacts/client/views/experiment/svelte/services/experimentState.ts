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
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import type { ExperimentState } from '../../../../../common/types/experiment';
import { assertIdInvariants, getCanonicalIdContext, logIdInvariantBreachOnce } from '../../../../lib/idContext';
import {
  courseAssignmentContextForStateWrite,
  getCourseAssignmentLaunchContext,
} from '../../../../lib/courseAssignmentLaunchContext';

function isProgressiveCourseLaunch(): boolean {
  return getCourseAssignmentLaunchContext()?.launchMode === 'progressive';
}

interface ExperimentStateServiceEvent {
  stateUpdate?: ExperimentState;
  source?: string;
}

type MeteorUserProfileLike = {
  profile?: {
    experimentTarget?: string;
    createdBy?: string;
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
    'conditionTdfId',
    'experimentXCond',
    'subTdfIndex',
    'schedule',
    'scheduleUnitNumber',
    'adaptiveUnitSequence',
    'currentRootTdfId',
    'currentTdfId',
    'currentUnitNumber',
    'lastUnitCompleted',
    'courseAssignmentLaunchContext',
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

  // Preserve an explicit URL condition in the existing experiment-state field for return links.
  // Randomized delivery retains its current assignment owner.
  const profile = (Meteor.user() as MeteorUserProfileLike | null)?.profile;
  const urlCondition = Session.get('experimentXCond');
  const randomizedDelivery = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.randomizedDelivery;
  if (profile?.createdBy === 'startProlificParticipation' && filteredState.experimentXCond == null
    && urlCondition !== '' && urlCondition != null && !randomizedDelivery?.length) {
    const condition = Number(urlCondition);
    if (!Number.isSafeInteger(condition) || condition < 0) throw new Error('Invalid experiment delivery condition');
    filteredState.experimentXCond = condition;
  }

  filteredState.courseAssignmentLaunchContext = courseAssignmentContextForStateWrite({
    existingState,
    partialState,
  });

  return filteredState;
}

type ExperimentStateWriteOptions = {
  replaceExistingState?: boolean;
  allocateCondition?: boolean;
};

/**
 * Get current experiment state from server.
 * Loads state into ExperimentStateStore for reactive access.
 */
export async function getExperimentState(): Promise<ExperimentState> {
  if (isProgressiveCourseLaunch()) {
    const transientState: ExperimentState = {};
    ExperimentStateStore.set(transientState);
    return transientState;
  }
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
  partialState: ExperimentState,
  options: ExperimentStateWriteOptions = {},
): Promise<string | undefined> {
  if (isProgressiveCourseLaunch()) {
    if (options.allocateCondition) throw new Error('Condition allocation requires a durable experiment launch');
    const transientState = mergeExperimentState(ExperimentStateStore.get(), partialState);
    ExperimentStateStore.set(transientState);
    return transientState.currentTdfId as string | undefined;
  }
  assertIdInvariants('experimentState.create', { requireCurrentTdfId: true, requireStimuliSetId: false });

  const existingState = options.replaceExistingState ? undefined : ExperimentStateStore.get();
  const stateToPersist = mergeExperimentState(existingState, partialState);
  const persistedState = await meteorCallAsync<ExperimentState>(
    'createExperimentState',
    stateToPersist,
    options,
  );
  if (!persistedState || typeof persistedState !== 'object' || Array.isArray(persistedState)
    || typeof persistedState.id !== 'string' || !persistedState.id.trim()) {
    throw new Error('Required lesson state was not acknowledged as saved');
  }

  ExperimentStateStore.set(persistedState);
  return persistedState.currentTdfId as string | undefined;
}

/**
 * XState service for initialization.
 * Existing resume state needs no write. Required initialization failures reject
 * so the invoking machine must stop before accepting or advancing a trial.
 */
export async function experimentStateService(
  _context: unknown,
  event: ExperimentStateServiceEvent
): Promise<{ status: 'created' }> {
  const initialState = event.stateUpdate || {};
  // We only ever "create" if we don't have an ID yet.
  // If we have an ID, we're in resume mode and don't need to write anything.
  const existing = ExperimentStateStore.get();
  if (!existing || !existing.id) {
    await createExperimentState(initialState);
  }

  return { status: 'created' };
}
