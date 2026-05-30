import {
  mixRgb,
  parseThemeColor,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type ParsedThemeColor,
  type RgbColor,
} from './themeColorMetrics';

export type PaletteExpansionOptions = {
  allowTints: boolean;
  allowShades: boolean;
  allowMutedVariants: boolean;
  allowGeneratedCompanions: boolean;
  maxGeneratedPerColor: number;
};

export type ClassifiedThemeColor = ParsedThemeColor & {
  luminance: number;
  saturation: number;
  lightness: number;
  generated: boolean;
  sourceHex: string;
  sourceKind: 'source' | 'tint' | 'shade' | 'muted';
};

export type PaletteStats = {
  colorCount: number;
  darkestColor: string;
  lightestColor: string;
  medianLuminance: number;
  chromaticColorCount: number;
  neutralColorCount: number;
};

function addUniqueColor(colors: ParsedThemeColor[], color: RgbColor, source: string) {
  const hex = rgbToHex(color);
  if (colors.some((existing) => existing.hex === hex)) {
    return;
  }
  colors.push({ input: source, hex, rgb: color });
}

export function expandPalette(
  inputPalette: ParsedThemeColor[],
  options: PaletteExpansionOptions,
): ParsedThemeColor[] {
  if (inputPalette.length < 2) {
    throw new Error('At least two valid palette colors are required.');
  }

  const expanded = [...inputPalette];
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  inputPalette.forEach((color) => {
    let generated = 0;
    if (options.allowTints && generated < options.maxGeneratedPerColor) {
      addUniqueColor(expanded, mixRgb(color.rgb, white, 0.18), `${color.hex} tint`);
      generated += 1;
    }
    if (options.allowShades && generated < options.maxGeneratedPerColor) {
      addUniqueColor(expanded, mixRgb(color.rgb, black, 0.20), `${color.hex} shade`);
      generated += 1;
    }
    if (options.allowMutedVariants && generated < options.maxGeneratedPerColor) {
      const gray = { r: 128, g: 128, b: 128 };
      addUniqueColor(expanded, mixRgb(color.rgb, gray, 0.35), `${color.hex} muted`);
    }
  });

  if (options.allowGeneratedCompanions) {
    inputPalette.forEach((color) => {
      addUniqueColor(expanded, mixRgb(color.rgb, white, 0.92), `${color.hex} light companion`);
      addUniqueColor(expanded, mixRgb(color.rgb, black, 0.92), `${color.hex} dark companion`);
    });
  }

  return expanded;
}

export function classifyColors(colors: ParsedThemeColor[]): ClassifiedThemeColor[] {
  return colors.map((color) => {
    const hsl = rgbToHsl(color.rgb);
    const sourceKind = color.input.includes(' tint') || color.input.includes(' light companion')
      ? 'tint'
      : color.input.includes(' shade') || color.input.includes(' dark companion')
        ? 'shade'
        : color.input.includes(' muted')
          ? 'muted'
          : 'source';
    return {
      ...color,
      luminance: relativeLuminance(color.rgb),
      saturation: hsl.s,
      lightness: hsl.l,
      generated: sourceKind !== 'source',
      sourceHex: color.input.match(/^#[0-9A-F]{6}/i)?.[0].toUpperCase() || color.hex,
      sourceKind,
    };
  });
}

export function getPaletteStats(colors: ParsedThemeColor[]): PaletteStats {
  const classified = classifyColors(colors).sort((a, b) => a.luminance - b.luminance);
  const darkest = classified[0];
  const lightest = classified[classified.length - 1];
  if (!darkest || !lightest) {
    throw new Error('Palette statistics require at least one valid color.');
  }
  const median = classified[Math.floor(classified.length / 2)];
  if (!median) {
    throw new Error('Palette statistics require a median color.');
  }
  return {
    colorCount: colors.length,
    darkestColor: darkest.hex,
    lightestColor: lightest.hex,
    medianLuminance: median.luminance,
    chromaticColorCount: classified.filter((color) => color.saturation >= 0.12).length,
    neutralColorCount: classified.filter((color) => color.saturation < 0.12).length,
  };
}

export function parsePaletteSlotValues(values: unknown[]): ParsedThemeColor[] {
  const colors = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .map((value) => parseThemeColor(value));
  const unique = new Map<string, ParsedThemeColor>();
  colors.forEach((color) => unique.set(color.hex, color));
  return Array.from(unique.values());
}
