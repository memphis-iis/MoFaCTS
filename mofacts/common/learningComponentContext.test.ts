import { expect } from 'chai';
import {
  createLearningComponentRuntimeContext,
  getLearningComponentCapabilitySet,
  type LearningComponentCapabilities,
} from '../../learning-components/runtime/LearningComponentContext';
import { createLearningComponentAdapterContext } from '../../learning-components/runtime/LearningComponentAdapterContext';
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
        normalizeResult: (result: unknown) => result,
        async writeResult() {},
        async writeCanonicalHistory() {},
      },
      serverMethods: {
        getLearningHistoryForUnit: async () => [],
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
      aiProvider: {
        async callOpenRouterJson(options) {
          return {
            value: options.intent.parse({}),
            rawContent: '{}',
            responseBody: {},
          };
        },
      },
    });

    expect([...capabilities].sort()).to.deep.equal([
      'adaptive-model',
      'ai-provider',
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

  it('fails clearly when a runtime capability object omits required functions', function() {
    expect(() => getLearningComponentCapabilitySet({
      history: {
        normalizeResult: (result: unknown) => result,
        async writeResult() {},
      } as any,
    })).to.throw('Runtime capability "history" is missing required functions: writeCanonicalHistory');

    expect(() => getLearningComponentCapabilitySet({
      serverMethods: {} as any,
    })).to.throw('Runtime capability "serverMethods" must expose named method functions');

    expect(() => getLearningComponentCapabilitySet({
      serverMethods: {
        getLearningHistoryForUnit: [] as any,
      },
    })).to.throw('Runtime capability "serverMethods" has non-function entries: getLearningHistoryForUnit');

    expect(() => getLearningComponentCapabilitySet({
      aiProvider: {} as any,
    })).to.throw('Runtime capability "aiProvider" is missing required functions: callOpenRouterJson');
  });

  it('projects named server methods into the manifest runtime context', function() {
    const context = createLearningComponentRuntimeContext({
      serverMethods: {
        getLearningHistoryForUnit: async () => [],
      },
    });

    expect(context.capabilities.has('server-methods')).to.equal(true);
    expect(context.serverMethods?.has('getLearningHistoryForUnit')).to.equal(true);
  });

  it('projects app-supplied adapter functions without binding component code to a host runtime', function() {
    const calls: unknown[][] = [];
    const context = createLearningComponentAdapterContext({
      getSessionValue: (key) => `session:${key}`,
      setSessionValue: (key, value) => calls.push(['setSessionValue', key, value]),
      getDeliverySettings: () => ({ mode: 'practice' }),
      log: (level, ...args) => calls.push(['log', level, ...args]),
    });

    expect(context.getSessionValue('currentTdfId')).to.equal('session:currentTdfId');
    context.setSessionValue('unitType', 'learning');
    expect(context.getDeliverySettings()).to.deep.equal({ mode: 'practice' });
    context.log(2, 'ready');
    expect(calls).to.deep.equal([
      ['setSessionValue', 'unitType', 'learning'],
      ['log', 2, 'ready'],
    ]);
  });
});
