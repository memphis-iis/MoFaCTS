import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
  shouldRequireSessionVideoReadiness,
} from './sessionSurfaceMode';

type ContentReadinessDeliverySettings = Record<string, unknown> & {
  isVideoSession?: boolean;
  videoUrl?: unknown;
};

export interface ContentReadinessDependencies {
  readonly getCurrentTdfUnit: () => Record<string, unknown> | null | undefined;
  readonly getDeliverySettings: () => ContentReadinessDeliverySettings | null | undefined;
  readonly getVideoCheckpoints: () => {
    times?: unknown;
    questions?: unknown;
  } | null | undefined;
}

export interface ContentReadinessState {
  readonly hasCurrentTdfUnit: boolean;
  readonly hasDeliverySettings: boolean;
  readonly hasVideoReadiness: boolean;
  readonly isVideoUnit: boolean;
}

export interface ContentReadinessDiagnostic extends ContentReadinessState {
  readonly currentTdfId: unknown;
  readonly currentRootTdfId: unknown;
  readonly currentStimuliSetId: unknown;
  readonly currentUnitNumber: unknown;
  readonly currentUnitName: unknown;
  readonly deliveryParamKeys: string[];
}

export function hasDeliverySettingsReady(deliverySettingsState: unknown): boolean {
  return !!deliverySettingsState &&
    typeof deliverySettingsState === 'object' &&
    Object.keys(deliverySettingsState as Record<string, unknown>).length > 0;
}

function resolveContentReadinessSurface(
  unit: Record<string, unknown> | null | undefined,
) {
  return resolveSessionContentSurface(resolveSessionSurfaceState({
    currentTdfUnit: unit,
  }));
}

export function hasVideoSessionReadiness(
  unit: Record<string, unknown> | null | undefined,
  checkpoints: { times?: unknown; questions?: unknown } | null | undefined,
  deliverySettingsState: ContentReadinessDeliverySettings | null | undefined,
): boolean {
  const contentSurface = resolveContentReadinessSurface(unit);

  if (!shouldRequireSessionVideoReadiness(contentSurface)) {
    return true;
  }

  const times = checkpoints?.times;
  const questions = checkpoints?.questions;
  const hasVideoUrl = typeof deliverySettingsState?.videoUrl === 'string' &&
    deliverySettingsState.videoUrl.trim().length > 0;

  return Array.isArray(times) &&
    times.length > 0 &&
    Array.isArray(questions) &&
    questions.length === times.length &&
    hasVideoUrl;
}

export function getContentReadinessState(deps: ContentReadinessDependencies): ContentReadinessState {
  const currentTdfUnit = deps.getCurrentTdfUnit();
  const deliverySettingsState = deps.getDeliverySettings();
  return {
    hasCurrentTdfUnit: !!currentTdfUnit,
    hasDeliverySettings: hasDeliverySettingsReady(deliverySettingsState),
    hasVideoReadiness: hasVideoSessionReadiness(
      currentTdfUnit,
      deps.getVideoCheckpoints(),
      deliverySettingsState,
    ),
    isVideoUnit: shouldRequireSessionVideoReadiness(resolveContentReadinessSurface(
      currentTdfUnit,
    )),
  };
}

export function hasContentReadiness(deps: ContentReadinessDependencies): boolean {
  const readiness = getContentReadinessState(deps);
  return readiness.hasCurrentTdfUnit &&
    readiness.hasDeliverySettings &&
    readiness.hasVideoReadiness;
}

export async function waitForContentReadiness(
  deps: ContentReadinessDependencies,
  timeoutMs = 4000,
  pollMs = 50,
  now: () => number = Date.now,
  sleep: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<boolean> {
  const start = now();
  while ((now() - start) < timeoutMs) {
    if (hasContentReadiness(deps)) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
}

export function buildContentReadinessDiagnostic(params: {
  readonly readiness: ContentReadinessState;
  readonly currentTdfId: unknown;
  readonly currentRootTdfId: unknown;
  readonly currentStimuliSetId: unknown;
  readonly currentUnitNumber: unknown;
  readonly currentUnitName: unknown;
  readonly deliverySettingsState: ContentReadinessDeliverySettings | null | undefined;
}): ContentReadinessDiagnostic {
  return {
    ...params.readiness,
    currentTdfId: params.currentTdfId ?? null,
    currentRootTdfId: params.currentRootTdfId ?? null,
    currentStimuliSetId: params.currentStimuliSetId ?? null,
    currentUnitNumber: params.currentUnitNumber ?? null,
    currentUnitName: params.currentUnitName ?? null,
    deliveryParamKeys: Object.keys(params.deliverySettingsState || {}),
  };
}
