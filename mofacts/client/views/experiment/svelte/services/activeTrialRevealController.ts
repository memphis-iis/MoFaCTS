export interface ActiveTrialRevealSnapshot {
  readonly activeSlotMounted: boolean;
  readonly activeSlotVisible: boolean;
  readonly feedbackBlockingAssetReady: boolean;
  readonly stagedFeedbackBlockerSrc: string;
  readonly stagedStimulusBlockerSrc: string;
  readonly stagedTrialSubsetKey: string;
  readonly stimulusBlockingAssetReady: boolean;
  readonly trialSubsetVisible: boolean;
}

export interface ActiveTrialFadeContext {
  readonly configuredDurationMs: number;
  readonly key: string;
  readonly subsetKind: string;
  readonly visibleSetAt: number;
}

export interface ActiveTrialRevealRuntimeState {
  readonly allBlockingAssetsReady: boolean;
  readonly isFadingOut: boolean;
  readonly isTestMode: boolean;
  readonly subsetKind: string;
}

export interface ActiveTrialRevealControllerDependencies {
  readonly getRuntimeState: () => ActiveTrialRevealRuntimeState;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly markFirstRevealClassSet: (params: { key: string; subsetKind: string }) => void;
  readonly now: () => number;
  readonly onFadeContext: (context: ActiveTrialFadeContext) => void;
  readonly onRevealStarted: (subsetKind: string) => void;
  readonly onUpdate: (snapshot: ActiveTrialRevealSnapshot) => void;
  readonly primeFadeStart: () => void;
  readonly readTransitionDurationMs: () => number;
  readonly waitForBrowserPaint: () => Promise<void>;
  readonly waitForDomUpdate: () => Promise<void>;
}

export interface ActiveTrialRevealStageInput {
  readonly expectedFeedbackBlockerSrc: string;
  readonly expectedStimulusBlockerSrc: string;
  readonly isFadingOut: boolean;
  readonly isOutgoingFreezeState: boolean;
  readonly showOverlay: boolean;
  readonly trialSubsetKey: string;
  readonly trialSubsetKind: string;
}

function cloneSnapshot(snapshot: ActiveTrialRevealSnapshot): ActiveTrialRevealSnapshot {
  return { ...snapshot };
}

