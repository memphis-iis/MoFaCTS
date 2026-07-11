import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import { clientConsole } from './userSessionHelpers';
import { normalizeThemePropertyValue } from '../../common/themePropertyNormalization';
import { resolveThemeBrandLabel } from '../../common/themeBranding';
import defaultTheme from '../../public/themes/mofacts-default.json';
import {
  clearSavedUserThemeSelection,
  findAvailableUserTheme,
  getSavedUserThemeId,
  serializeThemeSelection,
} from './userThemeSelection';

declare const DynamicSettings: {
  findOne: (query: { key: string }) =>
    | { value?: Record<string, unknown> & { enabled?: boolean } }
    | undefined;
};

type ThemeData = {
  activeThemeId?: string;
  metadata?: {
    updatedAt?: string;
  };
  themeName?: string;
  properties?: Record<string, unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function updateFaviconLink(rel: string, sizes: string | null, href: string) {
  let selector = `link[rel="${rel}"][type="image/png"]`;
  if (sizes) {
    selector = `link[rel="${rel}"][sizes="${sizes}"]`;
  } else {
    selector = `link[rel="${rel}"][type="image/png"]:not([sizes])`;
  }

  let link = document.querySelector(selector) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (sizes) {
      link.sizes = sizes;
    }
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  link.href = href;
}

function updateManifestLink(href: string) {
  let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = href;
}

function updateAppleTouchIconLink(href: string) {
  let link = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.sizes = '180x180';
    document.head.appendChild(link);
  }
  if (!link.sizes.contains('180x180')) {
    link.setAttribute('sizes', '180x180');
  }
  link.href = href;
}

function updateThemeColorMeta(content: string) {
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = content;
}
// ===== PHASE 1.5 OPTIMIZATION: Theme Subscription =====
// Subscribe to theme publication and set up reactive updates
// This replaces the old method call pattern with reactive publications

// Track if CSS has been applied this page session (resets on refresh, unlike Session)
let themeCssAppliedThisSession = false;
const THEME_FONT_STYLESHEET_LINK_ID = 'mofacts-theme-font-stylesheet';

function applyThemeCssVariable(property: string, rawValue: unknown) {
  const propConverted = '--' + property.replace(/_/g, '-');
  const normalizedValue = normalizeThemePropertyValue(property, rawValue);
  const normalizedText = typeof normalizedValue === 'string' ? normalizedValue.trim() : normalizedValue;

  if (normalizedText == null || normalizedText === '') {
    document.documentElement.style.removeProperty(propConverted);
    return;
  }

  document.documentElement.style.setProperty(propConverted, String(normalizedText));
}

function applyThemeFontStylesheet(rawValue: unknown) {
  const href = asNonEmptyString(rawValue);
  const existingLink = document.getElementById(THEME_FONT_STYLESHEET_LINK_ID) as HTMLLinkElement | null;

  if (!href) {
    existingLink?.remove();
    return;
  }

  const link = existingLink || document.createElement('link');
  link.id = THEME_FONT_STYLESHEET_LINK_ID;
  link.rel = 'stylesheet';

  if (!existingLink) {
    document.head.appendChild(link);
  }

  if (link.getAttribute('href') !== href) {
    link.href = href;
  }
}

