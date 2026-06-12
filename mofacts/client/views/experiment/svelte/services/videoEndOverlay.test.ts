import { expect } from 'chai';
import {
  createVideoEndOverlayController,
  type VideoEndOverlaySnapshot,
} from './videoEndOverlay';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('video end overlay controller', function() {
  it('mounts hidden, then reveals after DOM update and paint', async function() {
    const domUpdate = deferred();
    const paint = deferred();
    const snapshots: VideoEndOverlaySnapshot[] = [];
    const controller = createVideoEndOverlayController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: () => paint.promise,
      waitForDomUpdate: () => domUpdate.promise,
    });

    controller.syncVideoEnded(true);

    expect(snapshots).to.deep.equal([{ mounted: true, visible: false }]);

    domUpdate.resolve();
    await flushMicrotasks();
    expect(snapshots).to.deep.equal([{ mounted: true, visible: false }]);

    paint.resolve();
    await flushMicrotasks();
    expect(snapshots).to.deep.equal([
      { mounted: true, visible: false },
      { mounted: true, visible: true },
    ]);
    expect(controller.getSnapshot()).to.deep.equal({ mounted: true, visible: true });
  });

  it('cancels a pending reveal when the video-ended state clears', async function() {
    const domUpdate = deferred();
    const paint = deferred();
    const snapshots: VideoEndOverlaySnapshot[] = [];
    const controller = createVideoEndOverlayController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: () => paint.promise,
      waitForDomUpdate: () => domUpdate.promise,
    });

    controller.syncVideoEnded(true);
    controller.syncVideoEnded(false);
    domUpdate.resolve();
    paint.resolve();
    await flushMicrotasks();

    expect(snapshots).to.deep.equal([
      { mounted: true, visible: false },
      { mounted: false, visible: false },
    ]);
    expect(controller.getSnapshot()).to.deep.equal({ mounted: false, visible: false });
  });

  it('does not reschedule while the video-ended state is unchanged', async function() {
    let domUpdateCalls = 0;
    let paintCalls = 0;
    const snapshots: VideoEndOverlaySnapshot[] = [];
    const controller = createVideoEndOverlayController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: async () => {
        paintCalls += 1;
      },
      waitForDomUpdate: async () => {
        domUpdateCalls += 1;
      },
    });

    controller.syncVideoEnded(true);
    controller.syncVideoEnded(true);
    await flushMicrotasks();

    expect(domUpdateCalls).to.equal(1);
    expect(paintCalls).to.equal(1);
    expect(snapshots).to.deep.equal([
      { mounted: true, visible: false },
      { mounted: true, visible: true },
    ]);
  });
});
