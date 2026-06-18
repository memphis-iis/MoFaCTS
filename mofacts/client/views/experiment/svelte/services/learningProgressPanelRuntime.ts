import {
  buildLearningProgressPanelSnapshot,
  type LearningProgressPanelSnapshot,
} from './learningProgressPanel';
import {
  progressPanelDisabled,
  setLearningProgressViewportOpen,
  type LearningProgressDocument,
} from './learningProgressPanelViewport';
import {
  resolveSessionSurfaceLearningProgressPanel,
  resolveSessionSurfaceShell,
  type SessionSurfaceLearningProgressPanelState,
  type SessionSurfaceShell,
  type SessionSurfaceState,
} from './sessionSurfaceMode';

export interface LearningProgressRuntimeSnapshot {
  readonly panelState: SessionSurfaceLearningProgressPanelState;
  readonly requestedOpen: boolean;
  readonly sessionSurfaceShell: SessionSurfaceShell;
  readonly showPanel: boolean;
  readonly snapshot: LearningProgressPanelSnapshot;
  readonly viewportOpen: boolean;
}

export interface LearningProgressRuntimeControllerOptions {
  readonly defaultDeliverySettings: Record<string, unknown>;
  readonly documentRef: () => LearningProgressDocument | null | undefined;
  readonly getHiddenItems: () => unknown[];
}

export interface LearningProgressRuntimeSyncParams {
  readonly deliverySettings: Record<string, unknown>;
  readonly engine: unknown;
  readonly feedbackEnd: unknown;
  readonly refreshSignal?: unknown;
  readonly surfaceState: SessionSurfaceState;
}

export function shouldCommitLearningProgressSnapshot(params: {
  readonly current: LearningProgressPanelSnapshot;
  readonly feedbackEnd: number;
  readonly lastFeedbackEnd: number;
  readonly next: LearningProgressPanelSnapshot;
  readonly refreshSignal: unknown;
  readonly lastRefreshSignal: unknown;
}): boolean {
  if (!params.current.available && params.next.available) {
    return true;
  }
  if (params.current.available && params.next.available && !learningProgressSnapshotsMatch(params.current, params.next)) {
    return true;
  }
  if (
    params.next.available &&
    params.refreshSignal !== undefined &&
    params.refreshSignal !== '' &&
    params.refreshSignal !== params.lastRefreshSignal
  ) {
    return true;
  }
  return params.feedbackEnd > 0 && params.feedbackEnd !== params.lastFeedbackEnd;
}

function learningProgressSnapshotsMatch(
  current: LearningProgressPanelSnapshot,
  next: LearningProgressPanelSnapshot,
): boolean {
  if (current.meanPercent !== next.meanPercent || current.thresholdPercent !== next.thresholdPercent) {
    return false;
  }
  if (
    current.stats.totalItems !== next.stats.totalItems
    || current.stats.atOrAboveThreshold !== next.stats.atOrAboveThreshold
    || current.stats.belowThreshold !== next.stats.belowThreshold
    || current.stats.introducedItems !== next.stats.introducedItems
    || current.stats.unintroducedItems !== next.stats.unintroducedItems
  ) {
    return false;
  }
  if (current.rows.length !== next.rows.length) {
    return false;
  }
  return current.rows.every((row, index) => {
    const nextRow = next.rows[index];
    return nextRow !== undefined
      && row.id === nextRow.id
      && row.percent === nextRow.percent
      && row.band === nextRow.band
      && row.introduced === nextRow.introduced
      && row.current === nextRow.current;
  });
}

export function createLearningProgressRuntimeController(
  options: LearningProgressRuntimeControllerOptions,
) {
  let snapshot = buildLearningProgressPanelSnapshot(null, options.defaultDeliverySettings);
  let lastFeedbackEnd = 0;
  let lastRefreshSignal: unknown = undefined;
  let requestedOpenState = false;

  function buildRuntimeSnapshot(params: LearningProgressRuntimeSyncParams): LearningProgressRuntimeSnapshot {
    const refreshSignal = params.refreshSignal ?? '';
    const feedbackEnd = Number(params.feedbackEnd || 0);
    const nextSnapshot = buildLearningProgressPanelSnapshot(params.engine, params.deliverySettings, {
      hiddenItems: options.getHiddenItems(),
    });

    if (shouldCommitLearningProgressSnapshot({
      current: snapshot,
      feedbackEnd,
      lastFeedbackEnd,
      next: nextSnapshot,
      refreshSignal,
      lastRefreshSignal,
    })) {
      snapshot = nextSnapshot;
      if (feedbackEnd > 0) {
        lastFeedbackEnd = feedbackEnd;
      }
      if (refreshSignal !== '') {
        lastRefreshSignal = refreshSignal;
      }
    } else if (!nextSnapshot.available && snapshot.available) {
      snapshot = nextSnapshot;
      lastFeedbackEnd = 0;
    }

    const sessionSurfaceShell = resolveSessionSurfaceShell({
      surfaceState: params.surfaceState,
      progressPanelDisabled: progressPanelDisabled(params.deliverySettings),
      learningProgressAvailable: snapshot.available,
    });
    const requestedOpen = sessionSurfaceShell.showLearningProgressPanel
      ? requestedOpenState
      : false;
    requestedOpenState = requestedOpen;
    const panelState = resolveSessionSurfaceLearningProgressPanel({
      shell: sessionSurfaceShell,
      requestedOpen,
    });
    setLearningProgressViewportOpen({
      documentRef: options.documentRef(),
      open: panelState.viewportOpen,
    });

    return {
      panelState,
      requestedOpen,
      sessionSurfaceShell,
      showPanel: panelState.showPanel,
      snapshot,
      viewportOpen: panelState.viewportOpen,
    };
  }

  return {
    buildRuntimeSnapshot,
    closeViewport() {
      requestedOpenState = false;
      setLearningProgressViewportOpen({
        documentRef: options.documentRef(),
        open: false,
      });
    },
    setRequestedOpen(open: boolean) {
      requestedOpenState = open;
    },
    getLastFeedbackEnd() {
      return lastFeedbackEnd;
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
