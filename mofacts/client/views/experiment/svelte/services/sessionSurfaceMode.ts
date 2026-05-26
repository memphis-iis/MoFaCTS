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

export type SessionSurfaceLaunchCompletion = {
  timingName: 'autoTutorUnit:rendered' | 'videoUnit:rendered';
  finishReason: 'autotutor-unit-rendered' | 'video-unit-rendered';
  timingData?: Record<string, unknown>;
  stopInitialization: boolean;
};

type SessionSurfaceLaunchCompletionInput = {
  surfaceState: SessionSurfaceState;
  isLaunchLoadingActive: boolean;
  showVideoInstructionOverlay?: boolean;
  videoPlayerReady?: boolean;
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

export function resolveSessionSurfaceLaunchCompletion(
  input: SessionSurfaceLaunchCompletionInput,
): SessionSurfaceLaunchCompletion | null {
  if (!input.isLaunchLoadingActive) {
    return null;
  }

  if (input.surfaceState.mode === 'autotutor') {
    return {
      timingName: 'autoTutorUnit:rendered',
      finishReason: 'autotutor-unit-rendered',
      stopInitialization: true,
    };
  }

  if (input.surfaceState.mode === 'video') {
    return {
      timingName: 'videoUnit:rendered',
      finishReason: 'video-unit-rendered',
      timingData: {
        showVideoInstructionOverlay: input.showVideoInstructionOverlay === true,
        videoPlayerReady: input.videoPlayerReady === true,
      },
      stopInitialization: false,
    };
  }

  return null;
}
