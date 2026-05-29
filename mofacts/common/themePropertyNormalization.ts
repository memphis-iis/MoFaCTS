const TRANSITION_PROPERTIES = new Set([
  'app_transition_instant',
  'app_transition_fast',
  'app_transition_smooth',
]);

const LENGTH_PROPERTIES = new Set([
  'app_font_size_base',
  'app_button_height',
  'app_text_input_height',
  'app_border_radius_sm',
  'app_border_radius_lg',
]);

const DENSITY_SCALE_PROPERTIES = new Set([
  'app_density_scale',
]);

const CSS_TIME_PATTERN = /^\d+(\.\d+)?(ms|s)$/i;
const CSS_LENGTH_PATTERN = /^\d+(\.\d+)?(px|rem|em|%)$/i;

function normalizeNumberishString(rawValue: unknown): string | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return String(rawValue);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

export function isThemeTransitionProperty(property: string): boolean {
  return TRANSITION_PROPERTIES.has(property);
}

export function isThemeLengthProperty(property: string): boolean {
  return LENGTH_PROPERTIES.has(property);
}

export function isThemeDensityScaleProperty(property: string): boolean {
  return DENSITY_SCALE_PROPERTIES.has(property);
}

export function isValidThemeCssTime(value: string): boolean {
  return CSS_TIME_PATTERN.test(value.trim());
}

export function isValidThemeCssLength(value: string): boolean {
  return CSS_LENGTH_PATTERN.test(value.trim());
}

export function isValidThemeDensityScale(value: unknown): boolean {
  const normalizedString = normalizeNumberishString(value);
  if (normalizedString == null) {
    return false;
  }
  const numericValue = Number(normalizedString);
  return Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 2;
}

export function normalizeThemePropertyValue(property: string, rawValue: unknown): unknown {
  const normalizedString = normalizeNumberishString(rawValue);

  if (isThemeDensityScaleProperty(property)) {
    if (!isValidThemeDensityScale(rawValue)) {
      return rawValue;
    }
    return String(Number(normalizedString));
  }

  if (isThemeTransitionProperty(property)) {
    if (normalizedString == null) {
      return rawValue;
    }

    if (/^\d+(\.\d+)?$/.test(normalizedString)) {
      return `${normalizedString}ms`;
    }

    return normalizedString;
  }

  if (isThemeLengthProperty(property)) {
    if (normalizedString == null) {
      return rawValue;
    }

    if (/^\d+(\.\d+)?$/.test(normalizedString)) {
      return `${normalizedString}px`;
    }

    return normalizedString;
  }

  return rawValue;
}

export function themeEditorDisplayValue(property: string, rawValue: unknown): unknown {
  const normalizedValue = normalizeThemePropertyValue(property, rawValue);

  if (!isThemeTransitionProperty(property) || typeof normalizedValue !== 'string') {
    return normalizedValue;
  }

  const trimmed = normalizedValue.trim();
  if (trimmed.endsWith('ms')) {
    return trimmed.slice(0, -2);
  }

  if (trimmed.endsWith('s')) {
    const seconds = Number(trimmed.slice(0, -1));
    if (Number.isFinite(seconds)) {
      return String(seconds * 1000);
    }
  }

  return normalizedValue;
}
