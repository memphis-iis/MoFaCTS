import { expect } from 'chai';
import { defaultLearningComponentCatalog } from '../../learning-components/defaultLearningComponentCatalog';
import { sampleEchoUnitComponentManifest } from '../../learning-components/samples/echo-unit/manifest';
import { SAMPLE_ECHO_UNIT_TYPE } from '../../learning-components/samples/echo-unit/EchoUnitEngine';
import type { CreateUnitEngineDeps } from '../../learning-components/units/createUnitEngine';
import {
  combineLearningComponentCatalogs,
  createLearningComponentCatalog,
  summarizeLearningComponentCatalog,
  validateLearningComponentCatalog,
} from '../../learning-components/runtime/LearningComponentCatalog';
import type { LearningComponentManifest } from '../../learning-components/runtime/ComponentManifest';

describe('Learning component catalog', function() {
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
      }],
      trialDisplays: [{
        id: 'sample.display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['sample-display'],
        requiredCapabilities: ['media'],
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
    ]);
    expect(summary.units.find((manifest) => manifest.id === 'mofacts.autotutor-unit'))
      .to.deep.include({
        id: 'mofacts.autotutor-unit',
        kind: 'unit',
        requiredCapabilities: ['session', 'server-methods', 'history', 'logging'],
      });
    expect(summary.trialDisplays).to.deep.equal([{
      id: 'mofacts.h5p-trial-display',
      kind: 'trial-display',
      unitTypes: [],
      displayTypes: ['h5p'],
      requiredCapabilities: ['history', 'media'],
    }]);
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
      }],
      trialDisplays: [{
        id: 'sample.display',
        kind: 'trial-display',
        unitTypes: [],
        displayTypes: ['sample-display'],
        requiredCapabilities: ['media'],
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
      });

    expect(() => combineLearningComponentCatalogs([
      defaultLearningComponentCatalog,
      defaultLearningComponentCatalog,
    ])).to.throw('Learning component "mofacts.instruction-unit" is declared more than once in the catalog');
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
