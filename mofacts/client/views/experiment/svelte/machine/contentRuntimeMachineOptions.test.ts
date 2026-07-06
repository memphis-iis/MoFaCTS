import { expect } from 'chai';
import {
  getCssDuration,
  resolveForceCorrectTimeout,
} from './contentRuntimeMachineOptions';

describe('card machine options', function() {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;

  afterEach(function() {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: originalGetComputedStyle,
    });
  });

  function setCssDuration(value: string): void {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        documentElement: {},
      },
    });
    Object.defineProperty(globalThis, 'getComputedStyle', {
      configurable: true,
      value: () => ({
        getPropertyValue: () => value,
      }),
    });
  }

  it('resolves numeric, millisecond, and second CSS durations', function() {
    setCssDuration('250');
    expect(getCssDuration('--duration')).to.equal(250);

    setCssDuration('175ms');
    expect(getCssDuration('--duration')).to.equal(175);

    setCssDuration('0.3s');
    expect(getCssDuration('--duration')).to.equal(300);
  });

  it('fails clearly when CSS duration is unavailable or invalid', function() {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    });
    expect(() => getCssDuration('--duration')).to.throw('Missing required theme duration: --duration');

    setCssDuration('');
    expect(() => getCssDuration('--duration')).to.throw('Missing required theme duration: --duration');
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
