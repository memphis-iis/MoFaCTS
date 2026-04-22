import { Session } from 'meteor/session';
import type { UiSettings } from '../../../common/types/uiSettings';

const CUR_TDF_UI_SETTINGS_KEY = 'curTdfUISettings';

const UiSettingsStore = {
  get(): UiSettings {
    return Session.get(CUR_TDF_UI_SETTINGS_KEY) || {};
  },

  set(value: UiSettings = {}): void {
    Session.set(CUR_TDF_UI_SETTINGS_KEY, value || {});
  },

  reset(): void {
    Session.set(CUR_TDF_UI_SETTINGS_KEY, {});
  },
};

export { UiSettingsStore };
