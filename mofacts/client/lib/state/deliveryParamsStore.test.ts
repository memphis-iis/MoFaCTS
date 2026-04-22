import { expect } from 'chai';
import { Session } from 'meteor/session';
import { DeliveryParamsStore } from './deliveryParamsStore';

describe('DeliveryParamsStore', function() {
  const KEY = 'currentDeliveryParams';

  beforeEach(function() {
    Session.set(KEY, undefined);
  });

  afterEach(function() {
    Session.set(KEY, undefined);
  });

  it('returns an object when state is unset', function() {
    expect(DeliveryParamsStore.get()).to.deep.equal({});
  });

  it('sets and gets params', function() {
    const params = { timeout: 30, mode: 'study' };
    DeliveryParamsStore.set(params);

    expect(DeliveryParamsStore.get()).to.deep.equal(params);
  });

  it('applies updater as immutable-style transform', function() {
    DeliveryParamsStore.set({ timeout: 10, flags: { a: true } });

    const updated = DeliveryParamsStore.update((current) => ({
      ...current,
      timeout: 20,
    }));

    expect(updated.timeout).to.equal(20);
    expect(DeliveryParamsStore.get().timeout).to.equal(20);
    expect(DeliveryParamsStore.get().flags).to.deep.equal({ a: true });
  });
});

