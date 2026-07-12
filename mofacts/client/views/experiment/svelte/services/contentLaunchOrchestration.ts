import type {
  ContentReadinessDependencies,
  ContentReadinessDiagnostic,
} from './contentReadiness';
import type { SessionSurfaceDiagnostic } from './sessionSurfaceMode';

type ContentInitResult = {
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

export type ContentInitializeFailureDiagnostic = {
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

export type ContentLaunchFailureStage = 'initializeContentSurface' | 'contentReadinessTimeout';

export type ContentLaunchRunResult =
  | { status: 'redirected' }
  | { status: 'failed'; stage: ContentLaunchFailureStage }
  | { status: 'ready' };

export type ContentLaunchOrchestrationDeps = {
  initializeContent: () => Promise<ContentInitResult>;
  waitForContentReadiness: (deps: ContentReadinessDependencies) => Promise<boolean>;
  getReadinessDependencies: () => ContentReadinessDependencies;
  buildReadinessDiagnostic: () => ContentReadinessDiagnostic;
  buildInitializeFailureDiagnostic: (error: unknown) => ContentInitializeFailureDiagnostic;
  setFailureDiagnostic: (
    stage: ContentLaunchFailureStage,
    diagnostic: object
  ) => void;
  log: (level: number, message: string, details?: unknown) => void;
  routeInitializationFailure: () => void;
  setLaunchLoadingMessage: (message: string) => void;
  loadingContentMessage: string;
  markLaunchLoadingTiming: (name: string, details?: Record<string, unknown>) => void;
  prepareRender: () => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string | null {
  return error instanceof Error ? error.stack || null : null;
}

export function buildContentInitializeFailureDiagnostic(
  input: InitializeFailureDiagnosticInput
): ContentInitializeFailureDiagnostic {
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

export async function runContentLaunchOrchestration(
  deps: ContentLaunchOrchestrationDeps
): Promise<ContentLaunchRunResult> {
  let initResult: ContentInitResult;
  try {
    deps.setLaunchLoadingMessage(deps.loadingContentMessage);
    deps.markLaunchLoadingTiming('initializeContentSurface:start');
    initResult = await deps.initializeContent();
    deps.markLaunchLoadingTiming('initializeContentSurface:complete', {
      redirected: !!initResult?.redirected,
    });
  } catch (error) {
    const diagnostic = deps.buildInitializeFailureDiagnostic(error);
    deps.setFailureDiagnostic('initializeContentSurface', {
      ...diagnostic,
      errorMessage: errorMessage(error),
      errorStack: errorStack(error),
    });
    deps.log(1, '[ContentSurface] initialization failed', diagnostic);
    deps.routeInitializationFailure();
    return { status: 'failed', stage: 'initializeContentSurface' };
  }

  if (initResult?.redirected) {
    return { status: 'redirected' };
  }

  deps.markLaunchLoadingTiming('contentReadinessWait:start');
  const ready = await deps.waitForContentReadiness(deps.getReadinessDependencies());
  deps.markLaunchLoadingTiming('contentReadinessWait:complete', { ready });
  if (!ready) {
    const diagnostic = deps.buildReadinessDiagnostic();
    deps.setFailureDiagnostic('contentReadinessTimeout', diagnostic);
    deps.log(1, '[ContentSurface] Readiness timeout before machine start', diagnostic);
    deps.routeInitializationFailure();
    return { status: 'failed', stage: 'contentReadinessTimeout' };
  }

  await deps.prepareRender();
  return { status: 'ready' };
}
