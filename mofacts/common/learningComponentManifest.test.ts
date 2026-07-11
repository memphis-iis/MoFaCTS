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
import {
  AUTO_TUTOR_SESSION_UNIT_TYPE,
  type AutoTutorUnitEngine,
} from '../../learning-components/units/autotutor/AutoTutorUnitEngine';
import { autoTutorUnitComponentManifest } from '../../learning-components/units/autotutor/manifest';
import { sampleEchoUnitFixtureDeps } from '../../learning-components/samples/echo-unit/fixtures';
import { sampleEchoUnitComponentManifest } from '../../learning-components/samples/echo-unit/manifest';
import { SAMPLE_ECHO_UNIT_TYPE } from '../../learning-components/samples/echo-unit/EchoUnitEngine';

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

  it('rejects ambiguous kind-specific declarations', function() {
    expect(() => validateLearningComponentManifest({
      id: 'sample.unit',
      kind: 'unit',
      unitTypes: ['sample'],
      displayTypes: ['sample-display'],
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component "sample.unit" is a unit component and must not declare display types');

    expect(() => validateLearningComponentManifest({
      id: 'sample.display',
      kind: 'trial-display',
      unitTypes: ['sample'],
      displayTypes: ['sample-display'],
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component "sample.display" is a trial-display component and must not declare unit types');
  });

  it('requires valid declared capabilities even for loosely typed manifests', function() {
    expect(() => validateLearningComponentManifest({
      id: 'sample.capabilities',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: undefined as unknown as LearningComponentCapability[],
      register() {},
    })).to.throw('Learning component "sample.capabilities" must declare requiredCapabilities as an array');

    expect(() => validateLearningComponentManifest({
      id: 'sample.capabilities',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: [''] as unknown as LearningComponentCapability[],
      register() {},
    })).to.throw('required capability must be a non-empty string');

    expect(() => validateLearningComponentManifest({
      id: 'sample.capabilities',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['database'] as unknown as LearningComponentCapability[],
      register() {},
    })).to.throw('Learning component "sample.capabilities" requires unknown capability: database');

    expect(() => validateLearningComponentManifest({
      id: 'sample.capabilities',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      requiredServerMethods: ['getLearningHistoryForUnit'],
      register() {},
    })).to.throw('Learning component "sample.capabilities" declares requiredServerMethods without server-methods capability');
  });

  it('rejects duplicate normalized manifest declarations', function() {
    expect(() => validateLearningComponentManifest({
      id: 'sample.duplicates',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging', 'logging'],
      register() {},
    })).to.throw('Learning component "sample.duplicates" declares duplicate required capability: logging');

    expect(() => validateLearningComponentManifest({
      id: 'sample.duplicates',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['server-methods'],
      requiredServerMethods: ['getHistory', ' getHistory '],
      register() {},
    })).to.throw('Learning component "sample.duplicates" declares duplicate required server method: getHistory');

    expect(() => validateLearningComponentManifest({
      id: 'sample.duplicates',
      kind: 'unit',
      unitTypes: ['sample', ' sample '],
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component "sample.duplicates" declares duplicate unit type: sample');

    expect(() => validateLearningComponentManifest({
      id: 'sample.duplicates',
      kind: 'trial-display',
      displayTypes: ['h5p', ' h5p '],
      requiredCapabilities: [],
      register() {},
    })).to.throw('Learning component "sample.duplicates" declares duplicate display type: h5p');
  });

  it('fails clearly when required named server methods are missing', function() {
    const manifest: LearningComponentManifest = {
      id: 'sample.component',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['server-methods'],
      requiredServerMethods: ['getLearningHistoryForUnit'],
      register() {},
    };

    expect(() => registerLearningComponent(manifest, {
      ...createContext(['server-methods']),
      serverMethods: new Set(),
    })).to.throw('Learning component "sample.component" requires missing server methods: getLearningHistoryForUnit');

    expect(() => registerLearningComponent(manifest, {
      ...createContext(['server-methods']),
      serverMethods: new Set(['getLearningHistoryForUnit']),
    })).not.to.throw();
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
        context.registerUnitEngine('sample', () => ({
          unitType: 'sample',
          selectNextCard: async () => undefined,
          cardAnswered: async () => undefined,
          unitFinished: async () => false,
          prepareNextTrial: async () => ({ selection: null, preparedAdvanceMode: 'none' }),
          commitPreparedTrial: () => true,
          advanceAfterAnswer: async () => undefined,
          isFinished: async () => false,
          getDisplayQuestionIndex: (index) => index,
          clearPreparedTrial: () => undefined,
        }));
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

  it('proves a new in-repo sample unit package can register through the manifest bootstrap path', async function() {
    registerLearningComponent(sampleEchoUnitComponentManifest, {
      capabilities: new Set<LearningComponentCapability>(['logging']),
      registerUnitEngine,
      registerUnitEngineWithDeps,
      registerTrialDisplayAdapter() {
        throw new Error('sample unit should not register trial display adapters');
      },
    });

    expect(getRegisteredUnitEngineTypes()).to.deep.equal([SAMPLE_ECHO_UNIT_TYPE]);

    const engine = await createRegisteredUnitEngine(SAMPLE_ECHO_UNIT_TYPE, sampleEchoUnitFixtureDeps);
    expect(engine.unitType).to.equal('sample-echo:manifest-package');
    expect(await engine.selectNextCard?.()).to.deep.equal({ testType: SAMPLE_ECHO_UNIT_TYPE });
  });

  it('keeps the AutoTutor unit behind its own component manifest', async function() {
    registerLearningComponent(autoTutorUnitComponentManifest, {
      capabilities: new Set<LearningComponentCapability>(['session', 'stimuli', 'server-methods', 'history', 'logging', 'ai-provider']),
      serverMethods: new Set(['getAutoTutorHistoryForUnit']),
      registerUnitEngine,
      registerUnitEngineWithDeps,
      registerTrialDisplayAdapter() {
        throw new Error('AutoTutor unit should not register trial display adapters');
      },
    });

    expect(getRegisteredUnitEngineTypes()).to.deep.equal([AUTO_TUTOR_SESSION_UNIT_TYPE]);

    const engine = await createRegisteredUnitEngine(AUTO_TUTOR_SESSION_UNIT_TYPE) as AutoTutorUnitEngine;
    expect(engine.unitType).to.equal(AUTO_TUTOR_SESSION_UNIT_TYPE);
    expect(engine.createInitialState).to.be.a('function');
    expect(engine.scoreAndPlanTurn).to.be.a('function');
    expect(engine.validateLearnerInput).to.be.a('function');
  });

  it('fails AutoTutor registration when app-owned runtime capabilities are missing', function() {
    expect(() => registerLearningComponent(autoTutorUnitComponentManifest, {
      capabilities: new Set<LearningComponentCapability>(['logging']),
      registerUnitEngine,
      registerUnitEngineWithDeps,
      registerTrialDisplayAdapter() {
        throw new Error('AutoTutor unit should not register trial display adapters');
      },
    })).to.throw('Learning component "mofacts.autotutor-unit" requires missing capabilities: session, stimuli, server-methods, history, ai-provider');
  });
});
