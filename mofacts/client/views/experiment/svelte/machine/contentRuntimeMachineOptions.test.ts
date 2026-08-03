import { expect } from 'chai';
import {
  getCssDuration,
  resolveForceCorrectTimeout,
} from './contentRuntimeMachineOptions';

describe('card machine options', function() {
  const cssVariable = '--test-card-machine-duration';

  afterEach(function() {
    document.documentElement.style.removeProperty(cssVariable);
  });

  function setCssDuration(value: string): void {
    document.documentElement.style.setProperty(cssVariable, value);
  }

  it('resolves numeric, millisecond, and second CSS durations', function() {
    setCssDuration('250');
    expect(getCssDuration(cssVariable)).to.equal(250);

    setCssDuration('175ms');
    expect(getCssDuration(cssVariable)).to.equal(175);

    setCssDuration('0.3s');
    expect(getCssDuration(cssVariable)).to.equal(300);
  });

  it('fails clearly when CSS duration is unavailable or invalid', function() {
    expect(() => getCssDuration(cssVariable)).to.throw(`Missing required theme duration: ${cssVariable}`);

    setCssDuration('');
    expect(() => getCssDuration(cssVariable)).to.throw(`Missing required theme duration: ${cssVariable}`);
  });

  it('resolves force-correct timeout from delivery settings with the existing default', function() {
    expect(resolveForceCorrectTimeout({
      deliverySettings: {
        forcecorrecttimeout: '3500',
      },
    })).to.equal(3500);

    expect(resolveForceCorrectTimeout({
      deliverySettings: {},
    })).to.equal(2000);
  });
});
