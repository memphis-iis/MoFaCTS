import { expect } from 'chai';
import { createTrialFadeTransitionController } from './trialFadeTransitionController';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  let opacity = '0';
  let animations: Animation[] = [];
  const element = { isConnected: true, getAnimations: () => animations } as unknown as Element;
  let currentElement: Element | null = element;
  let domUpdate: Promise<void> = Promise.resolve();
  const handoffs: unknown[] = [];
  const logs: unknown[] = [];
  const controller = createTrialFadeTransitionController({
    getFadeElement: () => currentElement,
    getComputedOpacity: () => opacity,
    getFadeContext: () => ({ key: 'trial-a', subsetKind: 'feedback', visibleSetAt: 1, configuredDurationMs: 200 }),
    getRuntimeState: () => ({ isFadingOut: true, isPreparedFadingOut: true, isTestMode: false,
      feedbackReadyForPreparedHandoff: true, stimulusReadyForPreparedHandoff: false, trialContentVisible: true }),
    log: (...args) => { logs.push(args); },
    markPreparedHandoffOnNextReveal: value => { handoffs.push(value); },
    now: () => 10,
    waitForDomUpdate: () => domUpdate,
  });
  return { controller, element, handoffs, logs,
    setOpacity: (value: string) => { opacity = value; },
    setElement: (value: Element | null) => { currentElement = value; },
    setDomUpdate: (value: Promise<void>) => { domUpdate = value; },
    setAnimations: (value: Animation[]) => { animations = value; },
    animation: (finished: Promise<void>, target = element, property = 'opacity', pseudoElement: string | null = null) =>
      ({ finished, transitionProperty: property, effect: { target, pseudoElement } }) as unknown as Animation,
  };
}

async function rejects(promise: Promise<void>, pattern: RegExp) {
  let caught: unknown;
  try { await promise; } catch (error) { caught = error; }
  expect(caught).to.be.instanceOf(Error);
  expect((caught as Error).message).to.match(pattern);
}

describe('trial fade transition controller', function() {
  it('waits for the DOM update and actual outgoing opacity animation before preparing the handoff', async function() {
    const h = harness();
    const dom = deferred();
    const fade = deferred();
    h.setDomUpdate(dom.promise);
    h.setAnimations([h.animation(fade.promise)]);
    let complete = false;
    const pending = h.controller.waitForFadeOut(new AbortController().signal).then(() => { complete = true; });
    dom.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(complete).to.equal(false);
    expect(h.handoffs).to.deep.equal([]);
    fade.resolve();
    await pending;
    expect(complete).to.equal(true);
    expect(h.handoffs).to.deep.equal([{ feedbackReady: true, stimulusReady: false }]);
  });

  it('completes an already-hidden zero-duration fade without a transition event', async function() {
    const h = harness();
    await h.controller.waitForFadeOut(new AbortController().signal);
    expect(h.handoffs).to.have.length(1);
  });

  it('does not wait for child, pseudo-element, or non-opacity animations', async function() {
    const h = harness();
    const unrelated = deferred();
    h.setAnimations([h.animation(unrelated.promise, {} as Element),
      h.animation(unrelated.promise, h.element, 'transform'), h.animation(unrelated.promise, h.element, 'opacity', '::before')]);
    await h.controller.waitForFadeOut(new AbortController().signal);
    expect(h.handoffs).to.have.length(1);
  });

  it('propagates unexpected animation cancellation without a successful handoff', async function() {
    const h = harness();
    const fade = deferred();
    h.setAnimations([h.animation(fade.promise)]);
    const pending = h.controller.waitForFadeOut(new AbortController().signal);
    await Promise.resolve();
    fade.reject(new Error('Animation cancelled'));
    await rejects(pending, /Animation cancelled/);
    expect(h.handoffs).to.deep.equal([]);
  });

  it('aborts the wait when its state exits and ignores a late animation completion', async function() {
    const h = harness();
    const fade = deferred();
    h.setAnimations([h.animation(fade.promise)]);
    const abort = new AbortController();
    const pending = h.controller.waitForFadeOut(abort.signal);
    await Promise.resolve();
    abort.abort(new Error('State exited'));
    await rejects(pending, /State exited/);
    fade.resolve();
    await Promise.resolve();
    expect(h.handoffs).to.deep.equal([]);
  });

  it('does not inspect or complete an abandoned DOM update', async function() {
    const h = harness();
    const dom = deferred();
    h.setDomUpdate(dom.promise);
    const abort = new AbortController();
    const pending = h.controller.waitForFadeOut(abort.signal);
    abort.abort(new Error('State exited'));
    dom.resolve();
    await rejects(pending, /State exited/);
    expect(h.handoffs).to.deep.equal([]);
  });

  it('rejects missing, replaced, or still-visible outgoing elements', async function() {
    const missing = harness();
    missing.setElement(null);
    await rejects(missing.controller.waitForFadeOut(new AbortController().signal), /connected outgoing card/);
    const visible = harness();
    visible.setOpacity('1');
    await rejects(visible.controller.waitForFadeOut(new AbortController().signal), /without hiding/);
    const replaced = harness();
    const fade = deferred();
    replaced.setAnimations([replaced.animation(fade.promise)]);
    const pending = replaced.controller.waitForFadeOut(new AbortController().signal);
    await Promise.resolve();
    replaced.setElement({ isConnected: true } as Element);
    fade.resolve();
    await rejects(pending, /element changed/);
  });

  it('keeps transition events diagnostic and never completes a handoff from them', function() {
    const h = harness();
    expect(h.controller.logTransitionEvent({ isOwnTarget: false, propertyName: 'opacity' })).to.equal(false);
    expect(h.controller.logTransitionEvent({ isOwnTarget: true, propertyName: 'transform' })).to.equal(false);
    expect(h.controller.logTransitionEvent({ isOwnTarget: true, propertyName: 'opacity', eventType: 'transitionend' })).to.equal(true);
    expect(h.logs).to.have.length(1);
    expect(h.handoffs).to.deep.equal([]);
  });
});
