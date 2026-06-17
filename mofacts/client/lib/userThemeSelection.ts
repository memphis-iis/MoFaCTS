import { Meteor } from 'meteor/meteor';

declare const DynamicSettings: {
  findOne: (query: { key: string }) =>
    | { value?: unknown }
    | undefined;
};

const USER_THEME_SELECTION_KEY_PREFIX = 'mofacts.userThemeSelection.v1.';
const DEVICE_THEME_SELECTION_KEY = 'mofacts.userThemeSelection.v1.device';

export type ThemeLibraryEntry = {
  id?: string;
  activeThemeId?: string;
  enabled?: boolean;
  themeName?: string;
  properties?: Record<string, unknown>;
  metadata?: {
    name?: string;
    updatedAt?: string;
  };
};

export function getThemeLibrary(): ThemeLibraryEntry[] {
  const librarySetting = DynamicSettings.findOne({ key: 'themeLibrary' });
  const library = librarySetting?.value;
  return Array.isArray(library) ? library : [];
}

export function getAvailableUserThemes(): ThemeLibraryEntry[] {
  return getThemeLibrary().filter((theme) => {
    return typeof theme?.id === 'string' && theme.id.trim().length > 0 && theme.enabled !== false && theme.properties;
  });
}

export function serializeThemeSelection(theme: ThemeLibraryEntry): ThemeLibraryEntry {
  if (!theme.id || !theme.properties) {
    throw new Error('[ThemeToggle] Selected theme is missing id or properties.');
  }
  return {
    ...theme,
    activeThemeId: theme.id,
    themeName: theme.themeName || theme.properties.themeName as string || theme.metadata?.name || theme.id,
  };
}

export function getUserThemeSelectionKey(): string | null {
  const userId = Meteor.userId();
  if (!userId) {
    return null;
  }
  return `${USER_THEME_SELECTION_KEY_PREFIX}${userId}`;
}

export function getSavedUserThemeId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  const userThemeKey = getUserThemeSelectionKey();
  if (userThemeKey) {
    const userThemeId = window.localStorage.getItem(userThemeKey);
    if (userThemeId) {
      return userThemeId;
    }
  }
  return window.localStorage.getItem(DEVICE_THEME_SELECTION_KEY);
}

export function saveUserThemeSelection(themeId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('[ThemeToggle] User theme selection requires localStorage.');
  }
  const key = getUserThemeSelectionKey();
  if (key) {
    window.localStorage.setItem(key, themeId);
  }
  window.localStorage.setItem(DEVICE_THEME_SELECTION_KEY, themeId);
}

export function clearSavedUserThemeSelection(themeId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const key = getUserThemeSelectionKey();
  if (key && window.localStorage.getItem(key) === themeId) {
    window.localStorage.removeItem(key);
  }
  if (window.localStorage.getItem(DEVICE_THEME_SELECTION_KEY) === themeId) {
    window.localStorage.removeItem(DEVICE_THEME_SELECTION_KEY);
  }
}

export function findAvailableUserTheme(themeId: string | null): ThemeLibraryEntry | undefined {
  if (!themeId) {
    return undefined;
  }
  return getAvailableUserThemes().find((theme) => theme.id === themeId);
}

export function getThemeDisplayName(theme: ThemeLibraryEntry): string {
  const propertyThemeName = theme.properties?.themeName;
  if (typeof theme.metadata?.name === 'string' && theme.metadata.name.trim()) {
    return theme.metadata.name.trim();
  }
  if (typeof theme.themeName === 'string' && theme.themeName.trim()) {
    return theme.themeName.trim();
  }
  if (typeof propertyThemeName === 'string' && propertyThemeName.trim()) {
    return propertyThemeName.trim();
  }
  if (theme.id) {
    return theme.id;
  }
  throw new Error('[ThemeToggle] Theme menu entry is missing a display name and id.');
}
