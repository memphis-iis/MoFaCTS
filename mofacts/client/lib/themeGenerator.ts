import {
  buildThemeContrastSchema,
  THEME_GENERATOR_DERIVED_PROPERTIES,
  THEME_GENERATOR_DISTINCTNESS_PAIRS,
  THEME_GENERATOR_ROLE_PROPERTIES,
  type ThemePolarity,
} from '../../common/themeRoleSchema';
import { getDensityContrastBoost, scaleWizardCssPxLength, wizardDensityToThemeProperties } from '../../common/themeWizardDensity';
import {
  contrastRatio,
  deltaE2000,
  mixRgb,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  type ParsedThemeColor,
  type RgbColor,
} from './themeColorMetrics';
import {
  classifyColors,
  expandPalette,
  getPaletteStats,
  type PaletteExpansionOptions,
  type PaletteStats,
} from './themePaletteExpansion';

export type ThemeGenerationOptions = {
  name: string;
  baseThemeId: string;
  baseProperties: Record<string, unknown>;
  palette: ParsedThemeColor[];
  polarity: ThemePolarity;
  densityPercent: number;
  contrastPriority: number;
  expansion: PaletteExpansionOptions;
  skippedCssValues: string[];
};

export type ThemeGenerationIssue = {
  message: string;
  role?: string;
};

export type GeneratedTheme = {
  id: string;
  properties: Record<string, unknown>;
  scores: {
    readability: number;
    surfaceSeparation: number;
    feedbackDistinctiveness: number;
    paletteFidelity: number;
  };
  diagnostics: {
    errors: ThemeGenerationIssue[];
    warnings: ThemeGenerationIssue[];
    paletteStats: PaletteStats;
    aaCount: number;
    aaaCount: number;
  };
  explanation: string[];
};

export type GeneratedThemeDiagnosticDetails = {
  contrastRows: Array<{ relationship: string; ratio: string; minimum: number; preferred: number; pass: boolean }>;
  distinctnessRows: Array<{ relationship: string; deltaE: string; minimumDeltaE: number; pass: boolean }>;
  colorRows: Array<{ role: string; value: string }>;
  luminanceRows: Array<{ role: string; luminance: string }>;
};

type PaletteColor = {
  hex: string;
  rgb: RgbColor;
  luminance: number;
  saturation: number;
  lightness: number;
  generated: boolean;
  sourceHex: string;
  sourceKind: 'source' | 'tint' | 'shade' | 'muted';
  sourceOrder: number;
};

const LIGHT_TARGET_LUMINANCE: Record<string, number> = {
  app_background_color: 0.8931,
  app_text_color: 0.0094,
  app_page_header_text_color: 0.0094,
  app_primary_action_surface_color: 0.5313,
  app_primary_action_text_color: 0.0048,
  app_accent_color: 0.3411,
  app_secondary_surface_color: 0.7203,
  app_secondary_text_color: 0.0094,
  learning_card_audio_icon_disabled_color: 0.1935,
  learning_card_audio_control_color: 0.3411,
  feedback_correct_color: 0.2911,
  feedback_error_color: 0.1781,
  navigation_text_color: 0.0094,
  navigation_surface_color: 0.9780,
  learning_card_surface_color: 0.9827,
  learning_card_stimulus_surface_color: 0.9364,
  learning_card_primary_action_surface_color: 0.4674,
  learning_card_primary_action_text_color: 0.0048,
  practice_menu_accuracy_bar_fill_color: 0.3411,
  practice_menu_accuracy_bar_track_color: 0.7203,
};

const DARK_TARGET_LUMINANCE: Record<string, number> = {
  app_background_color: 0.0134,
  app_text_color: 0.7710,
  app_page_header_text_color: 0.7710,
  app_primary_action_surface_color: 0.1206,
  app_primary_action_text_color: 0.8891,
  app_accent_color: 0.3022,
  app_secondary_surface_color: 0.0298,
  app_secondary_text_color: 0.6909,
  learning_card_audio_icon_disabled_color: 0.1717,
  learning_card_audio_control_color: 0.3022,
  feedback_correct_color: 0.2967,
  feedback_error_color: 0.2485,
  navigation_text_color: 0.8412,
  navigation_surface_color: 0.0197,
  learning_card_surface_color: 0.0235,
  learning_card_stimulus_surface_color: 0.0180,
  learning_card_primary_action_surface_color: 0.1450,
  learning_card_primary_action_text_color: 0.8891,
  practice_menu_accuracy_bar_fill_color: 0.3022,
  practice_menu_accuracy_bar_track_color: 0.0298,
};
function sortedByLuminance(colors: PaletteColor[]) {
  return [...colors].sort((a, b) => a.luminance - b.luminance);
}

