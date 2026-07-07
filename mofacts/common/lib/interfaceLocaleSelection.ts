import {
  type TargetUiLocale,
  canonicalizeUiLocale,
} from './interfaceLocales';

export const DEFAULT_APPLICATION_UI_LOCALE: TargetUiLocale = 'en';

export interface InterfaceLocaleSelectionInput {
  explicitUserPreference?: string | null | undefined;
  institutionLocale?: string | null | undefined;
  deploymentLocale?: string | null | undefined;
  browserLocales?: readonly string[] | null | undefined;
  applicationLocale?: string | null | undefined;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function requireCanonicalLocale(value: string, source: string): TargetUiLocale {
  const locale = canonicalizeUiLocale(value);
  if (!locale) {
    throw new Error(`Unsupported UI locale "${value}" from ${source}`);
  }
  return locale;
}

export function resolveInterfaceLocale(input: InterfaceLocaleSelectionInput): TargetUiLocale {
  const userPreference = firstNonEmpty(input.explicitUserPreference);
  if (userPreference) {
    return requireCanonicalLocale(userPreference, 'user preference');
  }

  const institutionLocale = firstNonEmpty(input.institutionLocale);
  if (institutionLocale) {
    return requireCanonicalLocale(institutionLocale, 'institution configuration');
  }

  const deploymentLocale = firstNonEmpty(input.deploymentLocale);
  if (deploymentLocale) {
    return requireCanonicalLocale(deploymentLocale, 'deployment configuration');
  }

  const browserLocales = input.browserLocales || [];
  if (browserLocales.length > 0) {
    for (const browserLocale of browserLocales) {
      const locale = canonicalizeUiLocale(browserLocale);
      if (locale) {
        return locale;
      }
    }
    throw new Error(`Unsupported UI locale list from browser preferences: ${browserLocales.join(', ')}`);
  }

  const configuredApplicationLocale = firstNonEmpty(input.applicationLocale) || DEFAULT_APPLICATION_UI_LOCALE;
  return requireCanonicalLocale(configuredApplicationLocale, 'application configuration');
}

