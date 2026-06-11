import assert from 'node:assert/strict';
import {
  validateLearningComponentManifest,
  type LearningComponentManifest,
} from './ComponentManifest';
import { summarizeLearningComponentManifest } from './registerLearningComponents';

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
});
