import { expect } from 'chai';
import {
  formatInterfaceDateTime,
  formatInterfaceNumber,
  formatInterfacePercent,
} from './interfaceFormatting';
import { TARGET_UI_LOCALES } from './interfaceLocales';

describe('interface formatting', function() {
  const sampleDate = new Date('2026-07-06T12:00:00Z');

  it('formats numbers with the selected UI locale', function() {
    expect(formatInterfaceNumber('en', 1234.5)).to.equal('1,234.5');
    expect(formatInterfaceNumber('fr', 1234.5)).to.not.equal('1,234.5');
  });

  it('formats numbers, percents, and dates for every target UI locale', function() {
    for (const locale of TARGET_UI_LOCALES) {
      const numberOutput = formatInterfaceNumber(locale, 1234.5);
      const percentOutput = formatInterfacePercent(locale, 0.72);
      const dateOutput = formatInterfaceDateTime(locale, sampleDate, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });

      expect(numberOutput, `${locale} number`).to.equal(new Intl.NumberFormat(locale).format(1234.5));
      expect(percentOutput, `${locale} percent`).to.equal(new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(0.72));
      expect(dateOutput, `${locale} date`).to.equal(new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(sampleDate));
      if (locale !== 'en') {
        expect(new Intl.NumberFormat(locale).resolvedOptions().locale, `${locale} Intl number locale`).to.not.equal('en');
      }
    }
  });

  it('formats percentages through Intl', function() {
    expect(formatInterfacePercent('en', 0.72)).to.equal('72%');
  });

  it('formats dates with the selected UI locale', function() {
    expect(formatInterfaceDateTime('en', sampleDate, { year: 'numeric', month: 'short', timeZone: 'UTC' })).to.equal('Jul 2026');
  });

  it('fails clearly for unsupported locales and invalid dates', function() {
    expect(() => formatInterfaceNumber('de-DE', 1)).to.throw(/Unsupported UI locale/);
    expect(() => formatInterfaceDateTime('en', 'not-a-date')).to.throw(/Invalid date value/);
  });
});
