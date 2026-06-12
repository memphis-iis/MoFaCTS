import {
  buildCardReadinessDiagnostic,
  getCardReadinessState,
  type CardReadinessDependencies,
  type CardReadinessDiagnostic,
} from './cardReadiness';
import { routeCardInitializationFailure } from './cardLaunchFailure';
import {
  buildCardInitializeFailureDiagnostic,
  type CardInitializeFailureDiagnostic,
  type CardLaunchFailureStage,
} from './cardLaunchOrchestration';
import { resolveSessionSurfaceDiagnostic } from './sessionSurfaceMode';

export type CardLaunchEnvironment = {
  getReadinessDependencies: () => CardReadinessDependencies;
  buildReadinessDiagnostic: () => CardReadinessDiagnostic;
  buildInitializeFailureDiagnostic: (error: unknown) => CardInitializeFailureDiagnostic;
  setFailureDiagnostic: (stage: CardLaunchFailureStage, diagnostic: object) => void;
  routeInitializationFailure: () => void;
};

type LaunchSessionUnit = Record<string, unknown> & {
  assessmentsession?: unknown;
  learningsession?: unknown;
  unitname?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
};

export function createCardLaunchEnvironment({
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
  finishLaunchLoading: (reason: 'card-initialization-failed') => void;
  now: () => number;
}): CardLaunchEnvironment {
  function getReadinessDependencies(): CardReadinessDependencies {
    return {
      getCurrentTdfUnit: () => getSessionValue('currentTdfUnit') as Record<string, unknown> | null | undefined,
      getDeliverySettings,
      getVideoCheckpoints,
    };
  }

  function buildReadinessDiagnostic(): CardReadinessDiagnostic {
    const unit = getSessionValue('currentTdfUnit') as LaunchSessionUnit | null | undefined;
    const deliverySettingsState = getDeliverySettings();
    return buildCardReadinessDiagnostic({
      readiness: getCardReadinessState(getReadinessDependencies()),
      currentTdfId: getSessionValue('currentTdfId') || null,
      currentRootTdfId: getSessionValue('currentRootTdfId') || null,
      currentStimuliSetId: getSessionValue('currentStimuliSetId') || null,
      currentUnitNumber: getSessionValue('currentUnitNumber') ?? null,
      currentUnitName: unit?.unitname || null,
      deliverySettingsState,
    });
  }

  function buildInitializeFailureDiagnostic(error: unknown): CardInitializeFailureDiagnostic {
    const currentTdfUnit = getSessionValue('currentTdfUnit') as LaunchSessionUnit | null | undefined;
    return buildCardInitializeFailureDiagnostic({
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

  function setFailureDiagnostic(stage: CardLaunchFailureStage, diagnostic: object): void {
    setSessionValue('cardInitFailureDiagnostic', {
      stage,
      capturedAt: now(),
      ...diagnostic,
    });
  }

  function routeInitializationFailure(): void {
    routeCardInitializationFailure({
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
