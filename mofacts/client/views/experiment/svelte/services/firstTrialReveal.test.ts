import { expect } from 'chai';
import {
  createFirstTrialRevealController,
  getElementTransitionDurationMs,
  parseCssTimeToMs,
  type TrialFadeContext,
} from './firstTrialReveal';

function createHarness(options: {
  active?: boolean;
  fadeContext?: TrialFadeContext;
  stable?: boolean;
} = {}) {
  let active = options.active ?? true;
  let stable = options.stable ?? true;
  let fadeContext = options.fadeContext || {
    key: 'trial-1',
    subsetKind: 'question',
    visibleSetAt: 10,
    configuredDurationMs: 0,
  };
  const finished: string[] = [];
  const timings: Array<{ name: string; details?: Record<string, unknown> }> = [];
  const timeouts: Array<{ callback: () => void; delayMs: number }> = [];
  let now = 30;

  const controller = createFirstTrialRevealController({
    finishLaunchLoading: (reason) => {
      finished.push(reason);
      active = false;
    },
    getFadeContext: () => fadeContext,
    isLaunchLoadingActive: () => active,
    isRevealStable: () => stable,
    markLaunchLoadingTiming: (name, details) => {
      const entry: { name: string; details?: Record<string, unknown> } = { name };
      if (details !== undefined) {
        entry.details = details;
      }
      timings.push(entry);
    },
    now: () => now,
    scheduleTimeout: (callback, delayMs) => {
      timeouts.push({ callback, delayMs });
    },
    waitForBrowserPaint: async () => undefined,
    waitForDomUpdate: async () => undefined,
  });

  return {
    controller,
    finished,
    runTimeouts: () => {
      for (const { callback } of timeouts.splice(0)) {
        callback();
      }
    },
    setActive: (next: boolean) => {
      active = next;
    },
    setFadeContext: (next: TrialFadeContext) => {
      fadeContext = next;
    },
    setNow: (next: number) => {
      now = next;
    },
    setStable: (next: boolean) => {
      stable = next;
    },
    timings,
    timeouts,
  };
}

describe('first trial reveal launch loading', function() {
  it('parses CSS transition times in milliseconds and seconds', function() {
    expect(parseCssTimeToMs('80ms')).to.equal(80);
    expect(parseCssTimeToMs('0.2s')).to.equal(200);
    expect(parseCssTimeToMs('75')).to.equal(75);
    expect(parseCssTimeToMs('nonsense')).to.equal(0);
  });

  it('reads the first transition duration and delay from an element', function() {
    const element = {} as Element;
    const duration = getElementTransitionDurationMs(element, () => ({
      transitionDuration: '0.1s, 1s',
      transitionDelay: '50ms, 2s',
    }));

    expect(duration).to.equal(150);
  });

  it('marks class set and finishes on stable transition end', function() {
    const harness = createHarness();

    harness.controller.markRevealClassSet({ key: 'trial-1', subsetKind: 'question' });
    harness.controller.finishFromTransitionEvent({ eventType: 'transitionstart' });
    expect(harness.finished).to.deep.equal([]);

    harness.controller.finishFromTransitionEvent({ eventType: 'transitionend' });

    expect(harness.finished).to.deep.equal(['first-trial-transitionend']);
    expect(harness.timings.map((entry) => entry.name)).to.deep.equal([
      'firstReveal:classSet',
      'firstReveal:fadeStarted',
    ]);
    const fadeStartedDetails = harness.timings[1]?.details;
    expect(fadeStartedDetails).to.include({
      reason: 'first-trial-transitionend',
      key: 'trial-1',
      subsetKind: 'question',
      elapsedSinceRevealTriggerMs: 20,
    });
    expect(harness.controller.getPendingKey()).to.equal('');
  });

  it('finishes after paint when no transition duration is configured', async function() {
    const harness = createHarness();

    harness.controller.markRevealClassSet({ key: 'trial-1', subsetKind: 'question' });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.finished).to.deep.equal(['first-trial-no-transition']);
    expect(harness.timings.map((entry) => entry.name)).to.deep.equal([
      'firstReveal:classSet',
      'firstReveal:noTransitionConfigured',
      'firstReveal:fadeStarted',
    ]);
  });

  it('finishes from the transition-event timeout when a transition event does not arrive', async function() {
    const harness = createHarness({
      fadeContext: {
        key: 'trial-1',
        subsetKind: 'question',
        visibleSetAt: 10,
        configuredDurationMs: 150,
      },
    });

    harness.controller.markRevealClassSet({ key: 'trial-1', subsetKind: 'question' });
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.finished).to.deep.equal([]);
    expect(harness.timeouts[0]?.delayMs).to.equal(230);

    harness.runTimeouts();

    expect(harness.finished).to.deep.equal(['first-trial-transition-timeout']);
    expect(harness.timings.map((entry) => entry.name)).to.deep.equal([
      'firstReveal:classSet',
      'firstReveal:transitionEventTimeout',
      'firstReveal:fadeStarted',
    ]);
  });

  it('defers launch completion when the reveal is not stable yet', function() {
    const harness = createHarness({ stable: false });

    harness.controller.markRevealClassSet({ key: 'trial-1', subsetKind: 'question' });
    harness.controller.finishFromTransitionEvent({ eventType: 'transitionend' });

    expect(harness.finished).to.deep.equal([]);
    expect(harness.timings.map((entry) => entry.name)).to.deep.equal([
      'firstReveal:classSet',
      'firstReveal:finishDeferredUntilStable',
    ]);
  });
});