export function createActiveTrialRevealController(
  deps: ActiveTrialRevealControllerDependencies,
) {
  let snapshot: ActiveTrialRevealSnapshot = {
    activeSlotMounted: false,
    activeSlotVisible: false,
    feedbackBlockingAssetReady: true,
    stagedFeedbackBlockerSrc: '',
    stagedStimulusBlockerSrc: '',
    stagedTrialSubsetKey: 'none',
    stimulusBlockingAssetReady: true,
    trialSubsetVisible: false,
  };
  let revealSequence = 0;
  let queuedRevealKey = '';
  let queuedRevealSequence = 0;
  let preservePreparedHandoffOnNextReveal = false;
  let preparedHandoffStimulusReady = false;
  let preparedHandoffFeedbackReady = false;

  function publish() {
    deps.onUpdate(cloneSnapshot(snapshot));
  }

  function markVisible(key: string, subsetKind: string): ActiveTrialFadeContext {
    const fadeContext = {
      key,
      subsetKind,
      visibleSetAt: deps.now(),
      configuredDurationMs: deps.readTransitionDurationMs(),
    };
    deps.onFadeContext(fadeContext);
    snapshot = {
      ...snapshot,
      activeSlotMounted: true,
      activeSlotVisible: true,
      trialSubsetVisible: true,
    };
    publish();
    return fadeContext;
  }

  async function revealPreparedHandoff(key: string, sequence: number) {
    await deps.waitForDomUpdate();
    deps.primeFadeStart();

    const runtime = deps.getRuntimeState();
    if (
      runtime.isTestMode ||
      sequence !== revealSequence ||
      key !== snapshot.stagedTrialSubsetKey ||
      runtime.isFadingOut
    ) {
      deps.log(2, '[CardScreen][Reveal] prepared handoff reveal skipped', {
        testMode: runtime.isTestMode,
        preparedRevealSequence: sequence,
        revealSequence,
        preparedRevealKey: key,
        stagedTrialSubsetKey: snapshot.stagedTrialSubsetKey,
        isFadingOut: runtime.isFadingOut,
        subsetKind: runtime.subsetKind,
      });
      return;
    }

    deps.log(2, '[CardScreen][Reveal] prepared handoff reveal started', {
      preparedRevealKey: key,
      subsetKind: runtime.subsetKind,
    });
    markVisible(key, runtime.subsetKind);
    deps.onRevealStarted(runtime.subsetKind);
  }

  async function revealQueued(key: string, sequence: number) {
    await deps.waitForDomUpdate();
    await deps.waitForBrowserPaint();

    const runtime = deps.getRuntimeState();
    if (
      sequence !== revealSequence ||
      key !== snapshot.stagedTrialSubsetKey ||
      runtime.isFadingOut ||
      !runtime.allBlockingAssetsReady
    ) {
      deps.log(2, '[CardScreen][Reveal] queued reveal skipped', {
        key,
        stagedTrialSubsetKey: snapshot.stagedTrialSubsetKey,
        sequence,
        revealSequence,
        isFadingOut: runtime.isFadingOut,
        allBlockingAssetsReady: runtime.allBlockingAssetsReady,
        subsetKind: runtime.subsetKind,
      });
      return;
    }

    deps.log(2, '[CardScreen][Reveal] visible', {
      key,
      sequence,
      subsetKind: runtime.subsetKind,
      isFadingOut: runtime.isFadingOut,
      allBlockingAssetsReady: runtime.allBlockingAssetsReady,
    });
    const fadeContext = markVisible(key, runtime.subsetKind);
    deps.log(2, '[CardScreen][FadeTiming] reveal-trigger', {
      key,
      subsetKind: runtime.subsetKind,
      configuredDurationMs: fadeContext.configuredDurationMs,
      visibleSetAt: fadeContext.visibleSetAt,
    });
    deps.markFirstRevealClassSet({ key, subsetKind: runtime.subsetKind });
    if (!runtime.isTestMode) {
      deps.onRevealStarted(runtime.subsetKind);
    }
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    markPreparedHandoffOnNextReveal(params: {
      feedbackReady: boolean;
      stimulusReady: boolean;
    }) {
      preservePreparedHandoffOnNextReveal = true;
      preparedHandoffFeedbackReady = params.feedbackReady;
      preparedHandoffStimulusReady = params.stimulusReady;
    },
    setBlockingAssetReady(params: {
      owner: 'feedback' | 'stimulus';
      ready: boolean;
    }) {
      const nextSnapshot = {
        ...snapshot,
        ...(params.owner === 'stimulus'
          ? { stimulusBlockingAssetReady: params.ready }
          : { feedbackBlockingAssetReady: params.ready }),
      };
      if (
        nextSnapshot.stimulusBlockingAssetReady === snapshot.stimulusBlockingAssetReady &&
        nextSnapshot.feedbackBlockingAssetReady === snapshot.feedbackBlockingAssetReady
      ) {
        return;
      }
      snapshot = nextSnapshot;
      publish();
    },
    queueRevealIfReady(params: {
      allBlockingAssetsReady: boolean;
      isOutgoingFreezeState: boolean;
    }) {
      if (
        params.isOutgoingFreezeState ||
        !snapshot.activeSlotMounted ||
        snapshot.trialSubsetVisible ||
        !params.allBlockingAssetsReady
      ) {
        return;
      }
      const key = snapshot.stagedTrialSubsetKey;
      if (!key || key === 'none') {
        return;
      }
      if (queuedRevealKey === key && queuedRevealSequence === revealSequence) {
        return;
      }

      queuedRevealKey = key;
      queuedRevealSequence = revealSequence;
      void revealQueued(key, revealSequence);
    },
    syncVisibility(params: {
      isOutgoingFreezeState: boolean;
      showOverlay: boolean;
    }) {
      if (params.isOutgoingFreezeState) {
        if (snapshot.activeSlotMounted && snapshot.activeSlotVisible) {
          return;
        }
        snapshot = {
          ...snapshot,
          activeSlotMounted: true,
          activeSlotVisible: true,
        };
        publish();
        return;
      }
      if (!params.showOverlay) {
        if (!snapshot.activeSlotMounted && !snapshot.activeSlotVisible) {
          return;
        }
        snapshot = {
          ...snapshot,
          activeSlotMounted: false,
          activeSlotVisible: false,
        };
        publish();
      }
    },
    syncStage(input: ActiveTrialRevealStageInput): boolean {
      if (input.isOutgoingFreezeState || input.trialSubsetKey === snapshot.stagedTrialSubsetKey) {
        return false;
      }

      const preservePreparedHandoff = preservePreparedHandoffOnNextReveal;
      const preserveStimulusReady = Boolean(input.expectedStimulusBlockerSrc) &&
        input.expectedStimulusBlockerSrc === snapshot.stagedStimulusBlockerSrc &&
        snapshot.stimulusBlockingAssetReady;
      const preserveFeedbackReady = Boolean(input.expectedFeedbackBlockerSrc) &&
        input.expectedFeedbackBlockerSrc === snapshot.stagedFeedbackBlockerSrc &&
        snapshot.feedbackBlockingAssetReady;

      deps.log(2, '[CardScreen][Reveal] stage-reset', {
        trialSubsetKind: input.trialSubsetKind,
        trialSubsetKey: input.trialSubsetKey,
        stagedTrialSubsetKey: snapshot.stagedTrialSubsetKey,
        isFadingOut: input.isFadingOut,
        preservePreparedHandoff,
        preserveStimulusReady,
        preserveFeedbackReady,
      });

      revealSequence += 1;
      queuedRevealKey = '';
      queuedRevealSequence = 0;
      snapshot = {
        ...snapshot,
        activeSlotMounted: input.showOverlay || preservePreparedHandoff,
        activeSlotVisible: false,
        feedbackBlockingAssetReady: preservePreparedHandoff
          ? (!input.expectedFeedbackBlockerSrc || preparedHandoffFeedbackReady)
          : (!input.expectedFeedbackBlockerSrc || preserveFeedbackReady),
        stagedFeedbackBlockerSrc: input.expectedFeedbackBlockerSrc,
        stagedStimulusBlockerSrc: input.expectedStimulusBlockerSrc,
        stagedTrialSubsetKey: input.trialSubsetKey,
        stimulusBlockingAssetReady: preservePreparedHandoff
          ? (!input.expectedStimulusBlockerSrc || preparedHandoffStimulusReady)
          : (!input.expectedStimulusBlockerSrc || preserveStimulusReady),
        trialSubsetVisible: false,
      };
      publish();

      if (preservePreparedHandoff) {
        preservePreparedHandoffOnNextReveal = false;
        preparedHandoffStimulusReady = false;
        preparedHandoffFeedbackReady = false;
        void revealPreparedHandoff(input.trialSubsetKey, revealSequence);
      }
      return true;
    },
  };
}
