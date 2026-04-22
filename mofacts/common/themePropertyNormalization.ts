const TRANSITION_PROPERTIES = new Set([
  'transition_instant',
  'transition_fast',
  'transition_smooth',
]);

const LENGTH_PROPERTIES = new Set([
  'font_size_base',
  'border_radius_sm',
  'border_radius_lg',
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

export function isValidThemeCssTime(value: string): boolean {
  return CSS_TIME_PATTERN.test(value.trim());
}

export function isValidThemeCssLength(value: string): boolean {
  return CSS_LENGTH_PATTERN.test(value.trim());
}

export function normalizeThemePropertyValue(property: string, rawValue: unknown): unknown {
  const normalizedString = normalizeNumberishString(rawValue);

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
