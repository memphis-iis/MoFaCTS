import { expect } from 'chai';
import { Session } from 'meteor/session';
import { deliverySettingsStore } from './deliverySettingsStore';

describe('deliverySettingsStore', function() {
  const KEY = 'currentDeliverySettings';

  beforeEach(function() {
    Session.set(KEY, undefined);
  });

  afterEach(function() {
    Session.set(KEY, undefined);
  });

  it('returns an object when state is unset', function() {
    expect(deliverySettingsStore.get()).to.deep.equal({});
  });

  it('sets and gets settings', function() {
    const settings = { timeout: 30, mode: 'study' };
    deliverySettingsStore.set(settings);

    expect(deliverySettingsStore.get()).to.deep.equal(settings);
  });

  it('applies updater as immutable-style transform', function() {
    deliverySettingsStore.set({ timeout: 10, flags: { a: true } });

    const updated = deliverySettingsStore.update((current) => ({
      ...current,
      timeout: 20,
    }));

    expect(updated.timeout).to.equal(20);
    expect(deliverySettingsStore.get().timeout).to.equal(20);
    expect(deliverySettingsStore.get().flags).to.deep.equal({ a: true });
  });
});
