export interface VideoEndOverlaySnapshot {
  readonly mounted: boolean;
  readonly visible: boolean;
}

export interface VideoEndOverlayControllerDependencies {
  readonly onUpdate: (snapshot: VideoEndOverlaySnapshot) => void;
  readonly waitForBrowserPaint: () => Promise<void>;
  readonly waitForDomUpdate: () => Promise<void>;
}

function cloneSnapshot(snapshot: VideoEndOverlaySnapshot): VideoEndOverlaySnapshot {
  return { ...snapshot };
}

export function createVideoEndOverlayController(deps: VideoEndOverlayControllerDependencies) {
  let snapshot: VideoEndOverlaySnapshot = {
    mounted: false,
    visible: false,
  };
  let sequence = 0;
  let ended = false;

  function publish() {
    deps.onUpdate(cloneSnapshot(snapshot));
  }

  async function revealWhenReady(revealSequence: number) {
    await deps.waitForDomUpdate();
    await deps.waitForBrowserPaint();

    if (!ended || revealSequence !== sequence) {
      return;
    }

    snapshot = {
      mounted: true,
      visible: true,
    };
    publish();
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    syncVideoEnded(videoEnded: boolean) {
      if (videoEnded === ended) {
        return;
      }

      ended = videoEnded;
      sequence += 1;
      if (!videoEnded) {
        snapshot = {
          mounted: false,
          visible: false,
        };
        publish();
        return;
      }

      snapshot = {
        mounted: true,
        visible: false,
      };
      publish();
      void revealWhenReady(sequence);
    },
  };
}
