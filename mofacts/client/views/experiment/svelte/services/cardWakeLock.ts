export type ScreenWakeLockSentinel = {
  readonly released?: boolean;
  release?: () => Promise<void> | void;
  addEventListener?: (type: 'release', listener: EventListener) => void;
  removeEventListener?: (type: 'release', listener: EventListener) => void;
};

export type ScreenWakeLockNavigator = {
  readonly wakeLock?: {
    request?: (type: 'screen') => Promise<ScreenWakeLockSentinel>;
  };
};

export type ScreenWakeLockDocument = {
  readonly visibilityState?: string;
};

export type CardWakeLockControllerDeps = {
  readonly navigatorRef: () => ScreenWakeLockNavigator | null | undefined;
  readonly documentRef: () => ScreenWakeLockDocument | null | undefined;
  readonly shouldHold: () => boolean;
  readonly log: (level: number, message: string, details?: unknown) => void;
};

export type CardWakeLockController = {
  readonly request: (reason?: string) => Promise<void>;
  readonly release: (reason?: string) => Promise<void>;
  readonly sync: (reason?: string) => Promise<void>;
  readonly hasActiveWakeLock: () => boolean;
};

function canUseScreenWakeLock(navigatorRef: ScreenWakeLockNavigator | null | undefined): boolean {
  return typeof navigatorRef?.wakeLock?.request === 'function';
}

export function shouldHoldScreenWakeLock(params: {
  readonly active: boolean;
  readonly documentRef: ScreenWakeLockDocument | null | undefined;
}): boolean {
  return params.active && params.documentRef?.visibilityState === 'visible';
}

export function createCardWakeLockController(deps: CardWakeLockControllerDeps): CardWakeLockController {
  let screenWakeLock: ScreenWakeLockSentinel | null = null;
  let screenWakeLockReleaseHandler: EventListener | null = null;

  function clearReleaseListener(): void {
    if (
      screenWakeLock &&
      screenWakeLockReleaseHandler &&
      typeof screenWakeLock.removeEventListener === 'function'
    ) {
      screenWakeLock.removeEventListener('release', screenWakeLockReleaseHandler);
    }
    screenWakeLockReleaseHandler = null;
  }

  async function request(reason = 'unspecified'): Promise<void> {
    const navigatorRef = deps.navigatorRef();
    if (!canUseScreenWakeLock(navigatorRef) || !deps.shouldHold()) {
      return;
    }
    if (screenWakeLock && !screenWakeLock.released) {
      return;
    }

    try {
      const nextWakeLock = await navigatorRef!.wakeLock!.request!('screen');
      clearReleaseListener();
      screenWakeLock = nextWakeLock;
      screenWakeLockReleaseHandler = () => {
        if (screenWakeLock === nextWakeLock) {
          screenWakeLock = null;
        }
        screenWakeLockReleaseHandler = null;
        deps.log(2, `[CardScreen] Screen wake lock released (${reason})`);
      };
      if (typeof nextWakeLock.addEventListener === 'function') {
        nextWakeLock.addEventListener('release', screenWakeLockReleaseHandler);
      }
      deps.log(2, `[CardScreen] Screen wake lock acquired (${reason})`);
    } catch (error) {
      deps.log(2, `[CardScreen] Screen wake lock request skipped (${reason})`, error);
    }
  }

  async function release(reason = 'unspecified'): Promise<void> {
    if (!screenWakeLock) {
      return;
    }

    const wakeLockToRelease = screenWakeLock;
    clearReleaseListener();
    screenWakeLock = null;

    try {
      if (!wakeLockToRelease.released && typeof wakeLockToRelease.release === 'function') {
        await wakeLockToRelease.release();
      }
      deps.log(2, `[CardScreen] Screen wake lock released by app (${reason})`);
    } catch (error) {
      deps.log(2, `[CardScreen] Screen wake lock release failed (${reason})`, error);
    }
  }

  async function sync(reason = 'unspecified'): Promise<void> {
    if (deps.shouldHold()) {
      await request(reason);
      return;
    }
    await release(reason);
  }

  return {
    request,
    release,
    sync,
    hasActiveWakeLock: () => Boolean(screenWakeLock && !screenWakeLock.released),
  };
}
