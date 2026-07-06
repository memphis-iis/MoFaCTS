import type {
  CardReadinessDependencies,
  CardReadinessDiagnostic,
} from './cardReadiness';
import type {
  SessionSurfaceDiagnostic,
  SessionSurfaceLaunchCompletion,
} from './sessionSurfaceMode';

type CardInitResult = {
  redirected?: boolean;
} | null | undefined;

type InitializeFailureDiagnosticInput = {
  error: unknown;
  currentTdfFile: { name?: unknown; fileName?: unknown } | null | undefined;
  currentTdfId: unknown;
  currentRootTdfId: unknown;
  currentStimuliSetId: unknown;
  currentUnitNumber: unknown;
  currentTdfUnit: { unitname?: unknown } | null | undefined;
  currentStimuliSet: unknown;
  sessionSurfaceDiagnostic: SessionSurfaceDiagnostic;
};

export type CardInitializeFailureDiagnostic = {
  error: unknown;
  currentTdfName: unknown;
  currentTdfId: unknown;
  currentRootTdfId: unknown;
  currentStimuliSetId: unknown;
  currentUnitNumber: unknown;
  currentUnitName: unknown;
  clusterlist: unknown;
  stimuliCount: number | null;
};

export type CardLaunchFailureStage = 'initializeSvelteCard' | 'cardReadinessTimeout';

export type CardLaunchRunResult =
  | { status: 'redirected' }
  | { status: 'failed'; stage: CardLaunchFailureStage }
  | { status: 'stoppedAfterLaunchCompletion' }
  | { status: 'ready' };

export type CardLaunchOrchestrationDeps = {
  initializeCard: () => Promise<CardInitResult>;
  waitForCardReadiness: (deps: CardReadinessDependencies) => Promise<boolean>;
  getReadinessDependencies: () => CardReadinessDependencies;
  buildReadinessDiagnostic: () => CardReadinessDiagnostic;
  buildInitializeFailureDiagnostic: (error: unknown) => CardInitializeFailureDiagnostic;
  setFailureDiagnostic: (
    stage: CardLaunchFailureStage,
    diagnostic: object
  ) => void;
  log: (level: number, message: string, details?: unknown) => void;
  routeInitializationFailure: () => void;
  setLaunchLoadingMessage: (message: string) => void;
  markLaunchLoadingTiming: (name: string, details?: Record<string, unknown>) => void;
  prepareRender: () => Promise<void>;
  resolveLaunchCompletion: () => SessionSurfaceLaunchCompletion | null;
  waitForBrowserPaint: () => Promise<void>;
  finishLaunchLoading: (reason: SessionSurfaceLaunchCompletion['finishReason']) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string | null {
  return error instanceof Error ? error.stack || null : null;
}

export function buildCardInitializeFailureDiagnostic(
  input: InitializeFailureDiagnosticInput
): CardInitializeFailureDiagnostic {
  return {
    error: input.error,
    currentTdfName: input.currentTdfFile?.name || input.currentTdfFile?.fileName || null,
    currentTdfId: input.currentTdfId || null,
    currentRootTdfId: input.currentRootTdfId || null,
    currentStimuliSetId: input.currentStimuliSetId || null,
    currentUnitNumber: input.currentUnitNumber ?? null,
    currentUnitName: input.currentTdfUnit?.unitname || null,
    clusterlist: input.sessionSurfaceDiagnostic.clusterlist,
    stimuliCount: Array.isArray(input.currentStimuliSet)
      ? input.currentStimuliSet.length
      : null,
  };
}

export async function runCardLaunchOrchestration(
  deps: CardLaunchOrchestrationDeps
): Promise<CardLaunchRunResult> {
  let initResult: CardInitResult;
  try {
    deps.setLaunchLoadingMessage('Loading content...');
    deps.markLaunchLoadingTiming('initializeSvelteCard:start');
    initResult = await deps.initializeCard();
    deps.markLaunchLoadingTiming('initializeSvelteCard:complete', {
      redirected: !!initResult?.redirected,
    });
  } catch (error) {
    const diagnostic = deps.buildInitializeFailureDiagnostic(error);
    deps.setFailureDiagnostic('initializeSvelteCard', {
      ...diagnostic,
      errorMessage: errorMessage(error),
      errorStack: errorStack(error),
    });
    deps.log(1, '[ContentSurface] initializeSvelteCard failed', diagnostic);
    deps.routeInitializationFailure();
    return { status: 'failed', stage: 'initializeSvelteCard' };
  }

  if (initResult?.redirected) {
    return { status: 'redirected' };
  }

  deps.markLaunchLoadingTiming('cardReadinessWait:start');
  const ready = await deps.waitForCardReadiness(deps.getReadinessDependencies());
  deps.markLaunchLoadingTiming('cardReadinessWait:complete', { ready });
  if (!ready) {
    const diagnostic = deps.buildReadinessDiagnostic();
    deps.setFailureDiagnostic('cardReadinessTimeout', diagnostic);
    deps.log(1, '[ContentSurface] Readiness timeout before machine start', diagnostic);
    deps.routeInitializationFailure();
    return { status: 'failed', stage: 'cardReadinessTimeout' };
  }

  await deps.prepareRender();
  const launchCompletion = deps.resolveLaunchCompletion();
  if (launchCompletion) {
    await deps.waitForBrowserPaint();
    deps.markLaunchLoadingTiming(launchCompletion.timingName, launchCompletion.timingData);
    deps.finishLaunchLoading(launchCompletion.finishReason);
    if (launchCompletion.stopInitialization) {
      return { status: 'stoppedAfterLaunchCompletion' };
    }
  }

  return { status: 'ready' };
}
