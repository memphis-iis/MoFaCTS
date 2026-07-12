import type { ContentSurfaceKind } from './contentLaunchCoordinator';

export interface SpecializedSurfaceActivationInput {
  readonly surface: ContentSurfaceKind;
  readonly initializedForRender: boolean;
  readonly sparcContentReady: boolean;
  readonly videoInstructionVisible: boolean;
  readonly videoPlayerReady: boolean;
}

export interface ContentSurfaceAdapter {
  readonly kind: ContentSurfaceKind;
  readonly runtimeOwner: 'shared-machine' | 'surface';
  readonly isInitialRenderReady: (input: SpecializedSurfaceActivationInput) => boolean;
}

const adapters: Record<ContentSurfaceKind, ContentSurfaceAdapter> = {
  flashcard: {
    kind: 'flashcard',
    runtimeOwner: 'shared-machine',
    isInitialRenderReady: () => false,
  },
  assessment: {
    kind: 'assessment',
    runtimeOwner: 'shared-machine',
    isInitialRenderReady: () => false,
  },
  sparc: {
    kind: 'sparc',
    runtimeOwner: 'shared-machine',
    isInitialRenderReady: (input) => input.initializedForRender && input.sparcContentReady,
  },
  video: {
    kind: 'video',
    runtimeOwner: 'shared-machine',
    isInitialRenderReady: (input) => input.initializedForRender &&
      (input.videoInstructionVisible || input.videoPlayerReady),
  },
  autotutor: {
    kind: 'autotutor',
    runtimeOwner: 'surface',
    isInitialRenderReady: (input) => input.initializedForRender,
  },
};

export function getContentSurfaceAdapter(surface: ContentSurfaceKind): ContentSurfaceAdapter {
  return adapters[surface];
}

export function isSpecializedSurfaceReadyToCommit(input: SpecializedSurfaceActivationInput): boolean {
  return getContentSurfaceAdapter(input.surface).isInitialRenderReady(input);
}
