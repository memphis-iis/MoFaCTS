export type ServerVerbosityObserverCallbacks = {
  added(_id: string, fields: { value?: unknown }): void;
  changed(_id: string, fields: { value?: unknown }): void;
  removed(): never;
};

export function createServerVerbosityObserverCallbacks(
  applyValue: (value: unknown) => void,
): ServerVerbosityObserverCallbacks {
  return {
    added(_id, fields) {
      applyValue(fields.value);
    },
    changed(_id, fields) {
      if (Object.prototype.hasOwnProperty.call(fields, 'value')) {
        applyValue(fields.value);
      }
    },
    removed() {
      throw new Error('Server verbosity setting was removed after initialization');
    },
  };
}
