import { expect } from 'chai';
import {
  buildContentInitializeFailureDiagnostic,
  runContentLaunchOrchestration,
  type ContentLaunchOrchestrationDeps,
} from './contentLaunchOrchestration';
import type { ContentReadinessDependencies } from './contentReadiness';

function createDeps(overrides: Partial<ContentLaunchOrchestrationDeps> = {}) {
  const events: string[] = [];
  const readinessDeps: ContentReadinessDependencies = {
    getCurrentTdfUnit: () => ({ unitname: 'Unit' }),
    getDeliverySettings: () => ({ displayQuestionNumber: true }),
    getVideoCheckpoints: () => null,
  };
  const failures: Array<{ stage: string; diagnostic: Record<string, unknown> }> = [];
  const base: ContentLaunchOrchestrationDeps = {
    initializeContent: async () => undefined,
    waitForContentReadiness: async () => true,
    getReadinessDependencies: () => readinessDeps,
    buildReadinessDiagnostic: () => ({
      hasCurrentTdfUnit: false,
      hasDeliverySettings: false,
      hasVideoReadiness: false,
      isVideoUnit: false,
      currentTdfId: 'tdf-1',
      currentRootTdfId: null,
      currentStimuliSetId: null,
      currentUnitNumber: 0,
      currentUnitName: 'Unit',
      currentContentLanguage: null,
      deliveryParamKeys: [],
    }),
    buildInitializeFailureDiagnostic: (error) => ({
      error,
      currentTdfName: 'Lesson',
      currentTdfId: 'tdf-1',
      currentRootTdfId: null,
      currentStimuliSetId: null,
      currentUnitNumber: 0,
      currentUnitName: 'Unit',
      clusterlist: null,
      stimuliCount: null,
    }),
    setFailureDiagnostic: (stage, diagnostic) => {
      failures.push({ stage, diagnostic: diagnostic as Record<string, unknown> });
    },
    log: (_level, message) => {
      events.push(`log:${message}`);
    },
    routeInitializationFailure: () => {
      events.push('route-failure');
    },
    setLaunchLoadingMessage: (message) => {
      events.push(`message:${message}`);
    },
    loadingContentMessage: 'Loading content...',
    markLaunchLoadingTiming: (name, details) => {
      events.push(`timing:${name}:${JSON.stringify(details || {})}`);
    },
    prepareRender: async () => {
      events.push('prepare-render');
    },
    ...overrides,
  };
  return { deps: base, events, failures };
}

describe('content launch orchestration', function() {
  it('builds initialize failure diagnostics from explicit inputs', function() {
    const error = new Error('boom');

    expect(buildContentInitializeFailureDiagnostic({
      error,
      currentTdfFile: { fileName: 'lesson.tdf' },
      currentTdfId: 'tdf-1',
      currentRootTdfId: undefined,
      currentStimuliSetId: 'stim-set-1',
      currentUnitNumber: 2,
      currentTdfUnit: { unitname: 'Unit 3' },
      currentStimuliSet: [{}, {}],
      sessionSurfaceDiagnostic: { clusterlist: ['cluster'] },
    })).to.deep.equal({
      error,
      currentTdfName: 'lesson.tdf',
      currentTdfId: 'tdf-1',
      currentRootTdfId: null,
      currentStimuliSetId: 'stim-set-1',
      currentUnitNumber: 2,
      currentUnitName: 'Unit 3',
      clusterlist: ['cluster'],
      stimuliCount: 2,
    });
  });

  it('returns redirected without starting readiness wait', async function() {
    let readinessWaited = false;
    const harness = createDeps({
      initializeContent: async () => ({ redirected: true }),
      waitForContentReadiness: async () => {
        readinessWaited = true;
        return true;
      },
    });

    const result = await runContentLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'redirected' });
    expect(readinessWaited).to.equal(false);
    expect(harness.events).to.deep.equal([
      'message:Loading content...',
      'timing:initializeContentSurface:start:{}',
      'timing:initializeContentSurface:complete:{"redirected":true}',
    ]);
  });

  it('records diagnostics and routes when initialization throws', async function() {
    const error = new Error('init failed');
    const harness = createDeps({
      initializeContent: async () => {
        throw error;
      },
    });

    const result = await runContentLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'failed', stage: 'initializeContentSurface' });
    expect(harness.failures).to.have.length(1);
    expect(harness.failures[0]!.stage).to.equal('initializeContentSurface');
    expect(harness.failures[0]!.diagnostic.errorMessage).to.equal('init failed');
    expect(harness.events).to.include('route-failure');
  });

  it('records readiness diagnostics and routes when readiness times out', async function() {
    const harness = createDeps({
      waitForContentReadiness: async () => false,
    });

    const result = await runContentLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'failed', stage: 'contentReadinessTimeout' });
    expect(harness.failures).to.deep.equal([{
      stage: 'contentReadinessTimeout',
      diagnostic: {
        hasCurrentTdfUnit: false,
        hasDeliverySettings: false,
        hasVideoReadiness: false,
        isVideoUnit: false,
        currentTdfId: 'tdf-1',
        currentRootTdfId: null,
        currentStimuliSetId: null,
        currentUnitNumber: 0,
        currentUnitName: 'Unit',
        currentContentLanguage: null,
        deliveryParamKeys: [],
      },
    }]);
    expect(harness.events).to.include('route-failure');
  });

  it('returns ready after successful content, readiness, and render-preparation gates', async function() {
    const harness = createDeps();

    const result = await runContentLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'ready' });
    expect(harness.events).to.include('prepare-render');
  });
});
