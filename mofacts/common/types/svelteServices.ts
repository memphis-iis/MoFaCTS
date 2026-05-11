// Owner: Learning Runtime Team
// Shared service contracts for Svelte card initialization/resume flows.

export type UnitType = 'schedule' | 'video' | 'model' | 'instruction-only';

export type VideoCheckpointBehavior = 'none' | 'pause' | 'all' | 'some' | 'adaptive';

export interface RewindCheckpointData {
  checkpointBehavior: VideoCheckpointBehavior;
  rewindCheckpoints: number[];
}

export interface SvelteCardInitResult {
  redirected: boolean;
  redirectTo?: string;
  resumeToQuestion?: boolean;
  moduleCompleted?: boolean;
  isResume?: boolean;
  error?: string;
  engine?: unknown;
}

export interface UnitCompletionEngine {
  unitFinished: () => Promise<boolean>;
}

export interface SpeechRecognitionServiceContext {
  speechHintExclusionList?: string;
}

export interface SpeechRecognitionServiceEvent {
  type: string;
  [key: string]: unknown;
}

export interface SpeechRecognitionInitResult {
  recorder: unknown;
  audioContext: unknown;
  speechEvents: unknown;
}

export interface SpeechRecognitionResult {
  transcript: string;
  phoneticMatch: string | null;
  isCorrect: boolean;
  maxAttemptsReached: boolean;
}

export type SpeechRecognitionServiceSend = (event: SpeechRecognitionServiceEvent) => void;

export type SpeechRecognitionServiceReceive = (
  listener: (event: SpeechRecognitionServiceEvent) => void
) => void;

export type AudioPromptSource = 'question' | 'feedback';

export interface TtsSpeakOptions {
  voice?: string;
  rate?: number;
  volume?: number;
  isQuestion?: boolean;
}

export interface TtsPlaybackEvent {
  text?: string;
  audioSrc?: string;
  questionText?: string;
  questionAudioSrc?: string;
  delayAfterQuestionMs?: number;
  isQuestion?: boolean;
  autoRestartSr?: boolean;
}

export type TtsServiceStatus = 'completed' | 'skipped' | 'error';

export interface TtsServiceResult {
  status: TtsServiceStatus;
  error?: string;
  isCorrect?: boolean;
}

export type VideoCheckpointType = 'question' | 'checkpoint' | 'end';

export interface VideoCheckpoint {
  id?: string;
  time: number;
  type: VideoCheckpointType;
  data?: string | null;
  index?: number;
}

export interface VideoPlayerLike {
  currentTime: number;
  duration: number;
  paused: boolean;
  play: () => void;
  pause: () => void;
  on: (eventName: string, callback: (...args: unknown[]) => void) => void;
  off: (eventName: string) => void;
}

export interface VideoPlayerServiceContext {
  currentDisplay?: {
    videoSrc?: string;
  };
  videoCheckpoints?: string[];
  videoPlayer?: VideoPlayerLike | null;
  videoCurrentTime?: number;
}

export interface VideoPlayerServiceEvent {
  type?: string;
  videoSrc?: string;
  checkpoints?: string[];
  checkpoint?: VideoCheckpoint | null;
  time?: number;
  player?: VideoPlayerLike | null;
  currentTime?: number;
}

export type VideoPlayerServiceSend = (event: Record<string, unknown>) => void;

export type VideoPlayerServiceReceive = (
  listener: (event: VideoPlayerServiceEvent) => void
) => void;

