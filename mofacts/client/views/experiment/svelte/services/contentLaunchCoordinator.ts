import { resolveSessionSurfaceState } from './sessionSurfaceMode';

export type ContentLaunchPhase =
  | 'idle'
  | 'resolving-content'
  | 'restoring-progress'
  | 'initializing-engine'
  | 'preparing-first-trial'
  | 'committing-first-render'
  | 'active'
  | 'failed';

export type ContentSurfaceKind = 'flashcard' | 'assessment' | 'sparc' | 'video' | 'autotutor';

export interface ContentLaunchIdentity {
  readonly userId: string;
  readonly rootTdfId: string;
  readonly activeTdfId: string;
  readonly unitIndex: number;
  readonly attemptId: string;
}

export interface ContentLaunchSnapshot {
  readonly phase: ContentLaunchPhase;
  readonly surface: ContentSurfaceKind | null;
  readonly identity: ContentLaunchIdentity | null;
  readonly failure: unknown;
}

export function canActivateContentInput(phase: ContentLaunchPhase, runtimeInputEnabled: unknown): boolean {
  return phase === 'active' && runtimeInputEnabled === true;
}

export function resolveContentSurfaceKind(
  mode: 'flashcard' | 'sparc' | 'video' | 'autotutor',
  currentTdfUnit: { assessmentsession?: unknown } | null | undefined,
): ContentSurfaceKind {
  return mode === 'flashcard' && currentTdfUnit?.assessmentsession
    ? 'assessment'
    : mode;
}

export function resolveContentLaunchSurfaceKind(params: {
  readonly currentTdfUnit: ({ assessmentsession?: unknown } & Record<string, unknown>) | null | undefined;
}): ContentSurfaceKind {
  const mode = resolveSessionSurfaceState({
    currentTdfUnit: params.currentTdfUnit,
  }).mode;
  return resolveContentSurfaceKind(mode, params.currentTdfUnit);
}

type ContentLaunchListener = (snapshot: ContentLaunchSnapshot) => void;

const NEXT_PHASE: Partial<Record<ContentLaunchPhase, ContentLaunchPhase>> = {
  'idle': 'resolving-content',
  'resolving-content': 'restoring-progress',
  'restoring-progress': 'initializing-engine',
  'initializing-engine': 'preparing-first-trial',
  'preparing-first-trial': 'committing-first-render',
  'committing-first-render': 'active',
};

function requiredString(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`[Content Launch] ${field} is required`);
  }
  return normalized;
}

function normalizeIdentity(identity: ContentLaunchIdentity): ContentLaunchIdentity {
  if (!Number.isInteger(identity.unitIndex) || identity.unitIndex < 0) {
    throw new Error('[Content Launch] unitIndex must be a non-negative integer');
  }
  return {
    userId: requiredString(identity.userId, 'userId'),
    rootTdfId: requiredString(identity.rootTdfId, 'rootTdfId'),
    activeTdfId: requiredString(identity.activeTdfId, 'activeTdfId'),
    unitIndex: identity.unitIndex,
    attemptId: requiredString(identity.attemptId, 'attemptId'),
  };
}

export function createContentLaunchCoordinator() {
  let snapshot: ContentLaunchSnapshot = {
    phase: 'idle',
    surface: null,
    identity: null,
    failure: null,
  };
  const listeners = new Set<ContentLaunchListener>();

  function publish(): void {
    const current = { ...snapshot };
    for (const listener of listeners) {
      listener(current);
    }
  }

  function transition(expected: ContentLaunchPhase, next: ContentLaunchPhase): void {
    if (snapshot.phase !== expected || NEXT_PHASE[expected] !== next) {
      throw new Error(`[Content Launch] Invalid phase transition ${snapshot.phase} -> ${next}`);
    }
    snapshot = { ...snapshot, phase: next };
    publish();
  }

  return {
    begin(): void {
      if (snapshot.phase !== 'idle' && snapshot.phase !== 'failed') {
        throw new Error(`[Content Launch] Cannot begin from ${snapshot.phase}`);
      }
      snapshot = {
        phase: 'resolving-content',
        surface: null,
        identity: null,
        failure: null,
      };
      publish();
    },
    markProgressRestoring(surface: ContentSurfaceKind, identity: ContentLaunchIdentity): void {
      if (snapshot.phase !== 'resolving-content') {
        throw new Error(`[Content Launch] Cannot establish identity during ${snapshot.phase}`);
      }
      snapshot = { ...snapshot, surface, identity: normalizeIdentity(identity) };
      transition('resolving-content', 'restoring-progress');
    },
    markEngineInitializing(): void {
      transition('restoring-progress', 'initializing-engine');
    },
    markFirstTrialPreparing(): void {
      transition('initializing-engine', 'preparing-first-trial');
    },
    markFirstRenderCommitting(): void {
      transition('preparing-first-trial', 'committing-first-render');
    },
    markInitialRenderVisible(): void {
      transition('committing-first-render', 'active');
    },
    fail(error: unknown): void {
      if (snapshot.phase === 'active') {
        throw new Error('[Content Launch] Active content cannot transition back to launch failure');
      }
      snapshot = { ...snapshot, phase: 'failed', failure: error };
      publish();
    },
    getSnapshot(): ContentLaunchSnapshot {
      return { ...snapshot };
    },
    subscribe(listener: ContentLaunchListener): () => void {
      listeners.add(listener);
      listener({ ...snapshot });
      return () => listeners.delete(listener);
    },
  };
}
