type ThemeBrandingLike = {
  properties?: Record<string, unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveThemeBrandLabel(
  theme: ThemeBrandingLike | null | undefined,
  configuredSystemName: unknown
): string {
  const themeBrandLabel = asNonEmptyString(theme?.properties?.brand_label);
  if (themeBrandLabel) {
    return themeBrandLabel;
  }

  const configuredName = asNonEmptyString(configuredSystemName);
  if (configuredName) {
    return configuredName;
  }

  return 'MoFaCTS';
}
