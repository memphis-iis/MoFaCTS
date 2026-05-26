import { expect } from 'chai';
import {
  registerLearningComponent,
  validateLearningComponentManifest,
  type LearningComponentCapability,
  type LearningComponentManifest,
  type LearningComponentRuntimeContext,
} from '../../learning-components/runtime/ComponentManifest';
import {
  createRegisteredUnitEngine,
  getRegisteredUnitEngineTypes,
  registerUnitEngine,
  registerUnitEngineWithDeps,
  resetUnitEngineRegistryForTests,
} from '../../learning-components/units/UnitEngineRegistry';

function createContext(capabilities: LearningComponentCapability[] = []): LearningComponentRuntimeContext {
  const registeredUnitTypes: string[] = [];
  const registeredDisplayTypes: string[] = [];
  return {
    capabilities: new Set(capabilities),
    registerUnitEngine(unitType) {
      registeredUnitTypes.push(unitType);
    },
    registerUnitEngineWithDeps(unitType) {
      registeredUnitTypes.push(unitType);
    },
    registerTrialDisplayAdapter(adapter) {
      registeredDisplayTypes.push(adapter.displayType);
    },
  };
}

describe('Learning component manifests', function() {
  afterEach(function() {
    resetUnitEngineRegistryForTests();
  });

  it('requires a non-empty component id and unit type', function() {
    expect(() => validateLearningComponentManifest({
      id: '',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component id must be a non-empty string');

    expect(() => validateLearningComponentManifest({
      id: 'sample',
      kind: 'unit',
      unitTypes: [''],
      requiredCapabilities: [],
      register() {},
    })).to.throw('unit type must be a non-empty string');
  });

  it('requires display types for trial-display components', function() {
    expect(() => validateLearningComponentManifest({
      id: 'sample.display',
      kind: 'trial-display',
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component "sample.display" must declare at least one display type');

    expect(() => validateLearningComponentManifest({
      id: 'sample.display',
      kind: 'trial-display',
      displayTypes: [''],
      requiredCapabilities: [],
      register() {},
    })).to.throw('display type must be a non-empty string');
  });

  it('fails clearly when required runtime capabilities are missing', function() {
    const manifest: LearningComponentManifest = {
      id: 'sample.component',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['session', 'history'],
      register() {},
    };

    expect(() => registerLearningComponent(manifest, createContext(['session'])))
      .to.throw('Learning component "sample.component" requires missing capabilities: history');
  });

  it('registers a component when all capabilities are present', function() {
    let registered = false;
    const manifest: LearningComponentManifest = {
      id: 'sample.component',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['session'],
      register(context) {
        context.registerUnitEngine('sample', () => ({}));
        registered = true;
      },
    };

    registerLearningComponent(manifest, createContext(['session']));

    expect(registered).to.equal(true);
  });

  it('registers trial display components through the manifest context', function() {
    let registered = false;
    const manifest: LearningComponentManifest = {
      id: 'sample.display',
      kind: 'trial-display',
      displayTypes: ['h5p'],
      requiredCapabilities: ['media', 'history'],
      register(context) {
        context.registerTrialDisplayAdapter({
          id: 'sample.h5p',
          displayType: 'h5p',
          requiredCapabilities: ['media', 'history'],
          ownsInteraction: () => true,
          normalizeDisplay: (display) => display,
        });
        registered = true;
      },
    };

    registerLearningComponent(manifest, createContext(['media', 'history']));

    expect(registered).to.equal(true);
  });

  it('proves a new in-repo sample unit can register through the manifest bootstrap path', async function() {
    const manifest: LearningComponentManifest<{ suffix: string }> = {
      id: 'sample.echo-unit',
      kind: 'unit',
      unitTypes: ['sample-echo'],
      requiredCapabilities: ['logging'],
      register(context) {
        context.registerUnitEngineWithDeps('sample-echo', (deps) => ({
          unitType: `sample-echo:${deps.suffix}`,
          async cardAnswered() {},
          selectNextCard() {
            return { testType: 'sample' };
          },
          unitFinished() {
            return false;
          },
        }));
      },
    };

    registerLearningComponent(manifest, {
      capabilities: new Set<LearningComponentCapability>(['logging']),
      registerUnitEngine,
      registerUnitEngineWithDeps,
      registerTrialDisplayAdapter() {
        throw new Error('sample unit should not register trial display adapters');
      },
    });

    expect(getRegisteredUnitEngineTypes()).to.deep.equal(['sample-echo']);

    const engine = await createRegisteredUnitEngine('sample-echo', { suffix: 'manifest' });
    expect(engine.unitType).to.equal('sample-echo:manifest');
    expect(await engine.selectNextCard?.()).to.deep.equal({ testType: 'sample' });
  });
});
