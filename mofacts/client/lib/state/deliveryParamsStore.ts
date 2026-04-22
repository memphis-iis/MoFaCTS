import { Session } from 'meteor/session';
import type { DeliveryParams } from '../../../common/types/experiment';

const CURRENT_DELIVERY_PARAMS_KEY = 'currentDeliveryParams';

function getDeliveryParams(): DeliveryParams {
  return Session.get(CURRENT_DELIVERY_PARAMS_KEY) || {};
}

function setDeliveryParams(value: DeliveryParams = {}): void {
  Session.set(CURRENT_DELIVERY_PARAMS_KEY, value || {});
}

function updateDeliveryParams(
  updater: (params: DeliveryParams) => DeliveryParams
): DeliveryParams {
  const current = getDeliveryParams();
  const next = typeof updater === 'function' ? updater({ ...current }) : current;
  setDeliveryParams(next);
  return next;
}

const DeliveryParamsStore = {
  /**
   * Get the current delivery params object stored in Session.
   * Always returns an object to keep downstream consumers simple.
   */
  get: getDeliveryParams,

  /**
   * Replace the current delivery params object.
   */
  set: setDeliveryParams,

  /**
   * Mutate the delivery params object via an updater function.
   */
  update: updateDeliveryParams,
};

export { DeliveryParamsStore };
