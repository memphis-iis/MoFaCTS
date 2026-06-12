import { expect } from 'chai';
import {
  createCardWakeLockController,
  shouldHoldScreenWakeLock,
  type ScreenWakeLockSentinel,
} from './cardWakeLock';

class FakeWakeLockSentinel implements ScreenWakeLockSentinel {
  released = false;
  releaseCalls = 0;
  private readonly listeners = new Set<EventListener>();

  addEventListener(type: 'release', listener: EventListener): void {
    if (type === 'release') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: 'release', listener: EventListener): void {
    if (type === 'release') {
      this.listeners.delete(listener);
    }
  }

  async release(): Promise<void> {
    this.releaseCalls += 1;
    this.released = true;
  }

  emitRelease(): void {
    this.released = true;
    for (const listener of this.listeners) {
      listener({ type: 'release' } as Event);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

function createHarness(options: {
  active?: boolean;
  requestThrows?: boolean;
  releaseThrows?: boolean;
  supportsWakeLock?: boolean;
  visibilityState?: string;
} = {}) {
  let active = options.active !== false;
  const documentRef = {
    visibilityState: options.visibilityState || 'visible',
  };
  const sentinels: FakeWakeLockSentinel[] = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  const navigatorRef = options.supportsWakeLock === false
    ? {}
    : {
        wakeLock: {
          request: async () => {
            if (options.requestThrows) {
              throw new Error('request denied');
            }
            const sentinel = new FakeWakeLockSentinel();
            if (options.releaseThrows) {
              sentinel.release = async () => {
                sentinel.releaseCalls += 1;
                throw new Error('release failed');
              };
            }
            sentinels.push(sentinel);
            return sentinel;
          },
        },
      };

  const controller = createCardWakeLockController({
    navigatorRef: () => navigatorRef,
    documentRef: () => documentRef,
    shouldHold: () => shouldHoldScreenWakeLock({ active, documentRef }),
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
  });

  return {
    controller,
    documentRef,
    logs,
    sentinels,
    setActive: (value: boolean) => {
      active = value;
    },
  };
}

describe('card wake lock controller', function() {
  it('derives the hold invariant from active state and document visibility', function() {
    expect(shouldHoldScreenWakeLock({
      active: true,
      documentRef: { visibilityState: 'visible' },
    })).to.equal(true);
    expect(shouldHoldScreenWakeLock({
      active: false,
      documentRef: { visibilityState: 'visible' },
    })).to.equal(false);
    expect(shouldHoldScreenWakeLock({
      active: true,
      documentRef: { visibilityState: 'hidden' },
    })).to.equal(false);
  });

  it('requests once while active and visible', async function() {
    const harness = createHarness();

    await harness.controller.sync('initial');
    await harness.controller.sync('repeat');

    expect(harness.sentinels).to.have.length(1);
    expect(harness.sentinels[0]!.listenerCount()).to.equal(1);
    expect(harness.controller.hasActiveWakeLock()).to.equal(true);
    expect(harness.logs.map((entry) => entry.message)).to.include('[CardScreen] Screen wake lock acquired (initial)');
  });

  it('releases when inactive and removes the release listener', async function() {
    const harness = createHarness();

    await harness.controller.sync('initial');
    harness.setActive(false);
    await harness.controller.sync('inactive');

    expect(harness.sentinels[0]!.releaseCalls).to.equal(1);
    expect(harness.sentinels[0]!.listenerCount()).to.equal(0);
    expect(harness.controller.hasActiveWakeLock()).to.equal(false);
    expect(harness.logs.map((entry) => entry.message)).to.include('[CardScreen] Screen wake lock released by app (inactive)');
  });

  it('clears active state when the browser releases the sentinel', async function() {
    const harness = createHarness();

    await harness.controller.request('manual');
    harness.sentinels[0]!.emitRelease();

    expect(harness.controller.hasActiveWakeLock()).to.equal(false);
    expect(harness.logs.map((entry) => entry.message)).to.include('[CardScreen] Screen wake lock released (manual)');
  });

  it('does nothing when the browser API is unavailable or the document is hidden', async function() {
    const unsupported = createHarness({ supportsWakeLock: false });
    await unsupported.controller.sync('unsupported');
    expect(unsupported.sentinels).to.have.length(0);

    const hidden = createHarness({ visibilityState: 'hidden' });
    await hidden.controller.sync('hidden');
    expect(hidden.sentinels).to.have.length(0);
  });

  it('logs request and release failures without throwing', async function() {
    const requestFailure = createHarness({ requestThrows: true });
    await requestFailure.controller.request('denied');
    expect(requestFailure.logs[0]!.message).to.equal('[CardScreen] Screen wake lock request skipped (denied)');
    expect(requestFailure.logs[0]!.details).to.be.instanceOf(Error);

    const releaseFailure = createHarness({ releaseThrows: true });
    await releaseFailure.controller.request('initial');
    await releaseFailure.controller.release('destroy');
    expect(releaseFailure.logs.map((entry) => entry.message))
      .to.include('[CardScreen] Screen wake lock release failed (destroy)');
  });
});
