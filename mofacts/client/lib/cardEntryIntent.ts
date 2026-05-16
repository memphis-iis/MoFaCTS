import { Session } from 'meteor/session';

// Entry intent is about how the learner reached /card, not about which trial appears next.
// There are three product-level meanings we care about:
// - initial_tdf_entry: first-ever entry for this TDF family, with no persisted progress
// - persisted_progress_resume: re-entry driven by stored experiment state
// - instruction_continue: in-sequence continuation inside an already active run
// card_refresh_rebuild is a transport/mechanical path that resolves to one of the above.
export const CARD_ENTRY_INTENT = {
  INITIAL_TDF_ENTRY: 'initial_tdf_entry',
  PERSISTED_PROGRESS_RESUME: 'persisted_progress_resume',
  INSTRUCTION_CONTINUE: 'instruction_continue',
  CARD_REFRESH_REBUILD: 'card_refresh_rebuild',
} as const;

export type CardEntryIntent = typeof CARD_ENTRY_INTENT[keyof typeof CARD_ENTRY_INTENT];

export const COMPLETED_LESSON_REDIRECT = '/learningDashboard' as const;

export const CARD_REFRESH_REBUILD_REASON = {
  NO_EXPERIMENT_STATE: 'no_experiment_state',
  NO_PROGRESS_STATE: 'no_progress_state',
  SAVED_PROGRESS_STATE: 'saved_progress_state',
} as const;

type CardRefreshRebuildReason =
  typeof CARD_REFRESH_REBUILD_REASON[keyof typeof CARD_REFRESH_REBUILD_REASON];

type CardEntryMetadata = {
  source?: string | null;
  rootTdfId?: string | null;
  currentTdfId?: string | null;
  unitNumber?: number | null;
  startedAt?: number | null;
};

type CardEntryContext = {
  intent: CardEntryIntent | null;
  source: string | null;
  rootTdfId: string | null;
  currentTdfId: string | null;
  unitNumber: number | null;
  startedAt: number | null;
};

type CardRefreshRebuildClassification = {
  intent: CardEntryIntent;
  reason: CardRefreshRebuildReason;
  moduleCompleted: boolean;
  persistedUnitNumber: number | null;
  lastUnitCompleted: number | null;
};

export type CardLaunchProgress = {
  intent: CardEntryIntent;
  hasMeaningfulHistory: boolean;
  moduleCompleted: boolean;
  persistedUnitNumber: number | null;
  lastUnitCompleted: number | null;
};

const CARD_ENTRY_INTENT_VALUES = new Set<CardEntryIntent>(Object.values(CARD_ENTRY_INTENT));

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUnitNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

function isCardEntryIntent(value: unknown): value is CardEntryIntent {
  return typeof value === 'string' && CARD_ENTRY_INTENT_VALUES.has(value as CardEntryIntent);
}

function hasPersistedProgressState(experimentState: Record<string, unknown> | null | undefined): boolean {
  if (!experimentState || typeof experimentState !== 'object') {
    return false;
  }

  if (normalizeUnitNumber(experimentState.currentUnitNumber) !== null) {
    return true;
  }

  if (normalizeUnitNumber(experimentState.lastUnitCompleted) !== null) {
    return true;
  }

  if (experimentState.schedule && normalizeUnitNumber(experimentState.scheduleUnitNumber) !== null) {
    return true;
  }

  return false;
}

export function getCardEntryIntent(): CardEntryIntent | null {
  const value = Session.get('cardEntryIntent');
  return isCardEntryIntent(value) ? value : null;
}

export function getCardEntryContext(): CardEntryContext {
  return {
    intent: getCardEntryIntent(),
    source: normalizeNonEmptyString(Session.get('cardEntrySource')),
    rootTdfId: normalizeNonEmptyString(Session.get('cardEntryRootTdfId')),
    currentTdfId: normalizeNonEmptyString(Session.get('cardEntryCurrentTdfId')),
    unitNumber: normalizeUnitNumber(Session.get('cardEntryUnitNumber')),
    startedAt: normalizeTimestamp(Session.get('cardEntryStartedAt')),
  };
}

