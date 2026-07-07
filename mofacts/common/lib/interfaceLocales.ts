export const TARGET_UI_LOCALES = [
  'en',
  'zh-Hans',
  'hi',
  'es',
  'ar',
  'fr',
  'bn',
  'pt',
  'id',
  'ur',
] as const;

export type TargetUiLocale = typeof TARGET_UI_LOCALES[number];

export type TextDirection = 'ltr' | 'rtl';

export type PrimaryTtsLanguageCode =
  | 'en-US'
  | 'cmn-CN'
  | 'hi-IN'
  | 'es-ES'
  | 'ar-XA'
  | 'fr-FR'
  | 'bn-IN'
  | 'pt-BR'
  | 'id-ID'
  | 'ur-IN';

export interface TargetLocaleDefinition {
  locale: TargetUiLocale;
  englishName: string;
  nativeName: string;
  primaryTtsLanguageCode: PrimaryTtsLanguageCode;
  direction: TextDirection;
}

export const TARGET_LOCALE_DEFINITIONS = Object.freeze({
  en: {
    locale: 'en',
    englishName: 'English',
    nativeName: 'English',
    primaryTtsLanguageCode: 'en-US',
    direction: 'ltr',
  },
  'zh-Hans': {
    locale: 'zh-Hans',
    englishName: 'Mandarin Chinese',
    nativeName: '中文',
    primaryTtsLanguageCode: 'cmn-CN',
    direction: 'ltr',
  },
  hi: {
    locale: 'hi',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    primaryTtsLanguageCode: 'hi-IN',
    direction: 'ltr',
  },
  es: {
    locale: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    primaryTtsLanguageCode: 'es-ES',
    direction: 'ltr',
  },
  ar: {
    locale: 'ar',
    englishName: 'Standard Arabic',
    nativeName: 'العربية',
    primaryTtsLanguageCode: 'ar-XA',
    direction: 'rtl',
  },
  fr: {
    locale: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    primaryTtsLanguageCode: 'fr-FR',
    direction: 'ltr',
  },
  bn: {
    locale: 'bn',
    englishName: 'Bengali',
    nativeName: 'বাংলা',
    primaryTtsLanguageCode: 'bn-IN',
    direction: 'ltr',
  },
  pt: {
    locale: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    primaryTtsLanguageCode: 'pt-BR',
    direction: 'ltr',
  },
  id: {
    locale: 'id',
    englishName: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    primaryTtsLanguageCode: 'id-ID',
    direction: 'ltr',
  },
  ur: {
    locale: 'ur',
    englishName: 'Urdu',
    nativeName: 'اردو',
    primaryTtsLanguageCode: 'ur-IN',
    direction: 'rtl',
  },
} satisfies Record<TargetUiLocale, TargetLocaleDefinition>);

const EXPLICIT_LOCALE_ALIASES = Object.freeze({
  'en-us': 'en',
  'en-gb': 'en',
  'zh': 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-hans-cn': 'zh-Hans',
  'hi-in': 'hi',
  'es-es': 'es',
  'es-us': 'es',
  'es-mx': 'es',
  'ar-xa': 'ar',
  'ar-sa': 'ar',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'bn-in': 'bn',
  'bn-bd': 'bn',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  'id-id': 'id',
  'ur-in': 'ur',
  'ur-pk': 'ur',
} satisfies Record<string, TargetUiLocale>);

export interface PlatformTtsResolutionInput {
  uiLocale: string;
  voiceLocaleOverride?: string | null | undefined;
  allowedVoiceLocaleOverrides?: readonly string[] | undefined;
  availableVoiceLocales?: readonly string[] | undefined;
}

export interface PlatformTtsResolution {
  status: 'ok' | 'unsupported-locale' | 'disallowed-override' | 'missing-voice';
  languageCode?: PrimaryTtsLanguageCode | string;
  reason?: string;
}

export function isTargetUiLocale(value: string): value is TargetUiLocale {
  return TARGET_UI_LOCALES.includes(value as TargetUiLocale);
}

export function canonicalizeUiLocale(rawLocale: string | null | undefined): TargetUiLocale | null {
  const normalized = String(rawLocale || '').trim();
  if (!normalized) {
    return null;
  }

  if (isTargetUiLocale(normalized)) {
    return normalized;
  }

  const alias = EXPLICIT_LOCALE_ALIASES[normalized.toLowerCase() as keyof typeof EXPLICIT_LOCALE_ALIASES];
  return alias || null;
}

export function requireTargetUiLocale(rawLocale: string | null | undefined): TargetUiLocale {
  const locale = canonicalizeUiLocale(rawLocale);
  if (!locale) {
    throw new Error(`Unsupported UI locale "${String(rawLocale || '')}"`);
  }
  return locale;
}

export function getTargetLocaleDefinition(locale: TargetUiLocale): TargetLocaleDefinition {
  return TARGET_LOCALE_DEFINITIONS[locale];
}

export function getTextDirectionForLocale(rawLocale: string | null | undefined): TextDirection {
  return getTargetLocaleDefinition(requireTargetUiLocale(rawLocale)).direction;
}

export function getPrimaryTtsLanguageCode(rawLocale: string | null | undefined): PrimaryTtsLanguageCode {
  return getTargetLocaleDefinition(requireTargetUiLocale(rawLocale)).primaryTtsLanguageCode;
}

export function resolvePlatformPromptTtsLanguage(input: PlatformTtsResolutionInput): PlatformTtsResolution {
  const locale = canonicalizeUiLocale(input.uiLocale);
  if (!locale) {
    return {
      status: 'unsupported-locale',
      reason: `Unsupported UI locale "${String(input.uiLocale || '')}"`,
    };
  }

  const override = String(input.voiceLocaleOverride || '').trim();
  let languageCode: string = getPrimaryTtsLanguageCode(locale);

  if (override) {
    const allowedOverrides = input.allowedVoiceLocaleOverrides || [];
    if (!allowedOverrides.includes(override)) {
      return {
        status: 'disallowed-override',
        reason: `Voice locale override "${override}" is not allowed for UI locale "${locale}"`,
      };
    }
    languageCode = override;
  }

  const availableVoiceLocales = input.availableVoiceLocales;
  if (availableVoiceLocales && !availableVoiceLocales.includes(languageCode)) {
    return {
      status: 'missing-voice',
      languageCode,
      reason: `No available TTS voice for language code "${languageCode}"`,
    };
  }

  return {
    status: 'ok',
    languageCode,
  };
}
