import { expect } from 'chai';
import {
  formatInterfaceDateTime,
  formatInterfaceNumber,
  formatInterfacePercent,
} from './interfaceFormatting';

describe('interface formatting', function() {
  it('formats numbers with the selected UI locale', function() {
    expect(formatInterfaceNumber('en', 1234.5)).to.equal('1,234.5');
    expect(formatInterfaceNumber('fr', 1234.5)).to.not.equal('1,234.5');
  });

  it('formats percentages through Intl', function() {
    expect(formatInterfacePercent('en', 0.72)).to.equal('72%');
  });

  it('formats dates with the selected UI locale', function() {
    const date = new Date('2026-07-06T12:00:00Z');
    expect(formatInterfaceDateTime('en', date, { year: 'numeric', month: 'short', timeZone: 'UTC' })).to.equal('Jul 2026');
  });

  it('fails clearly for unsupported locales and invalid dates', function() {
    expect(() => formatInterfaceNumber('de-DE', 1)).to.throw(/Unsupported UI locale/);
    expect(() => formatInterfaceDateTime('en', 'not-a-date')).to.throw(/Invalid date value/);
  });
});

