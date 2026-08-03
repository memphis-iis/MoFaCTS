import { expect } from 'chai';
import { createServerVerbosityObserverCallbacks } from './serverVerbosityObserver';

describe('server verbosity observer callbacks', function() {
  it('applies initial and changed values but ignores unrelated changes', function() {
    const values: unknown[] = [];
    const callbacks = createServerVerbosityObserverCallbacks((value) => values.push(value));

    callbacks.added('setting-id', { value: 1 });
    callbacks.changed('setting-id', { unrelated: true } as { value?: unknown });
    callbacks.changed('setting-id', { value: 2 });

    expect(values).to.deep.equal([1, 2]);
  });

  it('fails closed if the authoritative setting is removed', function() {
    const callbacks = createServerVerbosityObserverCallbacks(() => undefined);
    expect(() => callbacks.removed()).to.throw(
      'Server verbosity setting was removed after initialization',
    );
  });
});
