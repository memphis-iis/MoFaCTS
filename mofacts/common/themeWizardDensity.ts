export type WizardDensityResult = {
  scale: number;
  sizeScale: number;
  app_density_scale: string;
  app_font_size_base: string;
  app_button_height: string;
  app_text_input_height: string;
};

const MIN_DENSITY_PERCENT = 25;
const MAX_DENSITY_PERCENT = 200;

function roundCssPx(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)}px`;
}

export function validateWizardDensityPercent(percent: unknown): number {
  const numeric = typeof percent === 'number' ? percent : Number(percent);
  if (!Number.isFinite(numeric)) {
    throw new Error('Wizard density must be a number from 25% to 200%.');
  }
  if (numeric < MIN_DENSITY_PERCENT || numeric > MAX_DENSITY_PERCENT) {
    throw new Error('Wizard density must be between 25% and 200%.');
  }
  return numeric;
}

export function wizardDensityToThemeProperties(percent: unknown): WizardDensityResult {
  const validPercent = validateWizardDensityPercent(percent);
  const scale = validPercent / 100;
  const sizeScale = (scale + 1) / 2;
  return {
    scale,
    sizeScale,
    app_density_scale: String(scale),
    app_font_size_base: roundCssPx(16 * sizeScale),
    app_button_height: roundCssPx(32 * sizeScale),
    app_text_input_height: roundCssPx(32 * sizeScale),
  };
}

export function getDensityContrastBoost(percent: unknown): number {
  const validPercent = validateWizardDensityPercent(percent);
  if (validPercent >= 100) {
    return 0;
  }
  return (100 - validPercent) / 100;
}

export function scaleWizardCssPxLength(rawValue: unknown, sizeScale: number, propertyName: string): string {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  const match = /^(\d+(?:\.\d+)?)px$/i.exec(value);
  if (!match?.[1]) {
    throw new Error(`${propertyName} must be a pixel length before wizard density can scale it.`);
  }
  return roundCssPx(Number(match[1]) * sizeScale);
}
