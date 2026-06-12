export interface IncomingTrialSlotSnapshot {
  readonly mounted: boolean;
  readonly readySent: boolean;
  readonly transitionCompleteSent: boolean;
}

export interface IncomingTrialSlotControllerDependencies {
  readonly onUpdate: (snapshot: IncomingTrialSlotSnapshot) => void;
  readonly waitForBrowserPaint: () => Promise<void>;
  readonly waitForDomUpdate: () => Promise<void>;
}

export interface IncomingTrialSlotKeyInput {
  readonly preparedTrial?: { questionIndex?: unknown } | null;
  readonly slot?: {
    readonly props?: {
      readonly display?: {
        readonly audioSrc?: unknown;
        readonly clozeText?: unknown;
        readonly h5p?: { readonly contentId?: unknown } | null;
        readonly imgSrc?: unknown;
        readonly text?: unknown;
        readonly videoSrc?: unknown;
      } | null;
    } | null;
    readonly subset?: { readonly showOverlay?: boolean } | null;
  } | null;
}

function cloneSnapshot(snapshot: IncomingTrialSlotSnapshot): IncomingTrialSlotSnapshot {
  return { ...snapshot };
}

export function buildIncomingTrialSlotKey(input: IncomingTrialSlotKeyInput): string {
  const slot = input.slot;
  if (!slot?.subset?.showOverlay) {
    return 'none';
  }

  const display = slot.props?.display || {};
  return [
    input.preparedTrial?.questionIndex || 0,
    display.text || '',
    display.clozeText || '',
    display.imgSrc || '',
    display.videoSrc || '',
    display.audioSrc || '',
    display.h5p?.contentId || '',
  ].join('::');
}

export function createIncomingTrialSlotController(
  deps: IncomingTrialSlotControllerDependencies,
) {
  let currentKey = 'none';
  let sequence = 0;
  let snapshot: IncomingTrialSlotSnapshot = {
    mounted: false,
    readySent: false,
    transitionCompleteSent: false,
  };

  function publish() {
    deps.onUpdate(cloneSnapshot(snapshot));
  }

  function reset() {
    snapshot = {
      mounted: false,
      readySent: false,
      transitionCompleteSent: false,
    };
    publish();
  }

  async function mountWhenReady(key: string, mountSequence: number) {
    await deps.waitForDomUpdate();
    await deps.waitForBrowserPaint();

    if (key !== currentKey || mountSequence !== sequence || currentKey === 'none') {
      return;
    }

    snapshot = {
      ...snapshot,
      mounted: true,
    };
    publish();
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    markReadySent() {
      if (snapshot.readySent) {
        return;
      }
      snapshot = {
        ...snapshot,
        readySent: true,
      };
      publish();
    },
    markTransitionCompleteSent() {
      if (snapshot.transitionCompleteSent) {
        return;
      }
      snapshot = {
        ...snapshot,
        transitionCompleteSent: true,
      };
      publish();
    },
    syncSlotKey(slotKey: string): boolean {
      const nextKey = slotKey || 'none';
      if (nextKey === currentKey) {
        return false;
      }

      currentKey = nextKey;
      sequence += 1;
      reset();
      if (nextKey !== 'none') {
        void mountWhenReady(nextKey, sequence);
      }
      return true;
    },
  };
}
