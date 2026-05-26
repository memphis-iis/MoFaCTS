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

  it('fails before partial registration when any pending manifest is missing capabilities', function() {
    const registered: string[] = [];
    const manifests: LearningComponentManifest[] = [
      {
        id: 'sample.ready',
        kind: 'unit',
        unitTypes: ['ready'],
        requiredCapabilities: ['logging'],
        register() {
          registered.push('ready');
        },
      },
      {
        id: 'sample.not-ready',
        kind: 'unit',
        unitTypes: ['not-ready'],
        requiredCapabilities: ['server-methods'],
        register() {
          registered.push('not-ready');
        },
      },
    ];

    expect(() => registerLearningComponents(manifests, createContext(['logging'])))
      .to.throw('Learning component "sample.not-ready" requires missing capabilities: server-methods');

    expect(registered).to.deep.equal([]);
  });

  it('rejects duplicate component ids, unit types, and display types before registration', function() {
    const duplicateComponentId: LearningComponentManifest[] = [
      {
        id: 'sample.duplicate',
        kind: 'unit',
        unitTypes: ['one'],
        requiredCapabilities: ['logging'],
        register() {},
      },
      {
        id: 'sample.duplicate',
        kind: 'unit',
        unitTypes: ['two'],
        requiredCapabilities: ['logging'],
        register() {},
      },
    ];

    const duplicateUnitType: LearningComponentManifest[] = [
      {
        id: 'sample.one',
        kind: 'unit',
        unitTypes: ['sample-unit'],
        requiredCapabilities: ['logging'],
        register() {},
      },
      {
        id: 'sample.two',
        kind: 'unit',
        unitTypes: ['sample-unit'],
        requiredCapabilities: ['logging'],
        register() {},
      },
    ];

    const duplicateDisplayType: LearningComponentManifest[] = [
      {
        id: 'sample.display-one',
        kind: 'trial-display',
        displayTypes: ['sample-display'],
        requiredCapabilities: ['logging'],
        register() {},
      },
      {
        id: 'sample.display-two',
        kind: 'trial-display',
        displayTypes: ['sample-display'],
        requiredCapabilities: ['logging'],
        register() {},
      },
    ];

    expect(() => registerLearningComponents(duplicateComponentId, createContext(['logging'])))
      .to.throw('Learning component "sample.duplicate" is declared more than once');
    expect(() => registerLearningComponents(duplicateUnitType, createContext(['logging'])))
      .to.throw('Unit type "sample-unit" is declared by more than one learning component');
    expect(() => registerLearningComponents(duplicateDisplayType, createContext(['logging'])))
      .to.throw('Display type "sample-display" is declared by more than one learning component');
  });
});
