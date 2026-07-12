import { expect } from 'chai';
import { createContentLaunchEnvironment } from './contentLaunchEnvironment';

function createHarness(overrides: {
  user?: { loginParams?: { loginMode?: string } } | null;
  loginMode?: string;
  deliverySettings?: Record<string, unknown>;
} = {}) {
  const session = new Map<string, unknown>([
    ['currentTdfUnit', { unitname: 'Unit A', type: 'learningSession' }],
    ['currentTdfFile', { fileName: 'lesson-a.tdf' }],
    ['currentTdfId', 'tdf-a'],
    ['currentRootTdfId', 'root-a'],
    ['currentStimuliSetId', 'stimuli-a'],
    ['currentUnitNumber', 2],
    ['currentStimuliSet', [{ id: 'stim-a' }, { id: 'stim-b' }]],
    ['loginMode', overrides.loginMode ?? 'user'],
  ]);
  const routes: string[] = [];
  const finishReasons: string[] = [];
  const environment = createContentLaunchEnvironment({
    getSessionValue: (key) => session.get(key),
    setSessionValue: (key, value) => {
      session.set(key, value);
    },
    getDeliverySettings: () => overrides.deliverySettings ?? { stimuliPosition: 'left' },
    getVideoCheckpoints: () => ({ times: [], questions: [] }),
    getUser: () => overrides.user ?? { loginParams: { loginMode: 'user' } },
    routeTo: (path) => {
      routes.push(path);
    },
    finishLaunchLoading: (reason) => {
      finishReasons.push(reason);
    },
    now: () => 12345,
  });

  return {
    environment,
    finishReasons,
    routes,
    session,
  };
}

describe('card launch environment', function() {
  it('builds readiness dependencies and diagnostics from the current session state', function() {
    const harness = createHarness();

    const deps = harness.environment.getReadinessDependencies();
    const diagnostic = harness.environment.buildReadinessDiagnostic();

    expect(deps.getCurrentTdfUnit()).to.deep.include({ unitname: 'Unit A' });
    expect(deps.getDeliverySettings()).to.deep.equal({ stimuliPosition: 'left' });
    expect(diagnostic).to.deep.include({
      hasCurrentTdfUnit: true,
      hasDeliverySettings: true,
      hasVideoReadiness: true,
      currentTdfId: 'tdf-a',
      currentRootTdfId: 'root-a',
      currentStimuliSetId: 'stimuli-a',
      currentUnitNumber: 2,
      currentUnitName: 'Unit A',
    });
    expect(diagnostic.deliveryParamKeys).to.deep.equal(['stimuliPosition']);
  });

  it('builds initialization failure diagnostics from launch session state', function() {
    const error = new Error('launch failed');
    const harness = createHarness();

    const diagnostic = harness.environment.buildInitializeFailureDiagnostic(error);

    expect(diagnostic).to.deep.include({
      error,
      currentTdfName: 'lesson-a.tdf',
      currentTdfId: 'tdf-a',
      currentRootTdfId: 'root-a',
      currentStimuliSetId: 'stimuli-a',
      currentUnitNumber: 2,
      currentUnitName: 'Unit A',
      stimuliCount: 2,
    });
  });

  it('stores timestamped failure diagnostics', function() {
    const harness = createHarness();

    harness.environment.setFailureDiagnostic('contentReadinessTimeout', { ready: false });

    expect(harness.session.get('contentInitFailureDiagnostic')).to.deep.equal({
      stage: 'contentReadinessTimeout',
      capturedAt: 12345,
      ready: false,
    });
  });

  it('routes experiment participants to the experiment error surface', function() {
    const harness = createHarness({ user: { loginParams: { loginMode: 'experiment' } } });

    harness.environment.routeInitializationFailure();

    expect(harness.finishReasons).to.deep.equal(['content-initialization-failed']);
    expect(harness.routes).to.deep.equal(['/experimentError']);
    expect(harness.session.get('experimentError')).to.deep.include({
      title: 'Experiment paused',
    });
    expect(harness.session.get('suppressAuthenticatedChrome')).to.equal(true);
  });

  it('routes non-experiment users home with an inline message', function() {
    const harness = createHarness();

    harness.environment.routeInitializationFailure();

    expect(harness.routes).to.deep.equal(['/home']);
    expect(harness.session.get('uiMessage')).to.deep.include({
      variant: 'danger',
    });
  });
});
