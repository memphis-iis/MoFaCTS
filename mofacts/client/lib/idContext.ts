import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { clientConsole } from './userSessionHelpers';

type OptionalId = string | number | null;

type ActiveTdfContextInput = {
  currentRootTdfId?: unknown;
  currentTdfId?: unknown;
  currentStimuliSetId?: unknown;
};

type ParticipantContextInput = {
  experimentTarget?: unknown;
  userId?: unknown;
};

type ConditionContextInput = {
  conditionTdfId?: unknown;
};

const loggedInvariantBreaches = new Set<string>();

function normalizeOptionalId(value: unknown): OptionalId {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    return trimmed;
  }
  return null;
}

function normalizeOptionalTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function canonicalContextSnapshot() {
  return {
    userId: Meteor.userId() || null,
    currentRootTdfId: normalizeOptionalId(Session.get('currentRootTdfId')),
    currentTdfId: normalizeOptionalId(Session.get('currentTdfId')),
    currentStimuliSetId: normalizeOptionalId(Session.get('currentStimuliSetId')),
    conditionTdfId: normalizeOptionalId(Session.get('conditionTdfId')),
    experimentTarget: normalizeOptionalTarget(Session.get('experimentTarget')),
  };
}

export function getCanonicalIdContext() {
  return canonicalContextSnapshot();
}

export function setActiveTdfContext(input: ActiveTdfContextInput = {}, source = 'unknown') {
  const rootTdfId = normalizeOptionalId(input.currentRootTdfId);
  const currentTdfId = normalizeOptionalId(input.currentTdfId ?? rootTdfId);
  const currentStimuliSetId = normalizeOptionalId(input.currentStimuliSetId);

  Session.set('currentRootTdfId', rootTdfId);
  Session.set('currentTdfId', currentTdfId);
  if (currentStimuliSetId !== null) {
    Session.set('currentStimuliSetId', currentStimuliSetId);
  }

  clientConsole(2, '[ID Context] setActiveTdfContext', {
    source,
    ...canonicalContextSnapshot(),
  });
}

export function setExperimentParticipantContext(input: ParticipantContextInput = {}, source = 'unknown') {
  const target = normalizeOptionalTarget(input.experimentTarget);
  const userId = normalizeOptionalId(input.userId ?? Meteor.userId());
  Session.set('experimentTarget', target || '');
  if (userId !== null) {
    Session.set('sessionUserId', userId);
  }

  clientConsole(2, '[ID Context] setExperimentParticipantContext', {
    source,
    ...canonicalContextSnapshot(),
  });
}

export function setConditionResolutionContext(input: ConditionContextInput = {}, source = 'unknown') {
  const conditionTdfId = normalizeOptionalId(input.conditionTdfId);
  Session.set('conditionTdfId', conditionTdfId);
  clientConsole(2, '[ID Context] setConditionResolutionContext', {
    source,
    ...canonicalContextSnapshot(),
  });
}

export function logIdInvariantBreachOnce(reason: string, details: Record<string, unknown> = {}) {
  const context = canonicalContextSnapshot();
  const key = JSON.stringify({
    reason,
    userId: context.userId,
    currentTdfId: context.currentTdfId,
    currentStimuliSetId: context.currentStimuliSetId,
    conditionTdfId: context.conditionTdfId,
    experimentTarget: context.experimentTarget,
  });
  if (loggedInvariantBreaches.has(key)) {
    return;
  }
  loggedInvariantBreaches.add(key);
  clientConsole(1, '[ID Context] invariant-breach', {
    reason,
    ...context,
    ...details,
  });
}

export function assertIdInvariants(stage: string, options: { requireCurrentTdfId?: boolean; requireStimuliSetId?: boolean } = {}) {
  const ctx = canonicalContextSnapshot();
  if (options.requireCurrentTdfId && !ctx.currentTdfId) {
    logIdInvariantBreachOnce(`${stage}:missing-currentTdfId`, {});
    return false;
  }
  if (options.requireStimuliSetId && !ctx.currentStimuliSetId) {
    logIdInvariantBreachOnce(`${stage}:missing-currentStimuliSetId`, {});
    return false;
  }
  if (ctx.conditionTdfId && ctx.currentTdfId && String(ctx.conditionTdfId) !== String(ctx.currentTdfId)) {
    logIdInvariantBreachOnce(`${stage}:condition-current-mismatch`, {});
  }
  return true;
}

export function clearConditionResolutionContext(source = 'unknown') {
  setConditionResolutionContext({ conditionTdfId: null }, source);
}
