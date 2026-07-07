export type ContentTextDirection = 'ltr' | 'rtl';

export interface ContentLanguageAttributes {
  lang?: string;
  dir?: ContentTextDirection;
}

const CONSERVATIVE_BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const RTL_LANGUAGE_SUBTAGS = new Set([
  'ar',
  'arc',
  'dv',
  'fa',
  'he',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

export function resolveContentLanguageAttributes(
  rawContentLanguage: string | null | undefined
): ContentLanguageAttributes {
  const lang = String(rawContentLanguage || '').trim();
  if (!lang) {
    return {};
  }
  if (!CONSERVATIVE_BCP47_PATTERN.test(lang)) {
    throw new Error(`Invalid contentLanguage "${lang}"`);
  }

  const primarySubtag = lang.split('-')[0]?.toLowerCase() || '';
  return {
    lang,
    dir: RTL_LANGUAGE_SUBTAGS.has(primarySubtag) ? 'rtl' : 'ltr',
  };
}
