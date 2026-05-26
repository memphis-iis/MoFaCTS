import { expect } from 'chai';
import {
  getRegisteredTrialDisplayAdapterTypes,
  getTrialDisplayAdapter,
  registerTrialDisplayAdapter,
  resetTrialDisplayAdapterRegistryForTests,
  validateTrialDisplayAdapter,
  type TrialDisplayAdapter,
} from '../../learning-components/runtime/TrialDisplayAdapterRegistry';

describe('Trial display adapter registry', function() {
  beforeEach(function() {
    resetTrialDisplayAdapterRegistryForTests();
  });

  it('requires adapter identity, display type, and lifecycle functions', function() {
    expect(() => validateTrialDisplayAdapter({
      id: '',
      displayType: 'h5p',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    })).to.throw('Trial display adapter id must be a non-empty string');

    expect(() => validateTrialDisplayAdapter({
      id: 'h5p',
      displayType: '',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    })).to.throw('displayType must be a non-empty string');

    expect(() => validateTrialDisplayAdapter({
      id: 'h5p',
      displayType: 'h5p',
      requiredCapabilities: [],
      ownsInteraction: undefined as unknown as TrialDisplayAdapter['ownsInteraction'],
      normalizeDisplay: (display) => display,
    })).to.throw('must provide ownsInteraction');
  });

  it('registers and resolves adapters by display type without fallback behavior', function() {
    const adapter: TrialDisplayAdapter = {
      id: 'mofacts.h5p-display',
      displayType: 'h5p',
      requiredCapabilities: ['media', 'history'],
      ownsInteraction: (display) => Boolean((display as { h5p?: unknown })?.h5p),
      normalizeDisplay: (display) => display,
    };

    registerTrialDisplayAdapter(adapter);

    expect(getRegisteredTrialDisplayAdapterTypes()).to.deep.equal(['h5p']);
    expect(getTrialDisplayAdapter('h5p')).to.equal(adapter);
    expect(() => getTrialDisplayAdapter('autotutor')).to.throw('No trial display adapter registered for "autotutor"');
  });

  it('rejects duplicate display type registration', function() {
    const adapter: TrialDisplayAdapter = {
      id: 'first',
      displayType: 'h5p',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    };

    registerTrialDisplayAdapter(adapter);

    expect(() => registerTrialDisplayAdapter({
      ...adapter,
      id: 'second',
    })).to.throw('Trial display adapter for "h5p" is already registered');
  });
});
