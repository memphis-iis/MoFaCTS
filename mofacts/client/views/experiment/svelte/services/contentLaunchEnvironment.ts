import {
  buildContentReadinessDiagnostic,
  getContentReadinessState,
  type ContentReadinessDependencies,
  type ContentReadinessDiagnostic,
} from './contentReadiness';
import { routeContentInitializationFailure } from './contentLaunchFailure';
import {
  buildContentInitializeFailureDiagnostic,
  type ContentInitializeFailureDiagnostic,
  type ContentLaunchFailureStage,
} from './contentLaunchOrchestration';
import { resolveSessionSurfaceDiagnostic } from './sessionSurfaceMode';

export type ContentLaunchEnvironment = {
  getReadinessDependencies: () => ContentReadinessDependencies;
  buildReadinessDiagnostic: () => ContentReadinessDiagnostic;
  buildInitializeFailureDiagnostic: (error: unknown) => ContentInitializeFailureDiagnostic;
  setFailureDiagnostic: (stage: ContentLaunchFailureStage, diagnostic: object) => void;
  routeInitializationFailure: () => void;
};

type LaunchSessionUnit = Record<string, unknown> & {
  assessmentsession?: unknown;
  learningsession?: unknown;
  unitname?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
};

export function createContentLaunchEnvironment({
  getSessionValue,
  setSessionValue,
  getDeliverySettings,
  getVideoCheckpoints,
  getUser,
  routeTo,
  finishLaunchLoading,
  now,
}: {
  getSessionValue: (key: string) => unknown;
  setSessionValue: (key: string, value: unknown) => void;
  getDeliverySettings: () => Record<string, unknown> | null | undefined;
  getVideoCheckpoints: () => { times?: unknown; questions?: unknown } | null | undefined;
  getUser: () => { loginParams?: { loginMode?: string } } | null | undefined;
  routeTo: (path: '/experimentError' | '/home') => void;
  finishLaunchLoading: (reason: 'content-initialization-failed') => void;
  now: () => number;
}): ContentLaunchEnvironment {
  function getReadinessDependencies(): ContentReadinessDependencies {
    return {
      getCurrentTdfUnit: () => getSessionValue('currentTdfUnit') as Record<string, unknown> | null | undefined,
      getDeliverySettings,
      getVideoCheckpoints,
    };
  }

  function buildReadinessDiagnostic(): ContentReadinessDiagnostic {
    const unit = getSessionValue('currentTdfUnit') as LaunchSessionUnit | null | undefined;
    const deliverySettingsState = getDeliverySettings();
    return buildContentReadinessDiagnostic({
      readiness: getContentReadinessState(getReadinessDependencies()),
      currentTdfId: getSessionValue('currentTdfId') || null,
      currentRootTdfId: getSessionValue('currentRootTdfId') || null,
      currentStimuliSetId: getSessionValue('currentStimuliSetId') || null,
      currentUnitNumber: getSessionValue('currentUnitNumber') ?? null,
      currentUnitName: unit?.unitname || null,
      deliverySettingsState,
    });
  }

  function buildInitializeFailureDiagnostic(error: unknown): ContentInitializeFailureDiagnostic {
    const currentTdfUnit = getSessionValue('currentTdfUnit') as LaunchSessionUnit | null | undefined;
    return buildContentInitializeFailureDiagnostic({
      error,
      currentTdfFile: getSessionValue('currentTdfFile') as { name?: unknown; fileName?: unknown } | null | undefined,
      currentTdfId: getSessionValue('currentTdfId'),
      currentRootTdfId: getSessionValue('currentRootTdfId'),
      currentStimuliSetId: getSessionValue('currentStimuliSetId'),
      currentUnitNumber: getSessionValue('currentUnitNumber'),
      currentTdfUnit,
      currentStimuliSet: getSessionValue('currentStimuliSet'),
      sessionSurfaceDiagnostic: resolveSessionSurfaceDiagnostic(currentTdfUnit),
    });
  }

  function setFailureDiagnostic(stage: ContentLaunchFailureStage, diagnostic: object): void {
    setSessionValue('contentInitFailureDiagnostic', {
      stage,
      capturedAt: now(),
      ...diagnostic,
    });
  }

  function routeInitializationFailure(): void {
    routeContentInitializationFailure({
      finishLaunchLoading,
      getLoginMode: () => getSessionValue('loginMode'),
      getUser,
      routeTo,
      setSessionValue,
    });
  }

  return {
    getReadinessDependencies,
    buildReadinessDiagnostic,
    buildInitializeFailureDiagnostic,
    setFailureDiagnostic,
    routeInitializationFailure,
  };
}
