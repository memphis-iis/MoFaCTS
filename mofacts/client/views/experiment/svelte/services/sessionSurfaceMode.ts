export type SessionSurfaceMode = 'autotutor' | 'video' | 'sparc' | 'flashcard';

type SessionUnitLike = {
  assessmentsession?: unknown;
  learningsession?: unknown;
  sparcsession?: unknown;
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
  showSparcSession: boolean;
  showFlashcardSession: boolean;
};

export type SessionSurfaceShell = {
  mode: SessionSurfaceMode;
  isAutoTutorSession: boolean;
  isVideoSession: boolean;
  contentSurface: SessionContentSurface;
  contentSurfaceClasses: {
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

export type SessionSurfaceUnitEntryRoute = '/card' | '/instructions';

export type SessionSurfaceLaunchCompletion = {
  timingName: 'autoTutorUnit:rendered' | 'videoUnit:rendered';
  finishReason: 'autotutor-unit-rendered' | 'video-unit-rendered';
  timingData?: Record<string, unknown>;
  stopInitialization: boolean;
};

export type SessionSurfaceDiagnostic = {
  clusterlist: unknown;
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

type SessionInlineVideoInstructionInput = {
  contentSurface: SessionContentSurface;
  lockoutMinutes: number;
  hasUnitText: boolean;
  hasUnitImage: boolean;
  hasUnitQuestion: boolean;
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
  const isSparcSession = Boolean(currentTdfUnit.sparcsession);

  return {
    isAutoTutorSession,
    isVideoSession,
    mode: isAutoTutorSession ? 'autotutor' : (isSparcSession ? 'sparc' : (isVideoSession ? 'video' : 'flashcard')),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolveSessionSurfaceDiagnostic(
  currentTdfUnit: SessionUnitLike | null | undefined,
): SessionSurfaceDiagnostic {
  const learningSession = asRecord(currentTdfUnit?.learningsession);
  const videoSession = asRecord(currentTdfUnit?.videosession);
  const assessmentSession = asRecord(currentTdfUnit?.assessmentsession);

  return {
    clusterlist:
      learningSession?.clusterlist ||
      videoSession?.questions ||
      assessmentSession?.clusterlist ||
      null,
  };
}

export function resolveSessionContentSurface(surfaceState: SessionSurfaceState): SessionContentSurface {
  if (!['autotutor', 'video', 'sparc', 'flashcard'].includes(surfaceState.mode)) {
    throw new Error(`resolveSessionContentSurface received an unknown session surface mode "${String(surfaceState.mode)}"`);
  }

  return {
    mode: surfaceState.mode,
    showAutoTutorSession: surfaceState.mode === 'autotutor',
    showVideoSession: surfaceState.mode === 'video',
    showSparcSession: surfaceState.mode === 'sparc',
    showFlashcardSession: surfaceState.mode === 'flashcard',
  };
}

function assertValidSessionContentSurface(contentSurface: SessionContentSurface, prefix: string): void {
  const activeSurfaceCount = [
    contentSurface.showAutoTutorSession,
    contentSurface.showVideoSession,
    contentSurface.showSparcSession,
    contentSurface.showFlashcardSession,
  ].filter(Boolean).length;
  const modeMatches =
    (contentSurface.mode === 'autotutor' && contentSurface.showAutoTutorSession) ||
    (contentSurface.mode === 'video' && contentSurface.showVideoSession) ||
    (contentSurface.mode === 'sparc' && contentSurface.showSparcSession) ||
    (contentSurface.mode === 'flashcard' && contentSurface.showFlashcardSession);

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
    contentSurfaceClasses: {
      videoMode: mode === 'video',
      autoTutorMode: mode === 'autotutor',
    },
    showLearningProgressPanel:
      (mode === 'flashcard' || mode === 'sparc') &&
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

export function shouldInlineSessionVideoInstructions(input: SessionInlineVideoInstructionInput): boolean {
  assertValidSessionContentSurface(input.contentSurface, 'shouldInlineSessionVideoInstructions');

  return input.contentSurface.showVideoSession &&
    input.lockoutMinutes <= 0 &&
    input.hasUnitText &&
    !input.hasUnitImage &&
    !input.hasUnitQuestion;
}

export function shouldRequireSessionVideoReadiness(contentSurface: SessionContentSurface): boolean {
  assertValidSessionContentSurface(contentSurface, 'shouldRequireSessionVideoReadiness');

  return contentSurface.showVideoSession;
}

export function resolveSessionSurfaceUnitEntryRoute(
  contentSurface: SessionContentSurface,
): SessionSurfaceUnitEntryRoute {
  assertValidSessionContentSurface(contentSurface, 'resolveSessionSurfaceUnitEntryRoute');

  return contentSurface.showAutoTutorSession || contentSurface.showVideoSession || contentSurface.showSparcSession
    ? '/card'
    : '/instructions';
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
