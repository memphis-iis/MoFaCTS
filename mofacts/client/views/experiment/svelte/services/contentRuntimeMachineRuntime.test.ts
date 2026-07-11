import { expect } from 'chai';
import {
  createContentRuntimeMachineRuntimeController,
  getContentRuntimeMachineSnapshot,
  getInitialContentRuntimeMachineSnapshot,
  type ContentRuntimeMachineActor,
  type ContentRuntimeMachineSnapshot,
} from './contentRuntimeMachineRuntime';

function snapshot(value: unknown): ContentRuntimeMachineSnapshot {
  return {
    value,
    context: {},
    matches: (state) => state === value,
  };
}

class FakeActor implements ContentRuntimeMachineActor {
  starts = 0;
  stops = 0;
  unsubscribes = 0;
  private readonly subscribers = new Set<(next: ContentRuntimeMachineSnapshot) => void>();

  constructor(private readonly currentSnapshot: ContentRuntimeMachineSnapshot = snapshot('idle')) {}

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
});
