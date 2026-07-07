import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import {
  DEFAULT_APPLICATION_UI_LOCALE,
  resolveInterfaceLocale,
} from '../../common/lib/interfaceLocaleSelection';
import {
  type TargetUiLocale,
  getTextDirectionForLocale,
} from '../../common/lib/interfaceLocales';

export const UI_LOCALE_SESSION_KEY = 'uiLocale';

type UserLocaleProfile = {
  profile?: {
    uiLocale?: string;
    institutionLocale?: string;
  };
};

type PublicLocaleSettings = {
  uiLocale?: string;
  institutionLocale?: string;
  allowBrowserUiLocale?: boolean;
};

function getPublicLocaleSettings(): PublicLocaleSettings {
  return (Meteor.settings.public || {}) as PublicLocaleSettings;
}

export function getActiveUiLocale(): TargetUiLocale {
  const settings = getPublicLocaleSettings();
  const user = Meteor.user() as UserLocaleProfile | null;
  const sessionLocale = String(Session.get(UI_LOCALE_SESSION_KEY) || '').trim();

  return resolveInterfaceLocale({
    explicitUserPreference: sessionLocale || user?.profile?.uiLocale,
    institutionLocale: user?.profile?.institutionLocale || settings.institutionLocale,
    deploymentLocale: settings.uiLocale,
    browserLocales: settings.allowBrowserUiLocale === true
      ? navigator.languages
      : [],
    applicationLocale: DEFAULT_APPLICATION_UI_LOCALE,
  });
}

export function setActiveUiLocale(locale: string): TargetUiLocale {
  const resolved = resolveInterfaceLocale({ explicitUserPreference: locale });
  Session.set(UI_LOCALE_SESSION_KEY, resolved);
  applyActiveUiLocaleToDocument(resolved);
  return resolved;
}

export function applyActiveUiLocaleToDocument(locale: TargetUiLocale = getActiveUiLocale()): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = getTextDirectionForLocale(locale);
}

