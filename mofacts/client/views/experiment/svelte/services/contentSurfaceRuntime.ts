import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
  shouldShowSessionVideoInstructionOverlay,
  type SessionContentSurface,
  type SessionSurfaceState,
} from './sessionSurfaceMode';

type UnitWithInstructions = {
  unitinstructions?: unknown;
  assessmentsession?: unknown;
  learningsession?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
};

export interface ContentSurfaceRuntimeSnapshot {
  currentTdfUnit: UnitWithInstructions;
  rawVideoInstructionText: string;
  sanitizedVideoInstructionText: string;
  sessionContentSurface: SessionContentSurface;
  sessionSurfaceState: SessionSurfaceState;
  showVideoInstructionOverlay: boolean;
  videoInstructionsSeen: boolean;
}

export function buildContentSurfaceRuntimeSnapshot(params: {
  currentTdfUnit: UnitWithInstructions | null | undefined;
  deliverySettings: { isVideoSession?: boolean | undefined };
  sessionIsVideoSession: unknown;
  sessionUnitType: unknown;
  curUnitInstructionsSeen: unknown;
  videoInstructionDismissed: boolean;
  sanitizeInstructionHtml: (dirty: string) => string;
}): ContentSurfaceRuntimeSnapshot {
  const currentTdfUnit = params.currentTdfUnit || {};
  const sessionSurfaceState = resolveSessionSurfaceState({
    deliverySettings: params.deliverySettings,
    sessionIsVideoSession: params.sessionIsVideoSession,
    sessionUnitType: params.sessionUnitType,
    currentTdfUnit,
  });
  const sessionContentSurface = resolveSessionContentSurface(sessionSurfaceState);
  const rawVideoInstructionText = typeof currentTdfUnit.unitinstructions === 'string'
    ? currentTdfUnit.unitinstructions.trim()
    : '';
  const videoInstructionsSeen = params.curUnitInstructionsSeen === true ||
    params.videoInstructionDismissed;

  return {
    currentTdfUnit,
    rawVideoInstructionText,
    sanitizedVideoInstructionText: params.sanitizeInstructionHtml(rawVideoInstructionText),
    sessionContentSurface,
    sessionSurfaceState,
    showVideoInstructionOverlay: shouldShowSessionVideoInstructionOverlay({
      contentSurface: sessionContentSurface,
      instructionText: rawVideoInstructionText,
      instructionsSeen: videoInstructionsSeen,
    }),
    videoInstructionsSeen,
  };
}

export function startVideoInstructionTimer(params: {
  showVideoInstructionOverlay: boolean;
  videoInstructionsShownAt: number;
  now: () => number;
  setInstructionClientStart: (timestamp: number) => void;
}): number {
  if (!params.showVideoInstructionOverlay || params.videoInstructionsShownAt) {
    return params.videoInstructionsShownAt;
  }
  const shownAt = params.now();
  params.setInstructionClientStart(shownAt);
  return shownAt;
}
