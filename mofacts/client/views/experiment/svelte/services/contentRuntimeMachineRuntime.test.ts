import { expect } from 'chai';
import {
  createContentRuntimeMachineRuntimeController,
  getContentRuntimeMachineSnapshot,
  getInitialContentRuntimeMachineSnapshot,
  prepareActiveContentRuntimeForNavigation,
  registerActiveContentRuntimeForNavigation,
  type ContentRuntimeMachineActor,
  type ContentRuntimeMachineSnapshot,
} from './contentRuntimeMachineRuntime';

function snapshot(value: unknown): ContentRuntimeMachineSnapshot {
  return {
    value,
    context: {},
    matches: (state) => state === value || (typeof value === 'string' && value.startsWith(`${state}.`)),
  };
}

class FakeActor implements ContentRuntimeMachineActor {
  starts = 0;
  stops = 0;
  unsubscribes = 0;
  events: unknown[] = [];
  private readonly subscribers = new Set<(next: ContentRuntimeMachineSnapshot) => void>();

  constructor(private currentSnapshot: ContentRuntimeMachineSnapshot = snapshot('idle')) {}

  send(event: unknown): void { this.events.push(event); }

  getSnapshot(): ContentRuntimeMachineSnapshot {
    return this.currentSnapshot;
  }

  start(): void {
    this.starts += 1;
  }

  stop(): void {
    this.stops += 1;
  }

  subscribe(handler: (next: ContentRuntimeMachineSnapshot) => void): { unsubscribe: () => void } {
    this.subscribers.add(handler);
    return {
      unsubscribe: () => {
        this.unsubscribes += 1;
        this.subscribers.delete(handler);
      },
    };
  }

  emit(next: ContentRuntimeMachineSnapshot): void {
    this.currentSnapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber(next);
    }
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }
}

