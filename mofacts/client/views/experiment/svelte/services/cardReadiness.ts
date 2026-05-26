import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
  shouldRequireSessionVideoReadiness,
} from './sessionSurfaceMode';

type CardReadinessDeliverySettings = Record<string, unknown> & {
  isVideoSession?: boolean;
  videoUrl?: unknown;
};

export interface CardReadinessDependencies {
  readonly getCurrentTdfUnit: () => Record<string, unknown> | null | undefined;
  readonly getDeliverySettings: () => CardReadinessDeliverySettings | null | undefined;
  readonly getVideoCheckpoints: () => {
    times?: unknown;
    questions?: unknown;
  } | null | undefined;
}

export interface CardReadinessState {
  readonly hasCurrentTdfUnit: boolean;
  readonly hasDeliverySettings: boolean;
  readonly hasVideoReadiness: boolean;
  readonly isVideoUnit: boolean;
}

export interface CardReadinessDiagnostic extends CardReadinessState {
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

function resolveCardReadinessContentSurface(
  unit: Record<string, unknown> | null | undefined,
  deliverySettingsState: CardReadinessDeliverySettings | null | undefined,
) {
  return resolveSessionContentSurface(resolveSessionSurfaceState({
    currentTdfUnit: unit,
    deliverySettings: deliverySettingsState ?? undefined,
  }));
}

export function hasVideoSessionReadiness(
  unit: Record<string, unknown> | null | undefined,
  checkpoints: { times?: unknown; questions?: unknown } | null | undefined,
  deliverySettingsState: CardReadinessDeliverySettings | null | undefined,
): boolean {
  const contentSurface = resolveCardReadinessContentSurface(unit, deliverySettingsState);

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

export function getCardReadinessState(deps: CardReadinessDependencies): CardReadinessState {
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
    isVideoUnit: shouldRequireSessionVideoReadiness(resolveCardReadinessContentSurface(
      currentTdfUnit,
      deliverySettingsState,
    )),
  };
}

export function hasCardReadiness(deps: CardReadinessDependencies): boolean {
  const readiness = getCardReadinessState(deps);
  return readiness.hasCurrentTdfUnit &&
    readiness.hasDeliverySettings &&
    readiness.hasVideoReadiness;
}

export async function waitForCardReadiness(
  deps: CardReadinessDependencies,
  timeoutMs = 4000,
  pollMs = 50,
  now: () => number = Date.now,
  sleep: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<boolean> {
  const start = now();
  while ((now() - start) < timeoutMs) {
    if (hasCardReadiness(deps)) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
}

export function buildCardReadinessDiagnostic(params: {
  readonly readiness: CardReadinessState;
  readonly currentTdfId: unknown;
  readonly currentRootTdfId: unknown;
  readonly currentStimuliSetId: unknown;
  readonly currentUnitNumber: unknown;
  readonly currentUnitName: unknown;
  readonly deliverySettingsState: CardReadinessDeliverySettings | null | undefined;
}): CardReadinessDiagnostic {
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
