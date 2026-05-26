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

export type SessionContentSurface = {
  mode: SessionSurfaceMode;
  showAutoTutorSession: boolean;
  showVideoSession: boolean;
  showStandardCardSession: boolean;
};

export type SessionSurfaceShell = {
  mode: SessionSurfaceMode;
  isAutoTutorSession: boolean;
  isVideoSession: boolean;
  contentSurface: SessionContentSurface;
  cardScreenClasses: {
    videoMode: boolean;
    autoTutorMode: boolean;
  };
  showLearningProgressPanel: boolean;
};

export type SessionSurfaceLearningProgressPanelState = {
  showPanel: boolean;
  panelOpen: boolean;
  viewportOpen: boolean;
};

export type SessionSurfaceLaunchCompletion = {
  timingName: 'autoTutorUnit:rendered' | 'videoUnit:rendered';
  finishReason: 'autotutor-unit-rendered' | 'video-unit-rendered';
  timingData?: Record<string, unknown>;
  stopInitialization: boolean;
};

type SessionSurfaceLaunchCompletionInput = {
  contentSurface: SessionContentSurface;
  isLaunchLoadingActive: boolean;
  showVideoInstructionOverlay?: boolean;
  videoPlayerReady?: boolean;
};

type SessionSurfaceShellInput = {
  surfaceState: SessionSurfaceState;
  progressPanelDisabled: boolean;
  learningProgressAvailable: boolean;
};

type SessionVideoInstructionOverlayInput = {
  contentSurface: SessionContentSurface;
  instructionText: string;
  instructionsSeen: boolean;
};

type SessionSurfaceLearningProgressPanelInput = {
  shell: SessionSurfaceShell;
  requestedOpen: boolean;
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

export function resolveSessionContentSurface(surfaceState: SessionSurfaceState): SessionContentSurface {
  if (!['autotutor', 'video', 'card'].includes(surfaceState.mode)) {
    throw new Error(`resolveSessionContentSurface received an unknown session surface mode "${String(surfaceState.mode)}"`);
  }

  return {
    mode: surfaceState.mode,
    showAutoTutorSession: surfaceState.mode === 'autotutor',
    showVideoSession: surfaceState.mode === 'video',
    showStandardCardSession: surfaceState.mode === 'card',
  };
}

function assertValidSessionContentSurface(contentSurface: SessionContentSurface, prefix: string): void {
  const activeSurfaceCount = [
    contentSurface.showAutoTutorSession,
    contentSurface.showVideoSession,
    contentSurface.showStandardCardSession,
  ].filter(Boolean).length;
  const modeMatches =
    (contentSurface.mode === 'autotutor' && contentSurface.showAutoTutorSession) ||
    (contentSurface.mode === 'video' && contentSurface.showVideoSession) ||
    (contentSurface.mode === 'card' && contentSurface.showStandardCardSession);

  if (activeSurfaceCount !== 1 || !modeMatches) {
    throw new Error(`${prefix} received an invalid session content surface for mode "${String(contentSurface.mode)}"`);
  }
}

export function resolveSessionSurfaceShell(input: SessionSurfaceShellInput): SessionSurfaceShell {
  const mode = input.surfaceState.mode;
  const contentSurface = resolveSessionContentSurface(input.surfaceState);
  return {
    mode,
    isAutoTutorSession: input.surfaceState.isAutoTutorSession,
    isVideoSession: input.surfaceState.isVideoSession,
    contentSurface,
    cardScreenClasses: {
      videoMode: mode === 'video',
      autoTutorMode: mode === 'autotutor',
    },
    showLearningProgressPanel:
      mode === 'card' &&
      !input.progressPanelDisabled &&
      input.learningProgressAvailable,
  };
}

export function shouldShowSessionVideoInstructionOverlay(
  input: SessionVideoInstructionOverlayInput,
): boolean {
  assertValidSessionContentSurface(input.contentSurface, 'shouldShowSessionVideoInstructionOverlay');

  return input.contentSurface.showVideoSession &&
    input.instructionText.trim().length > 0 &&
    !input.instructionsSeen;
}

export function resolveSessionSurfaceLearningProgressPanel(
  input: SessionSurfaceLearningProgressPanelInput,
): SessionSurfaceLearningProgressPanelState {
  const showPanel = input.shell.showLearningProgressPanel;
  const panelOpen = showPanel && input.requestedOpen;
  return {
    showPanel,
    panelOpen,
    viewportOpen: panelOpen,
  };
}

export function resolveSessionSurfaceLaunchCompletion(
  input: SessionSurfaceLaunchCompletionInput,
): SessionSurfaceLaunchCompletion | null {
  assertValidSessionContentSurface(input.contentSurface, 'resolveSessionSurfaceLaunchCompletion');

  if (!input.isLaunchLoadingActive) {
    return null;
  }

  if (input.contentSurface.showAutoTutorSession) {
    return {
      timingName: 'autoTutorUnit:rendered',
      finishReason: 'autotutor-unit-rendered',
      stopInitialization: true,
    };
  }

  if (input.contentSurface.showVideoSession) {
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
