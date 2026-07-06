import { expect } from 'chai';
import { defaultLearningComponentCatalog } from '../../learning-components/defaultLearningComponentCatalog';
import { sampleEchoUnitComponentManifest } from '../../learning-components/samples/echo-unit/manifest';
import { SAMPLE_ECHO_UNIT_TYPE } from '../../learning-components/samples/echo-unit/EchoUnitEngine';
import {
  getCreateUnitEngineServerMethodSet,
  getCreateUnitEngineCapabilitySet,
  type CreateUnitEngineDeps,
} from '../../learning-components/units/createUnitEngine';
import {
  combineLearningComponentCatalogs,
  createLearningComponentCatalog,
  summarizeLearningComponentCatalog,
  validateLearningComponentCatalog,
} from '../../learning-components/runtime/LearningComponentCatalog';
import type { LearningComponentManifest } from '../../learning-components/runtime/ComponentManifest';

describe('Learning component catalog', function() {
  it('derives unit runtime capabilities from the concrete app adapter', function() {
    const adapter: Partial<CreateUnitEngineDeps> = {
      session: {
        getSessionValue: () => undefined,
        setSessionValue() {},
      },
      deliverySettings: {
        getDeliverySettings: () => ({}),
      },
      stimuli: {
        getStimCount: () => 0,
        getStimCluster: () => ({}),
        getTestType: () => '',
        getDisplayAnswerText: () => '',
        extractDelimFields() {},
        rangeVal: () => [],
        legacyFloat: () => 0,
        legacyInt: () => 0,
        displayify: (value) => value,
        findTdfById: () => ({}),
      },
      adaptiveModel: {
        createAdaptiveQuestionLogic: () => ({}),
        getHiddenItems: () => [],
        setNumVisibleCards() {},
        updateCurStudentPerformance() {},
        updateCurStudedentPracticeTime() {},
      },
      assessmentState: {
        getExperimentState: () => ({}),
        hasScheduleArtifactForUnit: () => false,
        createExperimentState: async () => ({}),
      },
      history: {
        reconstructLearningStateFromHistory: () => ({}),
      },
      serverMethods: {
        getAutoTutorHistoryForUnit: async () => [],
        getLearningHistoryForUnit: async () => [],
        getSparcHistoryForUnit: async () => [],
        getResponseKCMapForTdf: async () => ({}),
        getStimulusCrowdStatsForDeck: async () => [],
      },
      authz: {
        currentUserHasRole: () => false,
      },
      progression: {
        unitIsFinished() {},
      },
      cardState: {
        setQuestionIndex() {},
        setCurrentAnswer() {},
        setAlternateDisplayIndex() {},
        setOriginalQuestion() {},
      },
      user: {
        getCurrentUserId: () => undefined,
      },
      app: {
        extend: (target, source) => Object.assign(target, source),
      },
      logging: {
        log() {},
      },
      uiAlerts: {
        alertUser() {},
      },
      aiProvider: {
        async callOpenRouterJson(options) {
          return {
            value: options.intent.parse({}),
            rawContent: '{}',
            responseBody: {},
          };
        },
      },
    };

    expect([...getCreateUnitEngineCapabilitySet(adapter)].sort()).to.deep.equal([
      'adaptive-card-model',
      'ai-provider',
      'assessment-state',
      'authz',
      'card-state',
      'delivery-settings',
      'history',
      'logging',
      'server-methods',
      'session',
      'stimuli',
      'ui-alerts',
    ]);

    const { serverMethods: _serverMethods, ...adapterWithoutServerMethods } = adapter;
    expect([...getCreateUnitEngineCapabilitySet(adapterWithoutServerMethods)].sort())
      .not.to.include('server-methods');
    expect([...getCreateUnitEngineServerMethodSet(adapter)].sort()).to.deep.equal([
      'getAutoTutorHistoryForUnit',
      'getLearningHistoryForUnit',
      'getResponseKCMapForTdf',
      'getSparcHistoryForUnit',
      'getStimulusCrowdStatsForDeck',
    ]);
    expect([...getCreateUnitEngineServerMethodSet(adapterWithoutServerMethods)].sort()).to.deep.equal([]);

    expect([...getCreateUnitEngineCapabilitySet({
      ...adapter,
      serverMethods: {
        getAutoTutorHistoryForUnit: async () => [],
      } as any,
    })].sort()).not.to.include('server-methods');
  });

  it('summarizes unit and trial-display manifests through one package shape', function() {
    const unitManifest: LearningComponentManifest = {
      id: 'sample.unit',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };
    const displayManifest: LearningComponentManifest = {
      id: 'sample.display',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['media'],
      register() {},
    };

    const catalog = createLearningComponentCatalog({
      unitManifests: [unitManifest],
      trialDisplayManifests: [displayManifest],
    });

    expect(summarizeLearningComponentCatalog(catalog)).to.deep.equal({
      units: [{
        id: 'sample.unit',
        kind: 'unit',
        unitTypes: ['sample'],
        displayTypes: [],
        requiredCapabilities: ['logging'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      }],
      trialDisplays: [{
        id: 'sample.display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['sample-display'],
        requiredCapabilities: ['media'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      }],
    });
  });

  it('packages default unit and trial-display manifests in one catalog', function() {
    const summary = summarizeLearningComponentCatalog(defaultLearningComponentCatalog);

    expect(summary.units.map((manifest) => manifest.id)).to.include.members([
      'mofacts.instruction-unit',
      'mofacts.learning-session-unit',
      'mofacts.assessment-session-unit',
      'mofacts.video-session-unit',
      'mofacts.autotutor-unit',
      'mofacts.sparcsession-unit',
    ]);
    expect(summary.units.find((manifest) => manifest.id === 'mofacts.autotutor-unit'))
      .to.deep.include({
        id: 'mofacts.autotutor-unit',
        kind: 'unit',
        requiredCapabilities: ['ai-provider', 'history', 'logging', 'server-methods', 'session', 'stimuli'],
        requiredServerMethods: ['getAutoTutorHistoryForUnit'],
      });
    expect(summary.units.find((manifest) => manifest.id === 'mofacts.learning-session-unit'))
      .to.deep.include({
        id: 'mofacts.learning-session-unit',
        kind: 'unit',
        requiredServerMethods: ['getLearningHistoryForUnit', 'getResponseKCMapForTdf', 'getStimulusCrowdStatsForDeck'],
      });
    expect(summary.units.find((manifest) => manifest.id === 'mofacts.sparcsession-unit'))
      .to.deep.include({
        id: 'mofacts.sparcsession-unit',
        kind: 'unit',
        requiredServerMethods: ['getLearningHistoryForUnit', 'getResponseKCMapForTdf', 'getSparcHistoryForUnit', 'getStimulusCrowdStatsForDeck'],
      });
    expect(summary.units.find((manifest) => manifest.id === 'mofacts.assessment-session-unit'))
      .to.deep.include({
        id: 'mofacts.assessment-session-unit',
        kind: 'unit',
        requiredCapabilities: ['assessment-state', 'card-state', 'logging', 'session', 'stimuli', 'ui-alerts'],
        requiredServerMethods: [],
      });
    expect(summary.trialDisplays).to.deep.equal([
      {
        id: 'mofacts.h5p-trial-display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['h5p'],
        requiredCapabilities: ['history', 'media'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      },
      {
        id: 'mofacts.sparc-trial-display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['sparc'],
        requiredCapabilities: ['history', 'media'],
        requiredServerMethods: [],
        providedServices: ['sparc.display-content-readiness'],
        providedServiceDetails: [{
          serviceName: 'sparc.display-content-readiness',
          componentId: 'mofacts.sparc-trial-display',
          runtimeEntry: 'sparcDisplayContentReadiness.validateSparcDisplayContentReadiness',
        }],
      },
    ]);
  });

  it('combines approved catalogs through the same validation boundary', function() {
    const unitManifest: LearningComponentManifest = {
      id: 'sample.unit',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };
    const displayManifest: LearningComponentManifest = {
      id: 'sample.display',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['media'],
      register() {},
    };
    const duplicateUnitManifest: LearningComponentManifest = {
      id: 'sample.unit-two',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };

    const combined = combineLearningComponentCatalogs([
      createLearningComponentCatalog({
        unitManifests: [unitManifest],
        trialDisplayManifests: [],
      }),
      createLearningComponentCatalog({
        unitManifests: [],
        trialDisplayManifests: [displayManifest],
      }),
    ]);

    expect(summarizeLearningComponentCatalog(combined)).to.deep.equal({
      units: [{
        id: 'sample.unit',
        kind: 'unit',
        unitTypes: ['sample'],
        displayTypes: [],
        requiredCapabilities: ['logging'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      }],
      trialDisplays: [{
        id: 'sample.display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['sample-display'],
        requiredCapabilities: ['media'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      }],
    });

    expect(() => combineLearningComponentCatalogs([
      createLearningComponentCatalog({
        unitManifests: [unitManifest],
        trialDisplayManifests: [],
      }),
      createLearningComponentCatalog({
        unitManifests: [duplicateUnitManifest],
        trialDisplayManifests: [],
      }),
    ])).to.throw('Unit type "sample" is declared more than once in the catalog');
  });

  it('extends the default catalog with an approved sample package without mutating defaults', function() {
    const defaultSummary = summarizeLearningComponentCatalog(defaultLearningComponentCatalog);
    const extensionCatalog = createLearningComponentCatalog<CreateUnitEngineDeps>({
      unitManifests: [sampleEchoUnitComponentManifest as unknown as LearningComponentManifest<CreateUnitEngineDeps>],
      trialDisplayManifests: [],
    });

    const extendedSummary = summarizeLearningComponentCatalog(
      combineLearningComponentCatalogs([
        defaultLearningComponentCatalog,
        extensionCatalog,
      ]),
    );

    expect(defaultSummary.units.map((manifest) => manifest.id))
      .not.to.include(sampleEchoUnitComponentManifest.id);
    expect(extendedSummary.units.map((manifest) => manifest.id))
      .to.include(sampleEchoUnitComponentManifest.id);
    expect(extendedSummary.units.find((manifest) => manifest.id === sampleEchoUnitComponentManifest.id))
      .to.deep.equal({
        id: sampleEchoUnitComponentManifest.id,
        kind: 'unit',
        unitTypes: [SAMPLE_ECHO_UNIT_TYPE],
        displayTypes: [],
        requiredCapabilities: ['logging'],
        requiredServerMethods: [],
        providedServices: [],
        providedServiceDetails: [],
      });

    expect(() => combineLearningComponentCatalogs([
      defaultLearningComponentCatalog,
      defaultLearningComponentCatalog,
    ])).to.throw('is declared more than once in the catalog');
  });

  it('rejects duplicate component ids across unit and trial-display catalog entries', function() {
    const unitManifest: LearningComponentManifest = {
      id: 'sample.duplicate',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };
    const displayManifest: LearningComponentManifest = {
      id: 'sample.duplicate',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['media'],
      register() {},
    };

    expect(() => validateLearningComponentCatalog({
      unitManifests: [unitManifest],
      trialDisplayManifests: [displayManifest],
    })).to.throw('Learning component "sample.duplicate" is declared more than once in the catalog');
    expect(() => createLearningComponentCatalog({
      unitManifests: [unitManifest],
      trialDisplayManifests: [displayManifest],
    })).to.throw('Learning component "sample.duplicate" is declared more than once in the catalog');
  });

  it('rejects duplicate unit and display declarations while assembling a catalog', function() {
    const unitManifestOne: LearningComponentManifest = {
      id: 'sample.unit-one',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };
    const unitManifestTwo: LearningComponentManifest = {
      id: 'sample.unit-two',
      kind: 'unit',
      unitTypes: ['sample'],
      requiredCapabilities: ['logging'],
      register() {},
    };
    const displayManifestOne: LearningComponentManifest = {
      id: 'sample.display-one',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['media'],
      register() {},
    };
    const displayManifestTwo: LearningComponentManifest = {
      id: 'sample.display-two',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['history'],
      register() {},
    };

    expect(() => createLearningComponentCatalog({
      unitManifests: [unitManifestOne, unitManifestTwo],
      trialDisplayManifests: [],
    })).to.throw('Unit type "sample" is declared more than once in the catalog');

    expect(() => createLearningComponentCatalog({
      unitManifests: [],
      trialDisplayManifests: [displayManifestOne, displayManifestTwo],
    })).to.throw('Display type "sample-display" is declared more than once in the catalog');
  });
});