function tuneRgbToLuminance(source: RgbColor, targetLuminance: number): RgbColor {
  const sourceLuminance = relativeLuminance(source);
  if (Math.abs(sourceLuminance - targetLuminance) < 0.001) {
    return source;
  }

  const endpoint = sourceLuminance < targetLuminance
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 };
  let low = 0;
  let high = 1;
  let best = source;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const weight = (low + high) / 2;
    const mixed = mixRgb(source, endpoint, weight);
    const mixedLuminance = relativeLuminance(mixed);
    best = mixed;
    if (sourceLuminance < targetLuminance) {
      if (mixedLuminance < targetLuminance) {
        low = weight;
      } else {
        high = weight;
      }
    } else if (mixedLuminance > targetLuminance) {
      low = weight;
    } else {
      high = weight;
    }
  }

  return best;
}

function tuneColorToRole(source: PaletteColor, role: string, polarity: ThemePolarity): PaletteColor {
  const target = polarity === 'light' ? LIGHT_TARGET_LUMINANCE[role] : DARK_TARGET_LUMINANCE[role];
  if (target == null) {
    throw new Error(`Missing luminance target for ${role}.`);
  }
  const rgb = tuneRgbToLuminance(source.rgb, target);
  return asPaletteColor(
    rgb,
    source,
    target > source.luminance ? 'tint' : 'shade',
  );
}

function sourceAt(colors: PaletteColor[], index: number, fallback: PaletteColor): PaletteColor {
  return colors.find((color) => color.sourceKind === 'source' && color.sourceOrder === index) || fallback;
}

function luminanceMappedRoleColors(colors: PaletteColor[], polarity: ThemePolarity): Record<string, PaletteColor> {
  const sorted = sortedByLuminance(colors);
  const darkest = sorted[0];
  const lightest = sorted[sorted.length - 1];
  if (!darkest || !lightest) {
    throw new Error('Theme generation requires at least one palette color.');
  }
  const sourceColors = colors.filter((color) => color.sourceKind === 'source').sort((a, b) => a.sourceOrder - b.sourceOrder);
  const first = sourceColors[0] || lightest;
  const fourth = sourceColors[3] || first;
  const surfaceSource = sourceAt(colors, 1, polarity === 'light' ? lightest : darkest);
  const textSource = sourceAt(colors, 2, polarity === 'light' ? darkest : lightest);
  const accentSource = first;
  const feedbackSource = fourth;

  const roleSource: Record<string, PaletteColor> = {
    app_background_color: surfaceSource,
    app_text_color: textSource,
    app_page_header_text_color: textSource,
    app_primary_action_surface_color: accentSource,
    app_primary_action_text_color: textSource,
    app_accent_color: accentSource,
    app_secondary_surface_color: surfaceSource,
    app_secondary_text_color: textSource,
    learning_card_audio_icon_disabled_color: textSource,
    learning_card_audio_control_color: accentSource,
    feedback_correct_color: feedbackSource,
    feedback_error_color: feedbackSource,
    navigation_text_color: textSource,
    navigation_surface_color: surfaceSource,
    learning_card_surface_color: surfaceSource,
    learning_card_stimulus_surface_color: surfaceSource,
    learning_card_primary_action_surface_color: accentSource,
    learning_card_primary_action_text_color: textSource,
    practice_menu_accuracy_bar_fill_color: accentSource,
    practice_menu_accuracy_bar_track_color: surfaceSource,
  };

  return Object.fromEntries(
    Object.entries(roleSource).map(([role, source]) => [role, tuneColorToRole(source, role, polarity)]),
  );
}

