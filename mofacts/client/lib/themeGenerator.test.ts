import { expect } from 'chai';
import defaultTheme from '../../public/themes/mofacts-default.json';
import { buildThemeContrastSchema, THEME_GENERATOR_DERIVED_PROPERTIES, THEME_GENERATOR_ROLE_PROPERTIES } from '../../common/themeRoleSchema';
import { parseThemeColor, parseThemeColorList, rgbToHsl } from './themeColorMetrics';
import { generateTheme } from './themeGenerator';

describe('theme generator', function() {
  function hue(value: unknown): number {
    return rgbToHsl(parseThemeColor(value).rgb).h;
  }

  it('generates a complete active-theme payload from the default palette', function() {
    const palette = parseThemeColorList('#7ed957\n#f2f2f2\n#000000\n#ff0000').colors;
    const generated = generateTheme({
      name: 'Generated Test Theme',
      baseThemeId: 'mofacts-default',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'light',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: true,
        allowShades: true,
        allowMutedVariants: true,
        allowGeneratedCompanions: true,
        maxGeneratedPerColor: 3,
      },
      skippedCssValues: [],
    });

    expect(generated.properties.themeName).to.equal('Generated Test Theme');
    expect(generated.properties.app_density_scale).to.equal('1');
    [...THEME_GENERATOR_ROLE_PROPERTIES, ...THEME_GENERATOR_DERIVED_PROPERTIES].forEach((property) => {
      expect(generated.properties).to.have.property(property);
    });
    expect(generated.diagnostics.errors).to.deep.equal([]);
    expect(generated.diagnostics.aaCount).to.be.greaterThan(7);
  });

  it('applies full density scale to generated radius tokens', function() {
    const palette = parseThemeColorList('#7ed957\n#f2f2f2\n#000000\n#ff0000').colors;
    const generated = generateTheme({
      name: 'Compact Radius Theme',
      baseThemeId: 'mofacts-default',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'light',
      densityPercent: 25,
      contrastPriority: 0.5,
      expansion: {
        allowTints: true,
        allowShades: true,
        allowMutedVariants: true,
        allowGeneratedCompanions: true,
        maxGeneratedPerColor: 3,
      },
      skippedCssValues: [],
    });

    expect(generated.properties.app_font_size_base).to.equal('10px');
    expect(generated.properties.app_border_radius_sm).to.equal('2px');
    expect(generated.properties.app_border_radius_lg).to.equal('3px');
  });

  it('blocks generation when paste diagnostics contain unsupported CSS values', function() {
    const palette = parseThemeColorList('#000000\n#ffffff').colors;
    expect(() => generateTheme({
      name: 'Blocked Theme',
      baseThemeId: 'mofacts-default',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'light',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: false,
        allowShades: false,
        allowMutedVariants: false,
        allowGeneratedCompanions: false,
        maxGeneratedPerColor: 0,
      },
      skippedCssValues: ['var(--app-accent-color)'],
    })).to.throw('Unsupported CSS color values were skipped');
  });

  it('keeps generated semantic colors tied to the source palette and derived variants', function() {
    const palette = parseThemeColorList('#F9EE76\n#E4B7F0\n#000000').colors;
    const generated = generateTheme({
      name: 'Palette Fidelity Theme',
      baseThemeId: 'dark-industrial',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'dark',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: true,
        allowShades: true,
        allowMutedVariants: true,
        allowGeneratedCompanions: true,
        maxGeneratedPerColor: 3,
      },
      skippedCssValues: [],
    });

    expect(hue(generated.properties.app_accent_color)).to.be.closeTo(hue('#F9EE76'), 1);
    expect(hue(generated.properties.feedback_correct_color)).to.be.closeTo(hue('#E4B7F0'), 1);
    expect(Object.values(generated.properties)).not.to.include('#047857');
    expect(Object.values(generated.properties)).not.to.include('#B91C1C');
  });

  it('includes feedback text visibility in the canonical contrast schema', function() {
    const relationships = buildThemeContrastSchema().map((pair) => `${pair.foreground} vs ${pair.background}`);
    expect(relationships).to.include('feedback_correct_color vs learning_card_surface_color');
    expect(relationships).to.include('feedback_error_color vs learning_card_surface_color');
  });

  it('keeps public and authenticated surfaces on one application theme contract', function() {
    expect(THEME_GENERATOR_ROLE_PROPERTIES.filter((property) => property.startsWith('public_'))).to.deep.equal([]);

    const palette = parseThemeColorList('#171A1D\n#F5F2EB\n#C48A3A\n#A84D45').colors;
    const generated = generateTheme({
      name: 'Single Contract Theme',
      baseThemeId: 'dark-industrial',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'dark',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: true,
        allowShades: true,
        allowMutedVariants: true,
        allowGeneratedCompanions: true,
        maxGeneratedPerColor: 3,
      },
      skippedCssValues: [],
    });

    expect(Object.keys(generated.properties).filter((property) => property.startsWith('public_'))).to.deep.equal([]);
  });

  it('constructs secondary surfaces against the chosen primary action color', function() {
    const palette = parseThemeColorList('#BA5ACE\n#F9E5FF\n#2C241B\n#ECE165').colors;
    const generated = generateTheme({
      name: 'Reasonable Palette Theme',
      baseThemeId: 'whimsical-refined',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'light',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: true,
        allowShades: true,
        allowMutedVariants: true,
        allowGeneratedCompanions: true,
        maxGeneratedPerColor: 3,
      },
      skippedCssValues: [],
    });

    expect(generated.diagnostics.errors).to.deep.equal([]);
    expect(hue(generated.properties.app_primary_action_surface_color)).to.be.closeTo(hue('#BA5ACE'), 1);
    expect(generated.properties.app_secondary_surface_color)
      .not.to.equal(generated.properties.app_primary_action_surface_color);
  });

  it('keeps feedback roles derived from the fourth palette source', function() {
    const palette = parseThemeColorList('#BF90DF\n#D1BCDC\n#2C241B\n#D6D600').colors;
    const generated = generateTheme({
      name: 'Feedback Source Theme',
      baseThemeId: 'whimsical-refined',
      baseProperties: defaultTheme.properties,
      palette,
      polarity: 'light',
      densityPercent: 100,
      contrastPriority: 0.5,
      expansion: {
        allowTints: false,
        allowShades: false,
        allowMutedVariants: false,
        allowGeneratedCompanions: false,
        maxGeneratedPerColor: 0,
      },
      skippedCssValues: [],
    });

    expect(hue(generated.properties.feedback_correct_color)).to.be.closeTo(hue('#D6D600'), 1);
    expect(hue(generated.properties.feedback_error_color)).to.be.closeTo(hue('#D6D600'), 1);
    expect(generated.properties.feedback_correct_color)
      .not.to.equal(generated.properties.feedback_error_color);
  });
});
