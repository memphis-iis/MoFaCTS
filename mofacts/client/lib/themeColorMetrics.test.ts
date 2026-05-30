import { expect } from 'chai';
import { contrastRatio, deltaE2000, parseThemeColor, parseThemeColorList } from './themeColorMetrics';

describe('theme color metrics', function() {
  it('parses supported wizard color inputs', function() {
    expect(parseThemeColor('#abc').hex).to.equal('#AABBCC');
    expect(parseThemeColor('#7ed957').hex).to.equal('#7ED957');
    expect(parseThemeColor('rgb(126, 217, 87)').hex).to.equal('#7ED957');
  });

  it('reports unsupported CSS values as skipped paste diagnostics', function() {
    const parsed = parseThemeColorList('#000\ncolor-mix(in srgb, red 50%, white)\nrgb(255, 255, 255)');
    expect(parsed.colors.map((color) => color.hex)).to.deep.equal(['#000000', '#FFFFFF']);
    expect(parsed.skipped).to.deep.equal(['color-mix(in srgb, red 50%, white)']);
  });

  it('calculates WCAG contrast and Delta E distinctness', function() {
    const black = parseThemeColor('#000').rgb;
    const white = parseThemeColor('#fff').rgb;
    expect(contrastRatio(black, white)).to.be.closeTo(21, 0.01);
    expect(deltaE2000(black, white)).to.be.greaterThan(90);
  });
});
