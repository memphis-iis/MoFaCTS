import { expect } from 'chai';
import { DelayedLoadingVisibility } from './delayedLoadingVisibility';

type ScheduledTask = { at: number; callback: () => void };

function createClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map<number, ScheduledTask>();
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const due = [...tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      now = due[1].at;
      tasks.delete(due[0]);
      due[1].callback();
    }
    now = target;
  };
  return {
    now: () => now,
    schedule(callback: () => void, delayMs: number) {
      const id = nextId++;
      tasks.set(id, { at: now + delayMs, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel(timer: ReturnType<typeof setTimeout>) {
      tasks.delete(timer as unknown as number);
    },
    advance,
  };
}

describe('DelayedLoadingVisibility', function() {
  it('does not reveal feedback for a fast operation', function() {
    const clock = createClock();
    const changes: boolean[] = [];
    const visibility = new DelayedLoadingVisibility({
      onVisibilityChange: (visible) => changes.push(visible),
      ...clock,
    });

    visibility.setPending(true);
    clock.advance(199);
    visibility.setPending(false);
    clock.advance(1000);

    expect(changes).to.deep.equal([]);
  });

  it('reveals after 200ms and remains visible for at least 400ms', function() {
    const clock = createClock();
    const changes: Array<{ visible: boolean; at: number }> = [];
    const visibility = new DelayedLoadingVisibility({
      onVisibilityChange: (visible) => changes.push({ visible, at: clock.now() }),
      ...clock,
    });

    visibility.setPending(true);
    clock.advance(200);
    visibility.setPending(false);
    clock.advance(399);
    expect(changes).to.deep.equal([{ visible: true, at: 200 }]);
    clock.advance(1);
    expect(changes).to.deep.equal([
      { visible: true, at: 200 },
      { visible: false, at: 600 },
    ]);
  });

  it('keeps visible feedback stable when loading resumes during its minimum duration', function() {
    const clock = createClock();
    const changes: boolean[] = [];
    const visibility = new DelayedLoadingVisibility({
      onVisibilityChange: (visible) => changes.push(visible),
      ...clock,
    });

    visibility.setPending(true);
    clock.advance(200);
    visibility.setPending(false);
    clock.advance(100);
    visibility.setPending(true);
    clock.advance(500);
    expect(changes).to.deep.equal([true]);
    visibility.setPending(false);
    expect(changes).to.deep.equal([true, false]);
  });

  it('transitions persistent loading to a slow state after five seconds', function() {
    const clock = createClock();
    const visibilityChanges: boolean[] = [];
    const slowChanges: boolean[] = [];
    const visibility = new DelayedLoadingVisibility({
      onVisibilityChange: (visible) => visibilityChanges.push(visible),
      onSlowChange: (slow) => slowChanges.push(slow),
      ...clock,
    });

    visibility.setPending(true);
    clock.advance(4999);
    expect(visibilityChanges).to.deep.equal([true]);
    expect(slowChanges).to.deep.equal([]);
    clock.advance(1);
    expect(slowChanges).to.deep.equal([true]);
    visibility.setPending(false);
    expect(visibilityChanges).to.deep.equal([true, false]);
    expect(slowChanges).to.deep.equal([true, false]);
  });

  it('never enters the slow state after a completed fast load', function() {
    const clock = createClock();
    const slowChanges: boolean[] = [];
    const visibility = new DelayedLoadingVisibility({
      onVisibilityChange: () => undefined,
      onSlowChange: (slow) => slowChanges.push(slow),
      ...clock,
    });

    visibility.setPending(true);
    clock.advance(100);
    visibility.setPending(false);
    clock.advance(6000);
    expect(slowChanges).to.deep.equal([]);
  });
});
