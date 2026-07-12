import { expect } from 'chai';
import {
  createActiveTrialRevealController,
  type ActiveTrialFadeContext,
  type ActiveTrialRevealRuntimeState,
  type ActiveTrialRevealSnapshot,
} from './activeTrialRevealController';

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

function createHarness(options: Partial<ActiveTrialRevealRuntimeState> = {}) {
  const domUpdate = deferred();
  const paint = deferred();
  const fadeContexts: ActiveTrialFadeContext[] = [];
  const firstRevealMarks: Array<{ key: string; subsetKind: string }> = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const revealStarted: string[] = [];
  const stagedTrials: Array<{ key: string; subsetKind: string }> = [];
  const snapshots: ActiveTrialRevealSnapshot[] = [];
  let now = 1000;
  let transitionDuration = 240;
  let runtime: ActiveTrialRevealRuntimeState = {
    isFadingOut: false,
    isOutgoingFreezeState: false,
    isTestMode: false,
    subsetKind: 'question',
    ...options,
  };
  const controller = createActiveTrialRevealController({
    getRuntimeState: () => runtime,
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
    markFirstRevealClassSet: (params) => {
      firstRevealMarks.push(params);
    },
    now: () => now,
    onFadeContext: (context) => {
      fadeContexts.push(context);
    },
    onRevealStarted: (subsetKind) => {
      revealStarted.push(subsetKind);
    },
    onTrialStaged: (params) => {
      stagedTrials.push(params);
    },
    onUpdate: (snapshot) => {
      snapshots.push(snapshot);
    },
    primeFadeStart: () => undefined,
    readTransitionDurationMs: () => transitionDuration,
    waitForBrowserPaint: () => paint.promise,
    waitForDomUpdate: () => domUpdate.promise,
  });

  return {
    controller,
    domUpdate,
    fadeContexts,
    firstRevealMarks,
    logs,
    paint,
    revealStarted,
    setNow: (value: number) => {
      now = value;
    },
    setRuntime: (next: Partial<ActiveTrialRevealRuntimeState>) => {
      runtime = { ...runtime, ...next };
    },
    setTransitionDuration: (value: number) => {
      transitionDuration = value;
    },
    snapshots,
    stagedTrials,
  };
}

describe('active trial reveal controller', function() {
  it('stages a new trial key and preserves matching blocker readiness', function() {
    const harness = createHarness();

    expect(harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '/a.png',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-a',
      trialSubsetKind: 'question',
    })).to.equal(true);

    expect(harness.snapshots[harness.snapshots.length - 1]).to.deep.include({
      activeSlotMounted: true,
      activeSlotVisible: false,
      stagedTrialSubsetKey: 'trial-a',
      stagedStimulusBlockerSrc: '/a.png',
      stimulusBlockingAssetReady: false,
      feedbackBlockingAssetReady: true,
      trialSubsetVisible: false,
    });
    expect(harness.stagedTrials).to.deep.equal([{ key: 'trial-a', subsetKind: 'question' }]);
    expect(harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '/a.png',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-a',
      trialSubsetKind: 'question',
    })).to.equal(false);
  });

  it('reveals a queued staged trial after DOM update and paint', async function() {
    const harness = createHarness();
    harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-a',
      trialSubsetKind: 'question',
    });

    harness.setNow(1400);
    harness.setTransitionDuration(180);
    harness.controller.queueRevealIfReady();
    harness.controller.queueRevealIfReady();
    harness.domUpdate.resolve();
    harness.paint.resolve();
    await flushMicrotasks();

    expect(harness.fadeContexts).to.deep.equal([{
      key: 'trial-a',
      subsetKind: 'question',
      visibleSetAt: 1400,
      configuredDurationMs: 180,
    }]);
    expect(harness.firstRevealMarks).to.deep.equal([{ key: 'trial-a', subsetKind: 'question' }]);
    expect(harness.revealStarted).to.deep.equal(['question']);
    expect(harness.controller.getSnapshot()).to.deep.include({
      activeSlotMounted: true,
      activeSlotVisible: true,
      trialSubsetVisible: true,
    });
  });

  it('skips a queued reveal when a staged blocker becomes unready', async function() {
    const harness = createHarness();
    harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-a',
      trialSubsetKind: 'question',
    });
    harness.controller.queueRevealIfReady();
    harness.controller.setBlockingAssetReady({ owner: 'stimulus', ready: false });
    harness.domUpdate.resolve();
    harness.paint.resolve();
    await flushMicrotasks();

    expect(harness.fadeContexts).to.deep.equal([]);
    expect(harness.logs.some((entry) => entry.message === '[ContentSurface][Reveal] queued reveal skipped')).to.equal(true);
  });

  it('reveals an image-backed first trial when its delayed blocker becomes ready', async function() {
    const harness = createHarness();
    harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '/map.png',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'map-trial',
      trialSubsetKind: 'question',
    });

    expect(harness.revealStarted).to.deep.equal([]);
    harness.controller.setBlockingAssetReady({ owner: 'stimulus', ready: true });
    harness.domUpdate.resolve();
    harness.paint.resolve();
    await flushMicrotasks();

    expect(harness.revealStarted).to.deep.equal(['question']);
    expect(harness.controller.getSnapshot()).to.deep.include({
      activeSlotVisible: true,
      stagedTrialSubsetKey: 'map-trial',
      stimulusBlockingAssetReady: true,
      trialSubsetVisible: true,
    });
  });

  it('reveals a mounted ready trial when the async reveal was missed', function() {
    const harness = createHarness();
    harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-a',
      trialSubsetKind: 'question',
    });

    harness.setNow(1500);
    const revealed = harness.controller.revealMountedNowIfReady({
      allBlockingAssetsReady: true,
      isOutgoingFreezeState: false,
      isTestMode: false,
      subsetKind: 'question',
    });

    expect(revealed).to.equal(true);
    expect(harness.fadeContexts).to.deep.equal([{
      key: 'trial-a',
      subsetKind: 'question',
      visibleSetAt: 1500,
      configuredDurationMs: 240,
    }]);
    expect(harness.firstRevealMarks).to.deep.equal([{ key: 'trial-a', subsetKind: 'question' }]);
    expect(harness.revealStarted).to.deep.equal(['question']);
    expect(harness.controller.getSnapshot()).to.deep.include({
      activeSlotMounted: true,
      activeSlotVisible: true,
      trialSubsetVisible: true,
    });
  });

  it('reveals prepared handoff after DOM update without marking first reveal', async function() {
    const harness = createHarness();
    harness.controller.markPreparedHandoffOnNextReveal({
      feedbackReady: true,
      stimulusReady: true,
    });
    harness.controller.syncStage({
      expectedFeedbackBlockerSrc: '/answer.png',
      expectedStimulusBlockerSrc: '/prompt.png',
      isFadingOut: false,
      isOutgoingFreezeState: false,
      showOverlay: true,
      trialSubsetKey: 'trial-b',
      trialSubsetKind: 'question',
    });
    harness.domUpdate.resolve();
    await flushMicrotasks();

    expect(harness.controller.getSnapshot()).to.deep.include({
      activeSlotMounted: true,
      activeSlotVisible: true,
      feedbackBlockingAssetReady: true,
      stimulusBlockingAssetReady: true,
      trialSubsetVisible: true,
    });
    expect(harness.revealStarted).to.deep.equal(['question']);
    expect(harness.firstRevealMarks).to.deep.equal([]);
  });
});
