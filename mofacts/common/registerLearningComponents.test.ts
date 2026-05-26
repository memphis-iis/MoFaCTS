import { expect } from 'chai';
import {
  type LearningComponentCapability,
  type LearningComponentManifest,
  type LearningComponentRuntimeContext,
} from '../../learning-components/runtime/ComponentManifest';
import {
  registerLearningComponents,
  summarizeLearningComponentManifests,
} from '../../learning-components/runtime/registerLearningComponents';

function createContext(capabilities: LearningComponentCapability[] = []): LearningComponentRuntimeContext {
  const registeredUnitTypes: string[] = [];
  return {
    capabilities: new Set(capabilities),
    registerUnitEngine(unitType) {
      registeredUnitTypes.push(unitType);
    },
    registerUnitEngineWithDeps(unitType) {
      registeredUnitTypes.push(unitType);
    },
    registerTrialDisplayAdapter() {},
  };
}

describe('registerLearningComponents', function() {
  it('summarizes manifest lists before registration for diagnostics', function() {
    const manifests: LearningComponentManifest[] = [
      {
        id: 'sample.display',
        kind: 'trial-display',
        displayTypes: [' h5p '],
        requiredCapabilities: ['history', 'media'],
        register() {},
      },
      {
        id: 'sample.unit',
        kind: 'unit',
        unitTypes: [' model ', 'instruction-only'],
        requiredCapabilities: ['logging', 'session'],
        register() {},
      },
    ];

    expect(summarizeLearningComponentManifests(manifests)).to.deep.equal([
      {
        id: 'sample.display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['h5p'],
        requiredCapabilities: ['history', 'media'],
      },
      {
        id: 'sample.unit',
        kind: 'unit',
        unitTypes: ['instruction-only', 'model'],
        displayTypes: [],
        requiredCapabilities: ['logging', 'session'],
      },
    ]);
  });

  it('registers manifest lists through one reusable bootstrap path', function() {
    const registered: string[] = [];
    const manifests: LearningComponentManifest[] = [
      {
        id: 'sample.one',
        kind: 'unit',
        unitTypes: ['one'],
        requiredCapabilities: ['logging'],
        register() {
          registered.push('one');
        },
      },
      {
        id: 'sample.two',
        kind: 'unit',
        unitTypes: ['two'],
        requiredCapabilities: ['logging'],
        register() {
          registered.push('two');
        },
      },
    ];

    registerLearningComponents(manifests, createContext(['logging']));

    expect(registered).to.deep.equal(['one', 'two']);
  });

  it('skips already-registered manifests without hiding missing capabilities on new ones', function() {
    const registered: string[] = [];
    const manifests: LearningComponentManifest[] = [
      {
        id: 'sample.skip',
        kind: 'unit',
        unitTypes: ['skip'],
        requiredCapabilities: ['history'],
        register() {
          registered.push('skip');
        },
      },
      {
        id: 'sample.fail',
        kind: 'unit',
        unitTypes: ['fail'],
        requiredCapabilities: ['history'],
        register() {
          registered.push('fail');
        },
      },
    ];

    expect(() => registerLearningComponents(manifests, createContext([]), {
      alreadyRegistered(manifest) {
        return manifest.id === 'sample.skip';
      },
    })).to.throw('Learning component "sample.fail" requires missing capabilities: history');

    expect(registered).to.deep.equal([]);
  });
});
