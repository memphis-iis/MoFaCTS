import { expect } from 'chai';
import {
  getElementTransitionDurationMs,
  parseCssTimeToMs,
} from './trialTransitionTiming';

describe('trial transition timing', function() {
  it('parses CSS transition times in milliseconds and seconds', function() {
    expect(parseCssTimeToMs('80ms')).to.equal(80);
    expect(parseCssTimeToMs('0.2s')).to.equal(200);
    expect(parseCssTimeToMs('75')).to.equal(75);
    expect(parseCssTimeToMs('nonsense')).to.equal(0);
  });

  it('reads the first transition duration and delay from an element', function() {
    const element = {} as Element;
    expect(getElementTransitionDurationMs(element, () => ({
      transitionDuration: '0.1s, 1s',
      transitionDelay: '50ms, 2s',
    }))).to.equal(150);
  });
});
