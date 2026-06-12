import { expect } from 'chai';
import {
  buildIncomingTrialSlotKey,
  createIncomingTrialSlotController,
  type IncomingTrialSlotSnapshot,
} from './incomingTrialSlotController';

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

describe('incoming trial slot controller', function() {
  it('builds stable keys from prepared slot display identity', function() {
    expect(buildIncomingTrialSlotKey({
      preparedTrial: { questionIndex: 4 },
      slot: {
        subset: { showOverlay: true },
        props: {
          display: {
            text: 'Prompt',
            clozeText: 'Cloze',
            imgSrc: '/img.png',
            videoSrc: '/video.mp4',
            audioSrc: '/audio.mp3',
            h5p: { contentId: 'h5p-1' },
          },
        },
      },
    })).to.equal('4::Prompt::Cloze::/img.png::/video.mp4::/audio.mp3::h5p-1');

    expect(buildIncomingTrialSlotKey({
      preparedTrial: { questionIndex: 4 },
      slot: {
        subset: { showOverlay: false },
        props: { display: { text: 'Prompt' } },
      },
    })).to.equal('none');
    expect(buildIncomingTrialSlotKey({ preparedTrial: null, slot: null })).to.equal('none');
  });

  it('resets and mounts a non-empty slot key after DOM update and paint', async function() {
    const domUpdate = deferred();
    const paint = deferred();
    const snapshots: IncomingTrialSlotSnapshot[] = [];
    const controller = createIncomingTrialSlotController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: () => paint.promise,
      waitForDomUpdate: () => domUpdate.promise,
    });

    expect(controller.syncSlotKey('slot-a')).to.equal(true);
    expect(controller.syncSlotKey('slot-a')).to.equal(false);

    expect(snapshots).to.deep.equal([{
      mounted: false,
      readySent: false,
      transitionCompleteSent: false,
    }]);

    domUpdate.resolve();
    await flushMicrotasks();
    expect(snapshots).to.have.length(1);

    paint.resolve();
    await flushMicrotasks();
    expect(snapshots[snapshots.length - 1]).to.deep.equal({
      mounted: true,
      readySent: false,
      transitionCompleteSent: false,
    });
  });

  it('cancels a pending mount when the key clears', async function() {
    const domUpdate = deferred();
    const paint = deferred();
    const snapshots: IncomingTrialSlotSnapshot[] = [];
    const controller = createIncomingTrialSlotController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: () => paint.promise,
      waitForDomUpdate: () => domUpdate.promise,
    });

    expect(controller.syncSlotKey('slot-a')).to.equal(true);
    expect(controller.syncSlotKey('none')).to.equal(true);
    domUpdate.resolve();
    paint.resolve();
    await flushMicrotasks();

    expect(snapshots).to.deep.equal([
      { mounted: false, readySent: false, transitionCompleteSent: false },
      { mounted: false, readySent: false, transitionCompleteSent: false },
    ]);
    expect(controller.getSnapshot()).to.deep.equal({
      mounted: false,
      readySent: false,
      transitionCompleteSent: false,
    });
  });

  it('does not reschedule while the slot key is unchanged', async function() {
    let domUpdateCalls = 0;
    let paintCalls = 0;
    const snapshots: IncomingTrialSlotSnapshot[] = [];
    const controller = createIncomingTrialSlotController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: async () => {
        paintCalls += 1;
      },
      waitForDomUpdate: async () => {
        domUpdateCalls += 1;
      },
    });

    controller.syncSlotKey('slot-a');
    controller.syncSlotKey('slot-a');
    await flushMicrotasks();

    expect(domUpdateCalls).to.equal(1);
    expect(paintCalls).to.equal(1);
    expect(snapshots).to.deep.equal([
      { mounted: false, readySent: false, transitionCompleteSent: false },
      { mounted: true, readySent: false, transitionCompleteSent: false },
    ]);
  });

  it('tracks one-shot incoming-ready and transition-complete flags', function() {
    const snapshots: IncomingTrialSlotSnapshot[] = [];
    const controller = createIncomingTrialSlotController({
      onUpdate: (snapshot) => snapshots.push(snapshot),
      waitForBrowserPaint: async () => undefined,
      waitForDomUpdate: async () => undefined,
    });

    controller.markReadySent();
    controller.markReadySent();
    controller.markTransitionCompleteSent();
    controller.markTransitionCompleteSent();

    expect(snapshots).to.deep.equal([
      { mounted: false, readySent: true, transitionCompleteSent: false },
      { mounted: false, readySent: true, transitionCompleteSent: true },
    ]);
  });
});
