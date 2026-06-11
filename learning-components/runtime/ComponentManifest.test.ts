import assert from 'node:assert/strict';
import {
  validateLearningComponentManifest,
  type LearningComponentManifest,
} from './ComponentManifest';
import {
  summarizeLearningComponentManifest,
  summarizeProvidedServices,
} from './registerLearningComponents';

function manifest(
  overrides: Partial<LearningComponentManifest> = {},
): LearningComponentManifest {
  return {
    id: 'mofacts.sample-unit',
    kind: 'unit',
    unitTypes: ['sample'],
    requiredCapabilities: ['session'],
    register() {},
    ...overrides,
  };
}

describe('ComponentManifest providedServices', function() {
  it('includes provided services in validated manifest summaries', function() {
    const summary = summarizeLearningComponentManifest(manifest({
      providedServices: [
        'sample.state-replay',
        'sample.history-bridge',
      ],
    }));

    assert.deepEqual(summary.providedServices, [
      'sample.history-bridge',
      'sample.state-replay',
    ]);
  });

  it('rejects duplicate provided service declarations', function() {
    assert.throws(
      () => validateLearningComponentManifest(manifest({
        providedServices: [
          'sample.state-replay',
          'sample.state-replay',
        ],
      })),
      /declares duplicate provided service: sample\.state-replay/,
    );
  });

  it('rejects blank provided service declarations', function() {
    assert.throws(
      () => validateLearningComponentManifest(manifest({
        providedServices: [' '],
      })),
      /provided service must be a non-empty string/,
    );
  });

  it('summarizes provided services across registered component manifests', function() {
    assert.deepEqual(summarizeProvidedServices([
      manifest({
        id: 'mofacts.sparc',
        providedServices: [
          'sparc.document-replay',
          'sparc.ctat-sample-brd-verification',
        ],
      }),
      manifest({
        id: 'mofacts.cards',
        unitTypes: ['learning'],
        providedServices: [
          'cards.practice-history',
        ],
      }),
    ]), [{
      serviceName: 'cards.practice-history',
      componentId: 'mofacts.cards',
    }, {
      serviceName: 'sparc.ctat-sample-brd-verification',
      componentId: 'mofacts.sparc',
    }, {
      serviceName: 'sparc.document-replay',
      componentId: 'mofacts.sparc',
    }]);
  });

  it('rejects provided service declarations owned by more than one component', function() {
    assert.throws(
      () => summarizeProvidedServices([
        manifest({
          id: 'mofacts.first',
          providedServices: ['sparc.document-replay'],
        }),
        manifest({
          id: 'mofacts.second',
          unitTypes: ['second'],
          providedServices: ['sparc.document-replay'],
        }),
      ]),
      /Provided service "sparc\.document-replay" is declared by both "mofacts\.first" and "mofacts\.second"/,
    );
  });
});
