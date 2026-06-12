import { expect } from 'chai';
import { createTrialFadeTransitionController } from './trialFadeTransitionController';
import type { ActiveTrialFadeContext } from './activeTrialRevealController';

function createHarness(options: {
  isFadingOut?: boolean;
  isPreparedFadingOut?: boolean;
  isTestMode?: boolean;
  transitionCompleteSent?: boolean;
} = {}) {
  const firstRevealEvents: Array<{ eventType: string }> = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const preparedHandoffs: Array<{ feedbackReady: boolean; stimulusReady: boolean }> = [];
  let transitionMarked = false;
  let transitionSends = 0;
  const fadeContext: ActiveTrialFadeContext = {
    key: 'trial-a',
    subsetKind: 'question',
    visibleSetAt: 1000,
    configuredDurationMs: 160,
  };
  const controller = createTrialFadeTransitionController({
    finishFirstRevealFromTransitionEvent: (params) => {
      firstRevealEvents.push(params);
    },
    getComputedOpacity: () => '0.5',
    getFadeContext: () => fadeContext,
    getRuntimeState: () => ({
      feedbackReadyForPreparedHandoff: true,
      isFadingOut: options.isFadingOut === true,
      isPreparedFadingOut: options.isPreparedFadingOut === true,
      isTestMode: options.isTestMode === true,
      stimulusReadyForPreparedHandoff: false,
      transitionCompleteSent: options.transitionCompleteSent === true,
      trialContentVisible: true,
    }),
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
    markPreparedHandoffOnNextReveal: (params) => {
      preparedHandoffs.push(params);
    },
    markTransitionCompleteSent: () => {
      transitionMarked = true;
    },
    now: () => 1125,
    sendTransitionComplete: () => {
      transitionSends += 1;
    },
  });

  return {
    controller,
    firstRevealEvents,
    logs,
    preparedHandoffs,
    get transitionMarked() {
      return transitionMarked;
    },
    get transitionSends() {
      return transitionSends;
    },
  };
}

describe('trial fade transition controller', function() {
  it('ignores events from other targets or non-opacity properties', function() {
    const harness = createHarness();

    expect(harness.controller.handleTransitionEvent({
      eventType: 'transitionend',
      isOwnTarget: false,
      propertyName: 'opacity',
    })).to.equal(false);
    expect(harness.controller.handleTransitionEvent({
      eventType: 'transitionend',
      isOwnTarget: true,
      propertyName: 'transform',
    })).to.equal(false);

    expect(harness.logs).to.deep.equal([]);
    expect(harness.firstRevealEvents).to.deep.equal([]);
  });

  it('logs fade timing and finishes first reveal for opacity transition events', function() {
    const harness = createHarness();

    expect(harness.controller.handleTransitionEvent({
      eventType: 'transitionstart',
      isOwnTarget: true,
      propertyName: 'opacity',
      pseudoElement: '',
    })).to.equal(true);

    expect(harness.firstRevealEvents).to.deep.equal([{ eventType: 'transitionstart' }]);
    expect(harness.logs[0]).to.deep.equal({
      level: 2,
      message: '[CardScreen][FadeTiming]',
      details: {
        eventType: 'transitionstart',
        key: 'trial-a',
        subsetKind: 'question',
        elapsedSinceRevealTriggerMs: 125,
        configuredDurationMs: 160,
        trialContentVisible: true,
        isFadingOut: false,
        opacity: '0.5',
        pseudoElement: '',
      },
    });
  });

  it('sends transition complete once and preserves prepared handoff readiness', function() {
    const harness = createHarness({
      isFadingOut: true,
      isPreparedFadingOut: true,
    });

    expect(harness.controller.handleTransitionEvent({
      eventType: 'transitionend',
      isOwnTarget: true,
      propertyName: 'opacity',
    })).to.equal(true);

    expect(harness.preparedHandoffs).to.deep.equal([{
      feedbackReady: true,
      stimulusReady: false,
    }]);
    expect(harness.transitionMarked).to.equal(true);
    expect(harness.transitionSends).to.equal(1);
  });

  it('does not complete transitions in test mode or after completion was already sent', function() {
    const testModeHarness = createHarness({
      isFadingOut: true,
      isPreparedFadingOut: true,
      isTestMode: true,
    });
    testModeHarness.controller.handleTransitionEvent({
      eventType: 'transitionend',
      isOwnTarget: true,
      propertyName: 'opacity',
    });
    expect(testModeHarness.transitionSends).to.equal(0);
    expect(testModeHarness.preparedHandoffs).to.deep.equal([]);

    const alreadySentHarness = createHarness({
      isFadingOut: true,
      transitionCompleteSent: true,
    });
    alreadySentHarness.controller.handleTransitionEvent({
      eventType: 'transitionend',
      isOwnTarget: true,
      propertyName: 'opacity',
    });
    expect(alreadySentHarness.transitionSends).to.equal(0);
  });
});
