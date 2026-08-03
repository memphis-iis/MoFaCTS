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
      displayType: 'widget',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    })).to.throw('Trial display adapter id must be a non-empty string');

    expect(() => validateTrialDisplayAdapter({
      id: 'widget',
      displayType: '',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    })).to.throw('displayType must be a non-empty string');

    expect(() => validateTrialDisplayAdapter({
      id: 'widget',
      displayType: 'widget',
      requiredCapabilities: [],
      ownsInteraction: undefined as unknown as TrialDisplayAdapter['ownsInteraction'],
      normalizeDisplay: (display) => display,
    })).to.throw('must provide ownsInteraction');
  });

  it('registers and resolves adapters by display type without fallback behavior', function() {
    const adapter: TrialDisplayAdapter = {
      id: 'sample.widget-display',
      displayType: 'widget',
      requiredCapabilities: ['media', 'history'],
      ownsInteraction: (display) => Boolean((display as { widget?: unknown })?.widget),
      normalizeDisplay: (display) => display,
    };

    registerTrialDisplayAdapter(adapter);

    expect(getRegisteredTrialDisplayAdapterTypes()).to.deep.equal(['widget']);
    expect(getTrialDisplayAdapter('widget')).to.equal(adapter);
    expect(() => getTrialDisplayAdapter('autotutor')).to.throw('No trial display adapter registered for "autotutor"');
  });

  it('rejects duplicate display type registration', function() {
    const adapter: TrialDisplayAdapter = {
      id: 'first',
      displayType: 'widget',
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    };

    registerTrialDisplayAdapter(adapter);

    expect(() => registerTrialDisplayAdapter({
      ...adapter,
      id: 'second',
    })).to.throw('Trial display adapter for "widget" is already registered');
  });
});