// Helper function to apply theme CSS properties
export function applyThemeCSSProperties(themeData: ThemeData | null | undefined) {
  if (!themeData) {
    clientConsole(2, 'applyThemeCSSProperties - no theme data');
    return;
  }

  clientConsole(2, 'applyThemeCSSProperties', themeData);

  // Only update Session if theme has actually changed (prevents unnecessary re-renders)
  const currentTheme = Session.get('curTheme');
  const themeChanged = JSON.stringify(currentTheme) !== JSON.stringify(themeData);

  // Apply CSS if: first run this session OR theme actually changed
  // This handles page refresh (DOM resets but Session persists) without spam on navigation
  const needsCssApplication = !themeCssAppliedThisSession || themeChanged;

  if (needsCssApplication) {
    clientConsole(2, 'Applying theme CSS variables');

    const themeProps = themeData.properties;
    if (themeProps) {
      for (const prop in themeProps) {
        applyThemeCssVariable(prop, themeProps[prop]);
      }
      applyThemeFontStylesheet(themeProps.app_font_stylesheet_url);
    }

    // Set document title
    const titleValue = resolveThemeBrandLabel(themeData, Meteor.settings.public?.systemName);
    clientConsole(2, 'Setting document.title to:', titleValue);
    document.title = titleValue;

    const themePropsForIcons = themeData.properties || {};
    const favicon32 = asNonEmptyString(themePropsForIcons.brand_favicon_32_url);
    const favicon16 = asNonEmptyString(themePropsForIcons.brand_favicon_16_url);
    const logoUrl = asNonEmptyString(themePropsForIcons.brand_logo_url);
    const defaultFavicon = favicon32 || favicon16 || logoUrl;

    if (favicon32) {
      updateFaviconLink('icon', '32x32', favicon32);
    }
    if (favicon16) {
      updateFaviconLink('icon', '16x16', favicon16);
    }
    if (defaultFavicon) {
      updateFaviconLink('icon', null, defaultFavicon);
    }

    const manifestVersionParts = [
      asNonEmptyString(themeData.activeThemeId),
      asNonEmptyString((themeData as { metadata?: { updatedAt?: string } }).metadata?.updatedAt),
      asNonEmptyString(themeData.themeName),
    ].filter(Boolean);
    const manifestVersion = manifestVersionParts.length > 0
      ? encodeURIComponent(manifestVersionParts.join(':'))
      : 'default';
    updateManifestLink(`/site.webmanifest?v=${manifestVersion}`);
    updateAppleTouchIconLink(`/apple-touch-icon.png?v=${manifestVersion}`);

    const themeColor = asNonEmptyString(themePropsForIcons.app_background_color) || '#F2F2F2';
    updateThemeColorMeta(themeColor);

    themeCssAppliedThisSession = true;
  }

  if (themeChanged) {
    clientConsole(2, 'Theme changed, updating Session');
    Session.set('curTheme', themeData);
  }

  // Mark theme as ready (enables navbar rendering without layout shift)
  Session.set('themeReady', true);
}

// Subscribe to theme and set up reactive autorun
// This function should be called once on app startup
export function getCurrentTheme() {
  clientConsole(2, 'getCurrentTheme - setting up theme subscription');
  // Never paint a cached or temporary theme: either can be stale. The layout
  // remains non-visible until this subscription supplies the authoritative one.
  Session.set('themeReady', false);

  // Subscribe to theme publication and track when ready
  const themeSubscription = Meteor.subscribe('theme');
  const themeLibrarySubscription = Meteor.subscribe('themeLibrary');

  // Set up reactive autorun to apply theme whenever it changes
  Tracker.autorun(() => {
    clientConsole(2, 'getCurrentTheme - autorun triggered');

    // Wait for subscription to be ready before applying theme
    // This prevents flash of default theme before actual theme loads
    if (!themeSubscription.ready()) {
      clientConsole(2, 'getCurrentTheme - subscription not ready, waiting...');
      return;
    }

    const themeSetting = DynamicSettings.findOne({key: 'customTheme'});
    let themeData: ThemeData | undefined;

    if (themeSetting && themeSetting.value && themeSetting.value.enabled !== false) {
      // Use active custom theme
      themeData = themeSetting.value as ThemeData;
      Session.set('serverActiveTheme', themeData);
      clientConsole(2, 'getCurrentTheme - using custom theme');
    } else {
      // No custom theme; use MoFaCTS default theme
      clientConsole(2, 'getCurrentTheme - no custom theme found, using MoFaCTS default');
      themeData = {
        ...(defaultTheme as ThemeData),
        activeThemeId: 'mofacts-default',
        themeName: 'MoFaCTS',
      };
      Session.set('serverActiveTheme', themeData);
    }

    const savedThemeId = getSavedUserThemeId();
    if (savedThemeId) {
      if (!themeLibrarySubscription.ready()) {
        clientConsole(2, 'getCurrentTheme - theme library not ready, waiting for local theme selection');
        return;
      }
      const selectedTheme = findAvailableUserTheme(savedThemeId);
      if (!selectedTheme) {
        clearSavedUserThemeSelection(savedThemeId);
        Session.set('userThemeOverrideActive', false);
        clientConsole(1, `[ThemeToggle] Saved theme "${savedThemeId}" is no longer configured.`);
      } else {
        Session.set('userThemeOverrideActive', true);
        applyThemeCSSProperties(serializeThemeSelection(selectedTheme));
        return;
      }
    }

    if (Session.get('userThemeOverrideActive') === true) {
      clientConsole(2, 'getCurrentTheme - user theme override active');
      return;
    }

    applyThemeCSSProperties(themeData);
  });
}
