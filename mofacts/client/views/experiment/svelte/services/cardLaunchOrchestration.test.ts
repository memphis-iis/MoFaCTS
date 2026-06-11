import { expect } from 'chai';
import {
  buildCardInitializeFailureDiagnostic,
  runCardLaunchOrchestration,
  type CardLaunchOrchestrationDeps,
} from './cardLaunchOrchestration';
import type { CardReadinessDependencies } from './cardReadiness';
import type { SessionSurfaceLaunchCompletion } from './sessionSurfaceMode';

function createDeps(overrides: Partial<CardLaunchOrchestrationDeps> = {}) {
  const events: string[] = [];
  const readinessDeps: CardReadinessDependencies = {
    getCurrentTdfUnit: () => ({ unitname: 'Unit' }),
    getDeliverySettings: () => ({ displayQuestionNumber: true }),
    getVideoCheckpoints: () => null,
  };
  const failures: Array<{ stage: string; diagnostic: Record<string, unknown> }> = [];
  const base: CardLaunchOrchestrationDeps = {
    initializeCard: async () => undefined,
    waitForCardReadiness: async () => true,
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
    markLaunchLoadingTiming: (name, details) => {
      events.push(`timing:${name}:${JSON.stringify(details || {})}`);
    },
    prepareRender: async () => {
      events.push('prepare-render');
    },
    resolveLaunchCompletion: () => null,
    waitForBrowserPaint: async () => {
      events.push('paint');
    },
    finishLaunchLoading: (reason) => {
      events.push(`finish:${reason}`);
    },
    ...overrides,
  };
  return { deps: base, events, failures };
}

describe('card launch orchestration', function() {
  it('builds initialize failure diagnostics from explicit inputs', function() {
    const error = new Error('boom');

    expect(buildCardInitializeFailureDiagnostic({
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
      initializeCard: async () => ({ redirected: true }),
      waitForCardReadiness: async () => {
        readinessWaited = true;
        return true;
      },
    });

    const result = await runCardLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'redirected' });
    expect(readinessWaited).to.equal(false);
    expect(harness.events).to.deep.equal([
      'message:Loading content...',
      'timing:initializeSvelteCard:start:{}',
      'timing:initializeSvelteCard:complete:{"redirected":true}',
    ]);
  });

  it('records diagnostics and routes when initialization throws', async function() {
    const error = new Error('init failed');
    const harness = createDeps({
      initializeCard: async () => {
        throw error;
      },
    });

    const result = await runCardLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'failed', stage: 'initializeSvelteCard' });
    expect(harness.failures).to.have.length(1);
    expect(harness.failures[0]!.stage).to.equal('initializeSvelteCard');
    expect(harness.failures[0]!.diagnostic.errorMessage).to.equal('init failed');
    expect(harness.events).to.include('route-failure');
  });

  it('records readiness diagnostics and routes when readiness times out', async function() {
    const harness = createDeps({
      waitForCardReadiness: async () => false,
    });

    const result = await runCardLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'failed', stage: 'cardReadinessTimeout' });
    expect(harness.failures).to.deep.equal([{
      stage: 'cardReadinessTimeout',
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
        deliveryParamKeys: [],
      },
    }]);
    expect(harness.events).to.include('route-failure');
  });

  it('prepares render and stops when launch completion owns initialization', async function() {
    const launchCompletion: SessionSurfaceLaunchCompletion = {
      timingName: 'autoTutorUnit:rendered',
      finishReason: 'autotutor-unit-rendered',
      stopInitialization: true,
    };
    const harness = createDeps({
      resolveLaunchCompletion: () => launchCompletion,
    });

    const result = await runCardLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'stoppedAfterLaunchCompletion' });
    expect(harness.events).to.include('prepare-render');
    expect(harness.events).to.include('paint');
    expect(harness.events).to.include('timing:autoTutorUnit:rendered:{}');
    expect(harness.events).to.include('finish:autotutor-unit-rendered');
  });

  it('returns ready after successful launch gates without a stopping completion', async function() {
    const launchCompletion: SessionSurfaceLaunchCompletion = {
      timingName: 'videoUnit:rendered',
      finishReason: 'video-unit-rendered',
      timingData: { videoPlayerReady: false },
      stopInitialization: false,
    };
    const harness = createDeps({
      resolveLaunchCompletion: () => launchCompletion,
    });

    const result = await runCardLaunchOrchestration(harness.deps);

    expect(result).to.deep.equal({ status: 'ready' });
    expect(harness.events).to.include('finish:video-unit-rendered');
  });
});
