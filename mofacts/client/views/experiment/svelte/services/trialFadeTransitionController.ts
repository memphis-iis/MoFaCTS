import type { ActiveTrialFadeContext } from './activeTrialRevealController';

export interface TrialFadeTransitionEvent {
  readonly eventType?: string;
  readonly isOwnTarget: boolean;
  readonly propertyName?: string;
  readonly pseudoElement?: string;
}

export interface TrialFadeTransitionRuntimeState {
  readonly feedbackReadyForPreparedHandoff: boolean;
  readonly isFadingOut: boolean;
  readonly isPreparedFadingOut: boolean;
  readonly isTestMode: boolean;
  readonly stimulusReadyForPreparedHandoff: boolean;
  readonly transitionCompleteSent: boolean;
  readonly trialContentVisible: boolean;
}

export interface TrialFadeTransitionControllerDependencies {
  readonly getComputedOpacity: () => string;
  readonly getFadeContext: () => ActiveTrialFadeContext;
  readonly getRuntimeState: () => TrialFadeTransitionRuntimeState;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly markPreparedHandoffOnNextReveal: (params: {
    feedbackReady: boolean;
    stimulusReady: boolean;
  }) => void;
  readonly markTransitionCompleteSent: () => void;
  readonly now: () => number;
  readonly sendTransitionComplete: () => void;
}

export function createTrialFadeTransitionController(
  deps: TrialFadeTransitionControllerDependencies,
) {
  function handleTransitionEvent(event: TrialFadeTransitionEvent | null | undefined): boolean {
    if (!event || !event.isOwnTarget || event.propertyName !== 'opacity') {
      return false;
    }

    const eventType = String(event.eventType || '');
    const runtime = deps.getRuntimeState();
    const fadeContext = deps.getFadeContext();
    deps.log(2, '[ContentSurface][FadeTiming]', {
      eventType,
      key: fadeContext.key,
      subsetKind: fadeContext.subsetKind,
      elapsedSinceRevealTriggerMs: fadeContext.visibleSetAt
        ? Math.round(deps.now() - fadeContext.visibleSetAt)
        : null,
      configuredDurationMs: fadeContext.configuredDurationMs,
      trialContentVisible: runtime.trialContentVisible,
      isFadingOut: runtime.isFadingOut,
      opacity: deps.getComputedOpacity(),
      pseudoElement: event.pseudoElement || '',
    });

    if (
      runtime.isTestMode ||
      eventType !== 'transitionend' ||
      !runtime.isFadingOut ||
      runtime.transitionCompleteSent
    ) {
      return true;
    }

    if (runtime.isPreparedFadingOut) {
      deps.markPreparedHandoffOnNextReveal({
        stimulusReady: runtime.stimulusReadyForPreparedHandoff,
        feedbackReady: runtime.feedbackReadyForPreparedHandoff,
      });
    }
    deps.markTransitionCompleteSent();
    deps.sendTransitionComplete();
    return true;
  }

  return {
    handleTransitionEvent,
  };
}