export function setCardEntryIntent(intent: CardEntryIntent, metadata: CardEntryMetadata = {}): void {
  const source = metadata.source !== undefined
    ? normalizeNonEmptyString(metadata.source)
    : null;
  const rootTdfId = metadata.rootTdfId !== undefined
    ? normalizeNonEmptyString(metadata.rootTdfId)
    : normalizeNonEmptyString(Session.get('currentRootTdfId'));
  const currentTdfId = metadata.currentTdfId !== undefined
    ? normalizeNonEmptyString(metadata.currentTdfId)
    : normalizeNonEmptyString(Session.get('currentTdfId'));
  const unitNumber = metadata.unitNumber !== undefined
    ? normalizeUnitNumber(metadata.unitNumber)
    : normalizeUnitNumber(Session.get('currentUnitNumber'));
  const startedAt = metadata.startedAt !== undefined
    ? normalizeTimestamp(metadata.startedAt)
    : Date.now();

  Session.set('cardEntryIntent', intent);
  Session.set('cardEntrySource', source);
  Session.set('cardEntryRootTdfId', rootTdfId);
  Session.set('cardEntryCurrentTdfId', currentTdfId);
  Session.set('cardEntryUnitNumber', unitNumber);
  Session.set('cardEntryStartedAt', startedAt);
}

export function clearCardEntryContext(): void {
  Session.set('cardEntryIntent', undefined);
  Session.set('cardEntrySource', undefined);
  Session.set('cardEntryRootTdfId', undefined);
  Session.set('cardEntryCurrentTdfId', undefined);
  Session.set('cardEntryUnitNumber', undefined);
  Session.set('cardEntryStartedAt', undefined);
}

export function classifyCardRefreshRebuild(
  experimentState: Record<string, unknown> | null | undefined,
  unitCount = 0
): CardRefreshRebuildClassification {
  if (!experimentState || typeof experimentState !== 'object' || Object.keys(experimentState).length === 0) {
    return {
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      reason: CARD_REFRESH_REBUILD_REASON.NO_EXPERIMENT_STATE,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    };
  }

  const launchProgress = resolveCardLaunchProgress(experimentState, unitCount);
  if (launchProgress.hasMeaningfulHistory || hasPersistedProgressState(experimentState)) {
    return {
      intent: CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME,
      reason: CARD_REFRESH_REBUILD_REASON.SAVED_PROGRESS_STATE,
      moduleCompleted: launchProgress.moduleCompleted,
      persistedUnitNumber: launchProgress.persistedUnitNumber,
      lastUnitCompleted: launchProgress.lastUnitCompleted,
    };
  }

  return {
    intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
    reason: CARD_REFRESH_REBUILD_REASON.NO_PROGRESS_STATE,
    moduleCompleted: false,
    persistedUnitNumber: launchProgress.persistedUnitNumber,
    lastUnitCompleted: launchProgress.lastUnitCompleted,
  };
}

export function shouldUseProgressBootstrapForEntryIntent(intent: CardEntryIntent | null): boolean {
  switch (intent) {
  case CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME:
    return true;
  default:
    return false;
  }
}

export function resolveCardLaunchProgress(
  experimentState: Record<string, unknown> | null | undefined,
  unitCount: number
): CardLaunchProgress {
  const safeUnitCount = Number.isFinite(unitCount) && unitCount > 0 ? unitCount : 0;

  if (!experimentState || typeof experimentState !== 'object' || Object.keys(experimentState).length === 0) {
    return {
      intent: CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
      hasMeaningfulHistory: false,
      moduleCompleted: false,
      persistedUnitNumber: null,
      lastUnitCompleted: null,
    };
  }

  const persistedUnitNumber = normalizeUnitNumber(experimentState.currentUnitNumber);
  const lastUnitCompleted = normalizeUnitNumber(experimentState.lastUnitCompleted);

  const hasMeaningfulHistory =
    persistedUnitNumber !== null ||
    lastUnitCompleted !== null ||
    Boolean(experimentState.schedule && normalizeUnitNumber(experimentState.scheduleUnitNumber) !== null);

  const moduleCompleted = safeUnitCount > 0 && (
    (persistedUnitNumber !== null && persistedUnitNumber >= safeUnitCount) ||
    (
      lastUnitCompleted !== null &&
      lastUnitCompleted >= (safeUnitCount - 1)
    )
  );

  return {
    intent: hasMeaningfulHistory
      ? CARD_ENTRY_INTENT.PERSISTED_PROGRESS_RESUME
      : CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY,
    hasMeaningfulHistory,
    moduleCompleted,
    persistedUnitNumber,
    lastUnitCompleted,
  };
}
