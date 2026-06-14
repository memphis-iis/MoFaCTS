export interface TrialFadeContext {
  readonly key: string;
  readonly subsetKind: string;
  readonly visibleSetAt: number;
  readonly configuredDurationMs: number;
}

export interface FirstTrialRevealDependencies {
  readonly finishLaunchLoading: (reason: string) => void;
  readonly getFadeContext: () => TrialFadeContext;
  readonly isLaunchLoadingActive: () => boolean;
  readonly isRevealStable: (params: { key: string; subsetKind: string }) => boolean;
  readonly markLaunchLoadingTiming: (name: string, details?: Record<string, unknown>) => void;
  readonly now: () => number;
  readonly scheduleTimeout: (callback: () => void, delayMs: number) => void;
  readonly waitForBrowserPaint: () => Promise<void>;
  readonly waitForDomUpdate: () => Promise<void>;
}

export interface FirstTrialRevealController {
  readonly getPendingKey: () => string;
  readonly markRevealClassSet: (params: { key: string; subsetKind: string }) => void;
  readonly finishFromTransitionEvent: (params: { eventType: string }) => void;
  readonly finish: (reason: string) => void;
}

export function parseCssTimeToMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  if (value.endsWith('ms')) {
    const parsed = Number(value.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value.endsWith('s')) {
    const parsed = Number(value.slice(0, -1));
    return Number.isFinite(parsed) ? parsed * 1000 : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getElementTransitionDurationMs(
  element: Element | null | undefined,
  getComputedStyleForElement: (element: Element) => Pick<CSSStyleDeclaration, 'transitionDuration' | 'transitionDelay'>,
): number {
  if (!element) {
    return 0;
  }

  const style = getComputedStyleForElement(element);
  const durationValue = style.transitionDuration?.split(',')?.[0]?.trim() || '';
  const delayValue = style.transitionDelay?.split(',')?.[0]?.trim() || '';

  return parseCssTimeToMs(durationValue) + parseCssTimeToMs(delayValue);
}

export function createFirstTrialRevealController(
  deps: FirstTrialRevealDependencies,
): FirstTrialRevealController {
  let pendingKey = '';
  let finishScheduled = false;

  function finish(reason: string): void {
    if (!deps.isLaunchLoadingActive()) {
      pendingKey = '';
      return;
    }

    const fadeContext = deps.getFadeContext();
    if (!deps.isRevealStable({ key: fadeContext.key, subsetKind: fadeContext.subsetKind })) {
      deps.markLaunchLoadingTiming('firstReveal:finishDeferredUntilStable', {
        reason,
        key: fadeContext.key,
        subsetKind: fadeContext.subsetKind,
      });
      return;
    }

    deps.markLaunchLoadingTiming('firstReveal:fadeStarted', {
      reason,
      key: fadeContext.key,
      subsetKind: fadeContext.subsetKind,
      elapsedSinceRevealTriggerMs: fadeContext.visibleSetAt
        ? Math.round(deps.now() - fadeContext.visibleSetAt)
        : null,
    });
    pendingKey = '';
    deps.finishLaunchLoading(reason);
  }

  async function schedulePaintCompletion(key: string, subsetKind: string): Promise<void> {
    if (finishScheduled) {
      return;
    }
    finishScheduled = true;

    await deps.waitForDomUpdate();
    await deps.waitForBrowserPaint();
    if (!deps.isLaunchLoadingActive() || pendingKey !== key) {
      return;
    }

    const fadeContext = deps.getFadeContext();
    if (fadeContext.configuredDurationMs > 0) {
      deps.scheduleTimeout(() => {
        if (deps.isLaunchLoadingActive() && pendingKey === key) {
          deps.markLaunchLoadingTiming('firstReveal:transitionEventTimeout', {
            key,
            subsetKind,
            configuredDurationMs: deps.getFadeContext().configuredDurationMs,
          });
          finish('first-trial-transition-timeout');
        }
      }, fadeContext.configuredDurationMs + 80);
      return;
    }

    deps.markLaunchLoadingTiming('firstReveal:noTransitionConfigured', { key, subsetKind });
    finish('first-trial-no-transition');
  }

  return {
    getPendingKey: () => pendingKey,
    markRevealClassSet: ({ key, subsetKind }) => {
      if (!deps.isLaunchLoadingActive()) {
        return;
      }
      pendingKey = key;
      finishScheduled = false;
      deps.markLaunchLoadingTiming('firstReveal:classSet', {
        key,
        subsetKind,
      });
      void schedulePaintCompletion(key, subsetKind);
    },
    finishFromTransitionEvent: ({ eventType }) => {
      const fadeContext = deps.getFadeContext();
      if (
        deps.isLaunchLoadingActive() &&
        pendingKey &&
        pendingKey === fadeContext.key &&
        eventType === 'transitionend'
      ) {
        finish(`first-trial-${eventType}`);
      }
    },
    finish,
  };
}
