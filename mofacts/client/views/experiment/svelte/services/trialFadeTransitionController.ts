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
  readonly trialContentVisible: boolean;
}

export interface TrialFadeTransitionControllerDependencies {
  readonly getComputedOpacity: () => string;
  readonly getFadeElement: () => Element | null;
  readonly getFadeContext: () => ActiveTrialFadeContext;
  readonly getRuntimeState: () => TrialFadeTransitionRuntimeState;
  readonly log: (level: number, message: string, details?: unknown) => void;
  readonly markPreparedHandoffOnNextReveal: (params: {
    feedbackReady: boolean;
    stimulusReady: boolean;
  }) => void;
  readonly now: () => number;
  readonly waitForDomUpdate: () => Promise<unknown>;
}

export function createTrialFadeTransitionController(
  deps: TrialFadeTransitionControllerDependencies,
) {
  function logTransitionEvent(event: TrialFadeTransitionEvent | null | undefined): boolean {
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

    return true;
  }

  async function waitForFadeOut(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    // The machine enters fadingOut before Svelte applies its CSS class.
    await deps.waitForDomUpdate();
    signal.throwIfAborted();
    const element = deps.getFadeElement();
    if (!element?.isConnected) throw new Error('Fade-out requires a connected outgoing card element');

    // Flush the new CSS state before reading the transitions, including pending
    // transitions whose first rendering frame has not arrived yet.
    deps.getComputedOpacity();
    const animations = element.getAnimations().filter(animation => {
      const effect = animation.effect as KeyframeEffect | null;
      return (animation as CSSTransition).transitionProperty === 'opacity'
        && effect?.target === element && !effect.pseudoElement;
    });
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      Promise.all(animations.map(animation => animation.finished)).then(
        () => { signal.removeEventListener('abort', abort); resolve(); },
        error => { signal.removeEventListener('abort', abort); reject(error); },
      );
    });
    signal.throwIfAborted();
    if (deps.getFadeElement() !== element || !element.isConnected) {
      throw new Error('The outgoing card element changed during fade-out');
    }
    const finalOpacity = deps.getComputedOpacity();
    if (!finalOpacity.trim() || Number(finalOpacity) !== 0) {
      throw new Error('Fade-out finished without hiding the outgoing card');
    }

    const runtime = deps.getRuntimeState();
    if (!runtime.isFadingOut || runtime.isTestMode) {
      throw new Error('Fade-out completion requires the active fadingOut state');
    }
    if (runtime.isPreparedFadingOut) {
      deps.markPreparedHandoffOnNextReveal({
        stimulusReady: runtime.stimulusReadyForPreparedHandoff,
        feedbackReady: runtime.feedbackReadyForPreparedHandoff,
      });
    }
  }

  return {
    logTransitionEvent,
    waitForFadeOut,
  };
}