describe('card machine runtime controller', function() {
  it('provides the idle initial snapshot', function() {
    const initial = getInitialContentRuntimeMachineSnapshot();

    expect(initial.value).to.equal('idle');
    expect(initial.context).to.deep.equal({});
    expect(initial.matches('idle')).to.equal(true);
    expect(initial.matches('idle.ready')).to.equal(false);
  });

  it('falls back to the initial snapshot when getSnapshot fails', function() {
    const logs: unknown[] = [];
    const actor = {
      getSnapshot: () => {
        throw new Error('snapshot failed');
      },
    };

    const result = getContentRuntimeMachineSnapshot(actor, (_level, _message, details) => logs.push(details));

    expect(result.value).to.equal('idle');
    expect(logs[0]).to.be.instanceOf(Error);
  });

  it('starts the actor, publishes the initial snapshot, and dispatches START once on idle.ready', function() {
    const actor = new FakeActor(snapshot('idle'));
    const states: unknown[] = [];
    const startEvents: unknown[] = [];
    let currentUnitId = 0;
    const controller = createContentRuntimeMachineRuntimeController({
      machine: { id: 'card' },
      createActor: () => actor,
      setState: (next) => states.push(next.value),
      sendStartEvent: (event) => startEvents.push(event),
      getStartEvent: () => ({
        type: 'START',
        userId: 'user-a',
        attemptId: 'attempt-a',
        unitId: currentUnitId,
      }),
      log: () => undefined,
    });

    controller.start();
    currentUnitId = 1;
    actor.emit(snapshot('idle.ready'));
    actor.emit(snapshot('idle.ready'));

    expect(actor.starts).to.equal(1);
    expect(actor.subscriberCount()).to.equal(1);
    expect(states).to.deep.equal(['idle', 'idle.ready', 'idle.ready']);
    expect(startEvents).to.deep.equal([{
      type: 'START',
      userId: 'user-a',
      attemptId: 'attempt-a',
      unitId: 1,
    }]);
  });

  it('does not add duplicate subscriptions when start is called repeatedly', function() {
    const actor = new FakeActor();
    const controller = createContentRuntimeMachineRuntimeController({
      machine: {},
      createActor: () => actor,
      setState: () => undefined,
      sendStartEvent: () => undefined,
      getStartEvent: () => ({ type: 'START' }),
      log: () => undefined,
    });

    controller.start();
    controller.start();

    expect(actor.starts).to.equal(2);
    expect(actor.subscriberCount()).to.equal(1);
  });

  it('unsubscribes and stops the actor on cleanup', function() {
    const actor = new FakeActor();
    const controller = createContentRuntimeMachineRuntimeController({
      machine: {},
      createActor: () => actor,
      setState: () => undefined,
      sendStartEvent: () => undefined,
      getStartEvent: () => ({ type: 'START' }),
      log: () => undefined,
    });

    controller.start();
    controller.stop();

    expect(actor.unsubscribes).to.equal(1);
    expect(actor.stops).to.equal(1);
    expect(actor.subscriberCount()).to.equal(0);
    expect(controller.getActor()).to.equal(null);
  });

  function navigationHarness(initial: string) {
    const actor = new FakeActor(snapshot(initial));
    const controller = createContentRuntimeMachineRuntimeController({
      machine: {}, createActor: () => actor, setState: () => undefined,
      sendStartEvent: () => undefined, getStartEvent: () => ({ type: 'START' }), log: () => undefined,
    });
    controller.start();
    return { actor, controller };
  }

  it('shares repeated leave requests and waits for the committed navigation checkpoint', async function() {
    const { actor, controller } = navigationHarness('feedback.waiting');
    try {
      let navigated = false;
      const pending = controller.prepareToLeave();
      expect(controller.prepareToLeave()).to.equal(pending);
      void pending.then(() => { navigated = true; });
      for (const state of ['transition.logging', 'transition.updatingState', 'transition.trackingPerformance']) {
        actor.emit(snapshot(state));
        await Promise.resolve();
        expect(navigated).to.equal(false);
      }
      expect(actor.events).to.deep.equal([{ type: 'LEAVE_REQUESTED' }]);
      actor.emit(snapshot('navigationReady'));
      await pending;
      expect(navigated).to.equal(true);
      expect(actor.subscriberCount()).to.equal(1);
    } finally { controller.stop(); }
  });

  it('parks an untouched prompt without inventing an answer, and waits for evaluation of a submitted answer', async function() {
    const { actor, controller } = navigationHarness('presenting.awaiting');
    try {
      const untouched = controller.prepareToLeave();
      actor.emit(snapshot('navigationReady'));
      await untouched;
      expect(actor.events).to.deep.equal([{ type: 'LEAVE_REQUESTED' }]);
      actor.emit(snapshot('presenting.validating'));
      const pending = controller.prepareToLeave();
      actor.emit(snapshot('feedback.waiting'));
      actor.emit(snapshot('navigationReady'));
      await pending;
      expect(actor.events).to.deep.equal([{ type: 'LEAVE_REQUESTED' }, { type: 'LEAVE_REQUESTED' }]);
    } finally { controller.stop(); }
  });

  it('keeps failed commits blocked without replaying the trial write', async function() {
    const { actor, controller } = navigationHarness('transition.logging');
    try {
      const pending = controller.prepareToLeave();
      actor.emit(snapshot('error'));
      for (const result of [pending, controller.prepareToLeave()]) {
        try { await result; throw new Error('Expected rejection'); }
        catch (error) { expect((error as Error).message).to.equal('The accepted trial could not be saved'); }
      }
      expect(actor.events).to.have.length(1);
    } finally { controller.stop(); }
  });

  it('unregisters the owner and rejects an interrupted pending save on cleanup', async function() {
    const { controller } = navigationHarness('feedback.waiting');
    const unregister = registerActiveContentRuntimeForNavigation(controller);
    const pending = prepareActiveContentRuntimeForNavigation();
    controller.stop();
    unregister();
    try { await pending; throw new Error('Expected rejection'); }
    catch (error) { expect((error as Error).message).to.contain('stopped before its trial was saved'); }
    await prepareActiveContentRuntimeForNavigation();
  });
});