function asPaletteColor(
  rgb: RgbColor,
  source: PaletteColor,
  sourceKind: 'tint' | 'shade' | 'muted',
): PaletteColor {
  const hsl = rgbToHsl(rgb);
  return {
    hex: rgbToHex(rgb),
    rgb,
    luminance: relativeLuminance(rgb),
    saturation: hsl.s,
    lightness: hsl.l,
    generated: true,
    sourceHex: source.sourceHex,
    sourceKind,
    sourceOrder: source.sourceOrder,
  };
}

function ensureIndicatorAgainstBackground(
  candidate: RgbColor,
  background: RgbColor,
  polarity: ThemePolarity,
  minimum: number,
): RgbColor {
  const target = polarity === 'light' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let current = candidate;
  for (let step = 0; step <= 10; step += 1) {
    if (contrastRatio(current, background) >= minimum) {
      return current;
    }
    current = mixRgb(candidate, target, step / 10);
  }
  throw new Error(`Unable to create an accuracy indicator with contrast ${minimum}:1.`);
}

function scoreRatio(actual: number, preferred: number): number {
  return Math.max(0, Math.min(1, actual / preferred));
}

function makeGeneratedId(name: string) {
  return `generated-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme'}`;
}

function requireColorProperty(properties: Record<string, unknown>, property: string): RgbColor {
  const value = properties[property];
  const parsed = typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value)
    ? value
    : null;
  if (!parsed) {
    throw new Error(`Generated property ${property} is not a supported hex color.`);
  }
  const numeric = parseInt(parsed.slice(1), 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function validateContrastPriority(priority: unknown): number {
  const numeric = typeof priority === 'number' ? priority : Number(priority);
  if (!Number.isFinite(numeric)) {
    throw new Error('Contrast priority must be a number from 0 to 1.');
  }
  if (numeric < 0 || numeric > 1) {
    throw new Error('Contrast priority must be between 0 and 1.');
  }
  return numeric;
}

export function validateGeneratedTheme(
  properties: Record<string, unknown>,
  densityPercent: number,
  contrastPriority: number,
): { errors: ThemeGenerationIssue[]; aaCount: number; aaaCount: number; readabilityScore: number; separationScore: number } {
  const contrastWeight = validateContrastPriority(contrastPriority);
  const schema = buildThemeContrastSchema(getDensityContrastBoost(densityPercent), contrastWeight);
  const errors: ThemeGenerationIssue[] = [];
  let aaCount = 0;
  let aaaCount = 0;
  let readabilityScore = 0;

  schema.forEach((pair) => {
    const foreground = requireColorProperty(properties, pair.foreground);
    const background = requireColorProperty(properties, pair.background);
    const ratio = contrastRatio(foreground, background);
    readabilityScore += scoreRatio(ratio, pair.preferred);
    if (ratio >= 4.5) {
      aaCount += 1;
    }
    if (ratio >= 7) {
      aaaCount += 1;
    }
    if (ratio < pair.minimum) {
      errors.push({
        role: `${pair.foreground} vs ${pair.background}`,
        message: `${pair.foreground} against ${pair.background} has ${ratio.toFixed(2)}:1 contrast; required minimum is ${pair.minimum}:1.`,
      });
    }
  });

  let separationScore = 0;
  THEME_GENERATOR_DISTINCTNESS_PAIRS.forEach((pair) => {
    const first = requireColorProperty(properties, pair.first);
    const second = requireColorProperty(properties, pair.second);
    const delta = deltaE2000(first, second);
    separationScore += scoreRatio(delta, pair.minimumDeltaE * 1.5);
    if (delta < pair.minimumDeltaE) {
      errors.push({
        role: `${pair.first} vs ${pair.second}`,
        message: `${pair.first} and ${pair.second} are too similar (Delta E ${delta.toFixed(1)}; minimum ${pair.minimumDeltaE}).`,
      });
    }
  });

  return {
    errors,
    aaCount,
    aaaCount,
    readabilityScore: readabilityScore / schema.length,
    separationScore: separationScore / THEME_GENERATOR_DISTINCTNESS_PAIRS.length,
  };
}

export function getGeneratedThemeDiagnosticDetails(
  properties: Record<string, unknown>,
  densityPercent: number,
  contrastPriority: number,
): GeneratedThemeDiagnosticDetails {
  const contrastWeight = validateContrastPriority(contrastPriority);
  const schema = buildThemeContrastSchema(getDensityContrastBoost(densityPercent), contrastWeight);
  const contrastRows = schema.map((pair) => {
    const foreground = requireColorProperty(properties, pair.foreground);
    const background = requireColorProperty(properties, pair.background);
    const ratio = contrastRatio(foreground, background);
    return {
      relationship: `${pair.foreground} vs ${pair.background}`,
      ratio: ratio.toFixed(2),
      minimum: pair.minimum,
      preferred: pair.preferred,
      pass: ratio >= pair.minimum,
    };
  });

  const distinctnessRows = THEME_GENERATOR_DISTINCTNESS_PAIRS.map((pair) => {
    const first = requireColorProperty(properties, pair.first);
    const second = requireColorProperty(properties, pair.second);
    const deltaE = deltaE2000(first, second);
    return {
      relationship: `${pair.first} vs ${pair.second}`,
      deltaE: deltaE.toFixed(1),
      minimumDeltaE: pair.minimumDeltaE,
      pass: deltaE >= pair.minimumDeltaE,
    };
  });

  const colorRows = THEME_GENERATOR_ROLE_PROPERTIES.map((role) => ({
    role,
    value: String(properties[role]),
  }));

  return {
    contrastRows,
    distinctnessRows,
    colorRows,
    luminanceRows: THEME_GENERATOR_ROLE_PROPERTIES.map((role) => ({
      role,
      luminance: relativeLuminance(requireColorProperty(properties, role)).toFixed(3),
    })),
  };
}

export function generateTheme(options: ThemeGenerationOptions): GeneratedTheme {
  if (!options.name.trim()) {
    throw new Error('Generated theme name is required.');
  }
  if (!options.baseThemeId.trim()) {
    throw new Error('A base theme is required for explicit inheritance.');
  }
  if (options.skippedCssValues.length) {
    throw new Error(`Unsupported CSS color values were skipped: ${options.skippedCssValues.join(', ')}`);
  }

  const expandedPalette = expandPalette(options.palette, options.expansion);
  const contrastPriority = validateContrastPriority(options.contrastPriority);
  const classified = classifyColors(expandedPalette);
  const colors = classified.map((color): PaletteColor => {
    const sourceOrder = classified.findIndex((candidate) => candidate.hex === color.sourceHex);
    return {
      hex: color.hex,
      rgb: color.rgb,
      luminance: color.luminance,
      saturation: color.saturation,
      lightness: color.lightness,
      generated: color.generated,
      sourceHex: color.sourceHex,
      sourceKind: color.sourceKind,
      sourceOrder: sourceOrder >= 0 ? sourceOrder : 0,
    };
  });
  const roleColors = luminanceMappedRoleColors(colors, options.polarity);
  const background = roleColors.app_background_color;
  const text = roleColors.app_text_color;
  const cardText = roleColors.app_text_color;
  const card = roleColors.learning_card_surface_color;
  const accent = roleColors.app_accent_color;
  const density = wizardDensityToThemeProperties(options.densityPercent);
  if (!background || !text || !cardText || !card || !accent) {
    throw new Error('Theme generation failed to map required palette roles.');
  }
  const trackBase = mixRgb(background.rgb, text.rgb, options.polarity === 'light' ? 0.14 : 0.16);
  const fill = ensureIndicatorAgainstBackground(accent.rgb, background.rgb, options.polarity, 3);
  const track = ensureIndicatorAgainstBackground(trackBase, background.rgb, options.polarity, 1.3);

  const initialProperties: Record<string, unknown> = {
    ...options.baseProperties,
    themeName: options.name.trim(),
    app_background_color: roleColors.app_background_color?.hex,
    app_text_color: roleColors.app_text_color?.hex,
    app_page_header_text_color: roleColors.app_page_header_text_color?.hex,
    app_primary_action_surface_color: roleColors.app_primary_action_surface_color?.hex,
    app_primary_action_text_color: roleColors.app_primary_action_text_color?.hex,
    app_accent_color: roleColors.app_accent_color?.hex,
    app_secondary_surface_color: roleColors.app_secondary_surface_color?.hex,
    app_secondary_text_color: roleColors.app_secondary_text_color?.hex,
    learning_card_audio_icon_disabled_color: rgbToHex(mixRgb(cardText.rgb, card.rgb, 0.45)),
    learning_card_audio_control_color: roleColors.learning_card_audio_control_color?.hex,
    feedback_correct_color: roleColors.feedback_correct_color?.hex,
    feedback_error_color: roleColors.feedback_error_color?.hex,
    navigation_text_color: roleColors.navigation_text_color?.hex,
    navigation_surface_color: roleColors.navigation_surface_color?.hex,
    learning_card_surface_color: roleColors.learning_card_surface_color?.hex,
    learning_card_stimulus_surface_color: roleColors.learning_card_stimulus_surface_color?.hex,
    learning_card_primary_action_surface_color: roleColors.learning_card_primary_action_surface_color?.hex,
    learning_card_primary_action_text_color: roleColors.learning_card_primary_action_text_color?.hex,
    practice_menu_accuracy_bar_fill_color: rgbToHex(fill),
    practice_menu_accuracy_bar_track_color: rgbToHex(track),
    media_video_overlay_surface_color: 'color-mix(in srgb, var(--learning-card-surface-color) 98%, transparent)',
    media_video_overlay_backdrop_color: 'color-mix(in srgb, var(--app-text-color) 60%, transparent)',
    app_surface_shadow: '0 4px 12px color-mix(in srgb, var(--app-text-color) 18%, transparent)',
    learning_card_performance_divider_color: 'color-mix(in srgb, var(--app-text-color) 15%, transparent)',
    app_loading_overlay_color: 'color-mix(in srgb, var(--app-background-color) 95%, transparent)',
    app_button_border_darkness: 20,
    app_button_hover_darkness: 15,
    app_density_scale: density.app_density_scale,
    app_font_size_base: density.app_font_size_base,
    app_button_height: density.app_button_height,
    app_text_input_height: density.app_text_input_height,
    app_border_radius_sm: scaleWizardCssPxLength(options.baseProperties.app_border_radius_sm, density.scale, 'app_border_radius_sm'),
    app_border_radius_lg: scaleWizardCssPxLength(options.baseProperties.app_border_radius_lg, density.scale, 'app_border_radius_lg'),
  };

  const properties = initialProperties;

  const missingRoles = [...THEME_GENERATOR_ROLE_PROPERTIES, ...THEME_GENERATOR_DERIVED_PROPERTIES]
    .filter((property) => !(property in properties));
  if (missingRoles.length) {
    throw new Error(`Generated theme is missing required properties: ${missingRoles.join(', ')}`);
  }

  const validation = validateGeneratedTheme(properties, options.densityPercent, contrastPriority);
  const feedbackCorrect = requireColorProperty(properties, 'feedback_correct_color');
  const feedbackError = requireColorProperty(properties, 'feedback_error_color');

  return {
    id: makeGeneratedId(options.name),
    properties,
    scores: {
      readability: validation.readabilityScore,
      surfaceSeparation: validation.separationScore,
      feedbackDistinctiveness: Math.min(1, deltaE2000(feedbackCorrect, feedbackError) / 30),
      paletteFidelity: options.palette.length / expandedPalette.length,
    },
    diagnostics: {
      errors: [],
      warnings: [],
      paletteStats: getPaletteStats(options.palette),
      aaCount: validation.aaCount,
      aaaCount: validation.aaaCount,
    },
    explanation: [
      `${options.polarity === 'light' ? 'Light' : 'Dark'} polarity selected ${background.hex} as the app background.`,
      `Density ${options.densityPercent}% writes spacing and radius scale ${density.app_density_scale}; font and control sizes use softened scale ${density.sizeScale}.`,
      `Contrast priority ${Math.round(contrastPriority * 100)}% produced ${validation.aaCount} AA role pairs and ${validation.aaaCount} AAA role pairs.`,
      `Accent, feedback, surface, and text colors were selected from the source palette or palette-derived tints, shades, and muted variants.`,
      'Video overlays, shadows, loading overlay, and button darkness tokens were emitted intentionally from semantic theme roles.',
    ],
  };
}
