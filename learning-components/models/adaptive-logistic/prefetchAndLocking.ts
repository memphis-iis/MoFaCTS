export interface CardRef {
  readonly clusterIndex: any;
  readonly stimIndex: any;
}

export function buildCurrentOwnerToken(trialEpoch: any, cardRef: CardRef): string {
  const epoch = Number.isFinite(trialEpoch) ? trialEpoch : 0;
  return `${epoch}:${cardRef.clusterIndex}:${cardRef.stimIndex}:${Date.now()}`;
}

export function selectionOwnerTokenMismatched(selection: any, currentCardOwnerToken: any): boolean {
  return Boolean(selection?.ownerToken && currentCardOwnerToken && selection.ownerToken !== currentCardOwnerToken);
}

export function buildLockedNextCardRef(selection: any): any {
  return {
    clusterIndex: selection.clusterIndex,
    stimIndex: selection.stimIndex,
    ownerToken: selection.ownerToken || null,
    createdAt: selection.createdAt,
  };
}

export interface NextCardRuntimeState {
  currentCardRef: any;
  currentCardOwnerToken: any;
  lockedNextCardRef: any;
  nextTrialContent: any;
  currentPreparedState: any;
  _trialEpoch: any;
  _lockedNextSelection: any;
  _earlyLockPromise: any;
  _prefetchedSelection: any;
  _prefetchPromise: any;
}

export interface NextCardRuntimeDeps {
  readonly buildNextCardSelection: (indices: any, options?: any) => Promise<any>;
  readonly applyNextCardSelection: (selection: any, curExperimentState: any) => Promise<any>;
  readonly commitPreparedSelection: (selection: any, curExperimentState: any) => any;
  readonly isVideoSession: () => boolean;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function clearLockedNextCard(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'log'>,
  reason: any = 'unspecified',
): void {
  if (state.lockedNextCardRef || state.nextTrialContent) {
    deps.log(2, '[EARLY LOCK] Cleared locked next card', { reason });
  }
  state.lockedNextCardRef = null;
  state._lockedNextSelection = null;
  state.nextTrialContent = null;
  state._earlyLockPromise = null;
}

export function clearRuntimeNextCardState(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'log'>,
  reason: any = 'runtime-reset',
): void {
  state._trialEpoch = Number.isFinite(state._trialEpoch) ? state._trialEpoch + 1 : 1;
  state.currentCardRef = null;
  state.currentCardOwnerToken = null;
  state.currentPreparedState = null;
  clearLockedNextCard(state, deps, reason);
}

export function peekLockedNextCard(state: NextCardRuntimeState): any {
  if (!state.lockedNextCardRef || !state._lockedNextSelection) {
    return null;
  }

  return {
    ...state.lockedNextCardRef,
    ownerToken: state._lockedNextSelection.ownerToken || null,
  };
}

export async function lockNextCardEarly(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'buildNextCardSelection' | 'log'>,
  indices: any,
  options: any = {},
): Promise<any> {
  if (state._earlyLockPromise) {
    return await state._earlyLockPromise;
  }

  const currentCardRef = options?.currentCardRef || state.currentCardRef;
  const ownerToken = options?.ownerToken || state.currentCardOwnerToken;
  state._earlyLockPromise = deps.buildNextCardSelection(indices, {
    excludeCurrentCardRef: currentCardRef,
    ownerToken,
  })
    .then((selection: any) => {
      if (!selection) {
        return null;
      }
      if (ownerToken && state.currentCardOwnerToken && ownerToken !== state.currentCardOwnerToken) {
        deps.log(2, '[EARLY LOCK] Discarding stale lock because owner token changed', {
          ownerToken,
          activeOwnerToken: state.currentCardOwnerToken,
        });
        return null;
      }
      state._lockedNextSelection = selection;
      state.lockedNextCardRef = buildLockedNextCardRef(selection);
      deps.log(2, '[EARLY LOCK] Locked next card', state.lockedNextCardRef);
      return selection;
    })
    .finally(() => {
      state._earlyLockPromise = null;
    });

  return await state._earlyLockPromise;
}

export async function applyLockedNextCard(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'applyNextCardSelection' | 'log'>,
  curExperimentState: any,
): Promise<boolean> {
  const selection = state._lockedNextSelection;
  if (!selection || !state.lockedNextCardRef) {
    return false;
  }
  if (selectionOwnerTokenMismatched(selection, state.currentCardOwnerToken)) {
    deps.log(2, '[EARLY LOCK] Discarding locked next card because owner token mismatched', {
      selectionOwnerToken: selection.ownerToken,
      currentOwnerToken: state.currentCardOwnerToken,
    });
    clearLockedNextCard(state, deps, 'owner-token-mismatch');
    return false;
  }

  await deps.applyNextCardSelection(selection, curExperimentState);
  deps.log(2, '[EARLY LOCK] Applying locked next card', state.lockedNextCardRef);
  clearLockedNextCard(state, deps, 'applied');
  return true;
}

export function commitLockedNextCard(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'commitPreparedSelection' | 'log'>,
  curExperimentState: any,
): boolean {
  const selection = state._lockedNextSelection;
  if (!selection || !state.lockedNextCardRef) {
    return false;
  }
  if (selectionOwnerTokenMismatched(selection, state.currentCardOwnerToken)) {
    deps.log(2, '[EARLY LOCK] Discarding locked next card because owner token mismatched', {
      selectionOwnerToken: selection.ownerToken,
      currentOwnerToken: state.currentCardOwnerToken,
    });
    clearLockedNextCard(state, deps, 'owner-token-mismatch');
    return false;
  }

  deps.commitPreparedSelection(selection, curExperimentState);
  deps.log(2, '[EARLY LOCK] Applying locked next card', state.lockedNextCardRef);
  clearLockedNextCard(state, deps, 'applied');
  return true;
}

export async function prefetchNextCard(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'buildNextCardSelection' | 'isVideoSession' | 'log'>,
  indices: any,
): Promise<void> {
  if (deps.isVideoSession()) {
    return;
  }

  if (state._prefetchedSelection || state._prefetchPromise) {
    return;
  }

  state._prefetchPromise = deps.buildNextCardSelection(indices)
    .then((selection: any) => {
      if (selection) {
        state._prefetchedSelection = selection;
        deps.log(2, '[PREFETCH] Next card selection prepared');
      }
    })
    .catch((err: any) => {
      deps.log(1, '[PREFETCH] Error during next card selection:', err);
    })
    .finally(() => {
      state._prefetchPromise = null;
    });
}

export async function applyPrefetchedNextCard(
  state: NextCardRuntimeState,
  deps: Pick<NextCardRuntimeDeps, 'applyNextCardSelection' | 'log'>,
  curExperimentState: any,
): Promise<boolean> {
  if (state._prefetchPromise) {
    try {
      await state._prefetchPromise;
    } catch (e) {
      deps.log(1, '[PREFETCH] Prefetch failed to resolve:', e);
    }
  }

  const selection = state._prefetchedSelection;
  state._prefetchedSelection = null;
  if (!selection) {
    deps.log(2, '[PREFETCH] No prefetched selection available; returning without applying a card');
    return false;
  }

  deps.log(2, '[PREFETCH] Applying prefetched selection');
  await deps.applyNextCardSelection(selection, curExperimentState);
  return true;
}

export function clearPrefetchedNextCard(state: NextCardRuntimeState): void {
  state._prefetchedSelection = null;
  state._prefetchPromise = null;
}
