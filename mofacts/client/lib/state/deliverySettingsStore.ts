import { Session } from 'meteor/session';
import type { DeliverySettings } from '../../../common/types/deliverySettings';

const CURRENT_DELIVERY_SETTINGS_KEY = 'currentDeliverySettings';

const deliverySettingsStore = {
  get(): DeliverySettings {
    return Session.get(CURRENT_DELIVERY_SETTINGS_KEY) || {};
  },

  set(value: DeliverySettings = {}): void {
    Session.set(CURRENT_DELIVERY_SETTINGS_KEY, value || {});
  },

  update(updater: (settings: DeliverySettings) => DeliverySettings): DeliverySettings {
    const current = this.get();
    const next = typeof updater === 'function' ? updater({ ...current }) : current;
    this.set(next);
    return next;
  },

  reset(): void {
    Session.set(CURRENT_DELIVERY_SETTINGS_KEY, {});
  },
};

export { deliverySettingsStore };
