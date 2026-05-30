import { expect } from 'chai';
import { getDensityContrastBoost, scaleWizardCssPxLength, wizardDensityToThemeProperties } from './themeWizardDensity';

describe('theme wizard density mapping', function() {
  it('maps wizard percentages to stored theme density fields', function() {
    expect(wizardDensityToThemeProperties(25)).to.deep.equal({
      scale: 0.25,
      sizeScale: 0.625,
      app_density_scale: '0.25',
      app_font_size_base: '10px',
      app_button_height: '20px',
      app_text_input_height: '20px',
    });

    expect(wizardDensityToThemeProperties(100)).to.deep.equal({
      scale: 1,
      sizeScale: 1,
      app_density_scale: '1',
      app_font_size_base: '16px',
      app_button_height: '32px',
      app_text_input_height: '32px',
    });

    expect(wizardDensityToThemeProperties(200)).to.deep.equal({
      scale: 2,
      sizeScale: 1.5,
      app_density_scale: '2',
      app_font_size_base: '24px',
      app_button_height: '48px',
      app_text_input_height: '48px',
    });
  });

  it('raises contrast boost only for compact density', function() {
    expect(getDensityContrastBoost(25)).to.equal(0.75);
    expect(getDensityContrastBoost(50)).to.equal(0.5);
    expect(getDensityContrastBoost(100)).to.equal(0);
    expect(getDensityContrastBoost(150)).to.equal(0);
  });

  it('rejects density outside the visible editor range', function() {
    expect(() => wizardDensityToThemeProperties(24)).to.throw('between 25% and 200%');
    expect(() => wizardDensityToThemeProperties(201)).to.throw('between 25% and 200%');
  });

  it('scales pixel radii with the full density scale', function() {
    expect(scaleWizardCssPxLength('8px', 0.25, 'app_border_radius_sm')).to.equal('2px');
    expect(scaleWizardCssPxLength('12px', 2, 'app_border_radius_lg')).to.equal('24px');
  });

  it('rejects non-pixel radii instead of silently falling back', function() {
    expect(() => scaleWizardCssPxLength('0.5rem', 1, 'app_border_radius_sm')).to.throw('must be a pixel length');
  });
});
