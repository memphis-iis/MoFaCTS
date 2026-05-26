import { expect } from 'chai';
import {
  createLearningComponentRuntimeContext,
  getLearningComponentCapabilitySet,
  type LearningComponentCapabilities,
} from '../../learning-components/runtime/LearningComponentContext';
import { assertLearningComponentCapabilities } from '../../learning-components/runtime/ComponentManifest';
import type { LearningComponentManifest } from '../../learning-components/runtime/ComponentManifest';

describe('Learning component runtime capabilities', function() {
  it('derives manifest capabilities from the typed runtime dependency object', function() {
    const capabilities = getLearningComponentCapabilitySet({
      session: {
        getSessionValue: () => undefined,
        setSessionValue() {},
      },
      deliverySettings: {
        getDeliverySettings: () => ({}),
      },
      stimuli: {},
      adaptiveModel: {},
      assessmentState: {},
      media: {
        resolveMediaUrl: () => null,
      },
      history: {
        normalizeResult: (result) => result,
        async writeResult() {},
      },
      serverMethods: {
        callMethod: async <T>() => undefined as T,
      },
      authorization: {
        currentUserHasRole: () => false,
      },
      logger: {
        log() {},
      },
      userAlerts: {
        alertUser() {},
      },
    });

    expect([...capabilities].sort()).to.deep.equal([
      'adaptive-model',
      'assessment-state',
      'authz',
      'delivery-settings',
      'history',
      'logging',
      'media',
      'server-methods',
      'session',
      'stimuli',
      'ui-alerts',
    ]);
  });

  it('keeps missing typed runtime dependencies visible to manifest validation', function() {
    const manifest: LearningComponentManifest = {
      id: 'sample.requires-media-history',
      kind: 'trial-display',
      displayTypes: ['sample-display'],
      requiredCapabilities: ['media', 'history'],
      register() {},
    };
    const runtimeCapabilities: LearningComponentCapabilities = {
      media: {
        resolveMediaUrl: () => null,
      },
    };

    expect(() => assertLearningComponentCapabilities(
      manifest,
      createLearningComponentRuntimeContext(runtimeCapabilities),
    )).to.throw('Learning component "sample.requires-media-history" requires missing capabilities: history');
  });
});
