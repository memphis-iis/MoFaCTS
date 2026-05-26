export type SessionSurfaceMode = 'autotutor' | 'video' | 'card';

type SessionUnitLike = {
  videosession?: unknown;
  autotutorsession?: unknown;
};

type SessionSurfaceStateInput = {
  deliverySettings?: {
    isVideoSession?: boolean | undefined;
  } | undefined;
  sessionIsVideoSession?: unknown;
  sessionUnitType?: unknown;
  currentTdfUnit?: SessionUnitLike | null | undefined;
};

export type SessionSurfaceState = {
  isAutoTutorSession: boolean;
  isVideoSession: boolean;
  mode: SessionSurfaceMode;
};

export function resolveSessionSurfaceState(input: SessionSurfaceStateInput): SessionSurfaceState {
  const currentTdfUnit = input.currentTdfUnit || {};
  const isAutoTutorSession =
    input.sessionUnitType === 'autotutor' ||
    Boolean(currentTdfUnit.autotutorsession);
  const isVideoSession =
    input.deliverySettings?.isVideoSession === true ||
    input.sessionIsVideoSession === true ||
    Boolean(currentTdfUnit.videosession);

  return {
    isAutoTutorSession,
    isVideoSession,
    mode: isAutoTutorSession ? 'autotutor' : (isVideoSession ? 'video' : 'card'),
  };
}
