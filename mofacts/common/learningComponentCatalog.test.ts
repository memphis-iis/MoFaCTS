import { expect } from 'chai';
import { defaultLearningComponentCatalog } from '../../learning-components/defaultLearningComponentCatalog';
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
      'mofacts.autotutor-unit-placeholder',
    ]);
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
