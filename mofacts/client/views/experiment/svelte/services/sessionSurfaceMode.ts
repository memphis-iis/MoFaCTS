export type SessionSurfaceMode = 'video' | 'sparc' | 'flashcard';

type SessionUnitLike = {
  assessmentsession?: unknown;
  learningsession?: unknown;
  sparcsession?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
};

type SessionSurfaceStateInput = {
  currentTdfUnit?: SessionUnitLike | null | undefined;
};

export type SessionSurfaceState = {
  isVideoSession: boolean;
  mode: SessionSurfaceMode;
};

export type SessionContentSurface = {
  mode: SessionSurfaceMode;
  showVideoSession: boolean;
  showSparcSession: boolean;
  showFlashcardSession: boolean;
};

export type SessionSurfaceShell = {
  mode: SessionSurfaceMode;
  isVideoSession: boolean;
  contentSurface: SessionContentSurface;
  contentSurfaceClasses: {
    videoMode: boolean;
  };
  showLearningProgressPanel: boolean;
};

export type SessionSurfaceLearningProgressPanelState = {
  showPanel: boolean;
  panelOpen: boolean;
  viewportOpen: boolean;
};

export type SessionSurfaceUnitEntryRoute = '/content' | '/instructions';

export type SessionSurfaceDiagnostic = {
  clusterlist: unknown;
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
};

export function resolveSessionSurfaceState(input: SessionSurfaceStateInput): SessionSurfaceState {
  const currentTdfUnit = input.currentTdfUnit || {};
  if (Object.prototype.hasOwnProperty.call(currentTdfUnit, 'autotutorsession')) {
    throw new Error('autotutorsession is no longer supported; standalone AutoTutor has been removed');
  }
  const isVideoSession = Boolean(currentTdfUnit.videosession);
  const isSparcSession = Boolean(currentTdfUnit.sparcsession);
  const specializedSessionCount = [isVideoSession, isSparcSession]
    .filter(Boolean).length;

  if (specializedSessionCount > 1) {
    throw new Error('[Content Surface] A unit cannot define more than one specialized session type');
  }

  return {
    isVideoSession,
    mode: isSparcSession ? 'sparc' : (isVideoSession ? 'video' : 'flashcard'),
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
  if (!['video', 'sparc', 'flashcard'].includes(surfaceState.mode)) {
    throw new Error(`resolveSessionContentSurface received an unknown session surface mode "${String(surfaceState.mode)}"`);
  }

  return {
    mode: surfaceState.mode,
    showVideoSession: surfaceState.mode === 'video',
    showSparcSession: surfaceState.mode === 'sparc',
    showFlashcardSession: surfaceState.mode === 'flashcard',
  };
}

function assertValidSessionContentSurface(contentSurface: SessionContentSurface, prefix: string): void {
  const activeSurfaceCount = [
    contentSurface.showVideoSession,
    contentSurface.showSparcSession,
    contentSurface.showFlashcardSession,
  ].filter(Boolean).length;
  const modeMatches =
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
    isVideoSession: input.surfaceState.isVideoSession,
    contentSurface,
    contentSurfaceClasses: {
      videoMode: mode === 'video',
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
    !input.hasUnitImage;
}

export function shouldRequireSessionVideoReadiness(contentSurface: SessionContentSurface): boolean {
  assertValidSessionContentSurface(contentSurface, 'shouldRequireSessionVideoReadiness');

  return contentSurface.showVideoSession;
}

export function resolveSessionSurfaceUnitEntryRoute(
  contentSurface: SessionContentSurface,
): SessionSurfaceUnitEntryRoute {
  assertValidSessionContentSurface(contentSurface, 'resolveSessionSurfaceUnitEntryRoute');

  return contentSurface.showVideoSession || contentSurface.showSparcSession
    ? '/content'
    : '/instructions';
}