export interface UnitEngineLike {
  unitType?: string;
  unitFinished?: boolean | (() => Promise<boolean>);
  getScheduleCursor?: () => number;
  setScheduleCursor?: (cursor: number) => void;
  cardAnswered?: (isCorrect: boolean, responseTime: number, testType: string) => void;
  advance?: (isCorrect: boolean, responseTime: number) => void;
  next?: () => void;
  calculateIndices?: (options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  prefetchNextCard?: (engineIndices: unknown, experimentState: unknown) => void;
  clearPrefetchedNextCard?: () => void;
  applyPrefetchedNextCard?: (experimentState: unknown) => Promise<boolean>;
  selectNextCard?: (
    engineIndices: unknown,
    experimentState: unknown
  ) => Promise<Record<string, unknown> | void>;
  findCurrentCardInfo?: () => Record<string, unknown>;
  clearLockedNextCard?: (reason?: string) => void;
  clearRuntimeNextCardState?: (reason?: string) => void;
  prepareNextScheduledCard?: () => Promise<Record<string, unknown> | null>;
  commitPreparedScheduledCard?: (selection: Record<string, unknown>) => boolean;
  lockNextCardEarly?: (
    engineIndices: unknown,
    experimentState: unknown,
    options?: Record<string, unknown>
  ) => Promise<Record<string, unknown> | null>;
  peekLockedNextCard?: () => Record<string, unknown> | null;
  applyLockedNextCard?: (experimentState: unknown) => Promise<boolean>;
  commitLockedNextCard?: (experimentState: unknown) => boolean;
  getPreparedNextTrialContent?: () => Record<string, unknown> | null;
  setPreparedNextTrialContent?: (content: Record<string, unknown> | null) => void;
  currentCardRef?: Record<string, unknown> | null;
  lockedNextCardRef?: Record<string, unknown> | null;
  currentCardOwnerToken?: string | null;
  nextTrialContent?: Record<string, unknown> | null;
  currentPreparedState?: Record<string, unknown> | null;
  _lockedNextSelection?: Record<string, unknown> | null;
  buildPreparedCardQuestionAndAnswerGlobals?: (
    clusterIndex: number,
    whichStim: number,
    probFunctionParameters: unknown,
    options?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  applyPreparedCardQuestionAndAnswerGlobals?: (
    preparedState: Record<string, unknown>
  ) => Record<string, unknown>;
  setUpCardQuestionAndAnswerGlobals?: (
    clusterIndex: number,
    whichStim: number,
    probFunctionParameters: unknown
  ) => Promise<Record<string, unknown>>;
  currentIndex?: number;
  totalCards?: number;
}

export interface SelectCardServiceEvent {
  event?: Record<string, unknown>;
  engine?: UnitEngineLike | null;
  clusterIndex?: number;
  questionIndex?: number;
  type?: string;
}

export interface UpdateEngineServiceEvent {
  engine?: UnitEngineLike | null;
  isCorrect?: boolean;
  responseTime?: number;
}

export type EngineServiceStatus = 'updated' | 'skipped' | 'error';

export interface EngineServiceResult {
  status: EngineServiceStatus;
  unitFinished?: boolean;
  error?: string;
}

export interface TrialTimingSummary {
  responseDuration: number;
  startLatency: number;
  endLatency: number;
  feedbackLatency: number;
}

export interface HistoryRecord extends Record<string, unknown> {}

export interface HistoryLoggingContext {
  testType: string;
  isCorrect: boolean;
  timestamps: {
    trialEnd: number;
    trialStart: number;
    firstKeypress: number;
    feedbackStart: number;
    feedbackEnd?: number;
  };
  source?: string;
  userAnswer?: string;
  deliveryParams: Record<string, unknown>;
  wasReportedForRemoval?: boolean;
  engine?: UnitEngineLike | null;
  currentDisplay?: Record<string, unknown>;
  buttonList?: Array<Record<string, unknown>>;
  buttonTrial?: boolean;
  questionIndex?: number;
  alternateDisplayIndex?: number | null;
  reviewEntry?: string;
}

export interface HistoryLoggingEvent {
  engine?: UnitEngineLike | null;
  skipOutcomeHistoryUpdate?: boolean;
}

export type HistoryLoggingStatus = 'logged';

export interface HistoryLoggingResult {
  status: HistoryLoggingStatus;
  record?: HistoryRecord;
}

export type NavigationDestination = string;
