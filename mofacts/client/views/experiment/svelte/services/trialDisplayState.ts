export type TrialSubsetKind = 'none' | 'prestimulus' | 'question' | 'feedback' | 'study' | 'forceCorrect';

export interface StateMatcher {
  readonly matches: (path: string) => boolean;
}

export interface TrialDisplayAttribution {
  creatorName?: string;
  sourceName?: string;
  sourceUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
}

export interface TrialDisplayContent {
  text?: string;
  clozeText?: string;
  imgSrc?: string;
  videoSrc?: string;
  audioSrc?: string;
  h5p?: unknown;
  attribution?: TrialDisplayAttribution;
  type?: string;
  schema?: string;
  [key: string]: unknown;
}

export interface TrialSubset {
  readonly kind: TrialSubsetKind;
  readonly display: TrialDisplayContent;
  readonly displayVisible: boolean;
  readonly feedbackVisible: boolean;
  readonly responseVisible: boolean;
  readonly isForceCorrecting: boolean;
  readonly showQuestionNumber: boolean;
  readonly questionNumber: number;
  readonly replayEnabled: boolean;
  readonly showOverlay: boolean;
  readonly showSkipStudyButton: boolean;
}

export function getBaseTrialSubsetKind(params: {
  readonly isFeedbackState: boolean;
  readonly isForceCorrecting: boolean;
  readonly isPrestimulusState: boolean;
  readonly isQuestionState: boolean;
  readonly isStudyState: boolean;
}): TrialSubsetKind {
  if (params.isForceCorrecting) {
    return 'forceCorrect';
  }
  if (params.isStudyState) {
    return 'study';
  }
  if (params.isFeedbackState) {
    return 'feedback';
  }
  if (params.isQuestionState) {
    return params.isPrestimulusState ? 'prestimulus' : 'question';
  }
  return 'none';
}

export function isOutgoingFreezeState(state: StateMatcher): boolean {
  return state.matches('transition.logging') ||
    state.matches('transition.updatingState') ||
    state.matches('transition.trackingPerformance') ||
    state.matches('transition.maybePrepareIncoming') ||
    state.matches('transition.prepareIncoming') ||
    state.matches('transition.seamlessAdvance') ||
    state.matches('transition.directAdvance') ||
    state.matches('transition.fadingOut');
}

export function isPreparedAdvanceWaitState(state: StateMatcher): boolean {
  return state.matches('study') ||
    state.matches('feedback') ||
    state.matches('transition.seamlessAdvance') ||
    state.matches('transition.directAdvance');
}

export function cloneAttribution(attribution: TrialDisplayAttribution | null | undefined): TrialDisplayAttribution | undefined {
  if (!attribution || typeof attribution !== 'object') {
    return undefined;
  }

  const cloned = {
    creatorName: attribution.creatorName || '',
    sourceName: attribution.sourceName || '',
    sourceUrl: attribution.sourceUrl || '',
    licenseName: attribution.licenseName || '',
    licenseUrl: attribution.licenseUrl || '',
  };

  return Object.values(cloned).some(Boolean) ? cloned : undefined;
}

export function cloneDisplay(display: TrialDisplayContent | null | undefined): TrialDisplayContent {
  const cloned: TrialDisplayContent = {
    ...(display ? JSON.parse(JSON.stringify(display)) as TrialDisplayContent : {}),
    text: display?.text || '',
    clozeText: display?.clozeText || '',
    imgSrc: display?.imgSrc || '',
    videoSrc: display?.videoSrc || '',
    audioSrc: display?.audioSrc || '',
  };

  const attribution = cloneAttribution(display?.attribution);
  if (attribution) {
    cloned.attribution = attribution;
  } else {
    delete cloned.attribution;
  }

  return cloned;
}

export function buildTrialSubset(args: {
  readonly kind?: TrialSubsetKind;
  readonly display?: TrialDisplayContent | null;
  readonly displayVisible?: unknown;
  readonly feedbackVisible?: unknown;
  readonly responseVisible?: unknown;
  readonly isForceCorrecting?: unknown;
  readonly showQuestionNumber?: unknown;
  readonly questionNumber?: unknown;
  readonly replayEnabled?: unknown;
  readonly showSkipStudyButton?: unknown;
}): TrialSubset {
  const kind = args.kind || 'none';
  return {
    kind,
    display: cloneDisplay(args.display),
    displayVisible: Boolean(args.displayVisible),
    feedbackVisible: Boolean(args.feedbackVisible),
    responseVisible: Boolean(args.responseVisible),
    isForceCorrecting: Boolean(args.isForceCorrecting),
    showQuestionNumber: Boolean(args.showQuestionNumber),
    questionNumber: Number.isFinite(Number(args.questionNumber)) ? Number(args.questionNumber) : 0,
    replayEnabled: Boolean(args.replayEnabled),
    showOverlay: kind !== 'none',
    showSkipStudyButton: Boolean(args.showSkipStudyButton) && kind === 'study',
  };
}

export function buildTrialSubsetKey(params: {
  readonly context: {
    readonly timestamps?: { trialStart?: unknown };
    readonly videoSession?: { currentCheckpointIndex?: unknown };
    readonly engineIndices?: { clusterIndex?: unknown };
    readonly questionIndex?: unknown;
  };
  readonly isVideoSession: boolean;
  readonly subset: TrialSubset;
}): string {
  if (!params.subset.showOverlay) {
    return 'none';
  }

  const display = params.subset.display;
  const attribution = display.attribution;
  return [
    params.context.timestamps?.trialStart || 0,
    params.isVideoSession ? params.context.videoSession?.currentCheckpointIndex ?? '' : '',
    params.isVideoSession ? params.context.engineIndices?.clusterIndex ?? '' : '',
    params.isVideoSession ? params.context.questionIndex ?? '' : '',
    display.type || '',
    display.schema || '',
    display.text || '',
    display.clozeText || '',
    display.imgSrc || '',
    display.videoSrc || '',
    display.audioSrc || '',
    display.type === 'sparc' ? JSON.stringify(display) : '',
    attribution?.creatorName || '',
    attribution?.sourceName || '',
    attribution?.sourceUrl || '',
    attribution?.licenseName || '',
    attribution?.licenseUrl || '',
  ].join('::');
}
