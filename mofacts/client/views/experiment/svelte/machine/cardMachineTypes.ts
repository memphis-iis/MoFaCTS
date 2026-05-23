import { DEFAULT_DELIVERY_SETTINGS, SR_CONFIG } from './constants';
import type { H5PTrialResult } from '../../../../../common/types';

export type DeliverySettings = typeof DEFAULT_DELIVERY_SETTINGS & Record<string, unknown>;
export type PreparedAdvanceMode = 'none' | 'seamless' | 'direct';

export interface CurrentDisplay extends Record<string, unknown> {
  text?: string;
  clozeText?: string;
  audioSrc?: string;
  videoSrc?: string;
  imgSrc?: string;
}

export interface ButtonChoice extends Record<string, unknown> {
  verbalChoice?: string;
  buttonName?: unknown;
  buttonValue?: string;
  isImage?: boolean;
}

export interface EngineIndices extends Record<string, unknown> {
  clusterIndex?: number;
  stimIndex?: number;
  whichStim?: number;
  probabilityEstimate?: unknown;
}

export interface AudioState {
  ttsRequested: boolean;
  recordingLocked: boolean;
  waitingForTranscription: boolean;
  srAttempts: number;
  maxSrAttempts: number;
}

export interface VideoSessionState {
  isActive: boolean;
  checkpoints: unknown[];
  currentCheckpointIndex: number;
  pendingQuestionIndex: number | null;
  ended: boolean;
}

export interface TrialTimestamps {
  trialStart: number;
  trialEnd: number | undefined;
  firstKeypress: number | undefined;
  timeoutStart: number | undefined;
  inputEnabled: number | undefined;
  feedbackStart: number | undefined;
  feedbackEnd: number | undefined;
}

export interface PreparedAdvanceResult extends CardSelectionResult {
  preparedAdvanceMode?: PreparedAdvanceMode;
  preparedSelection?: Record<string, unknown> | null;
}

export interface CardMachineContext {
  currentDisplay: CurrentDisplay;
  questionDisplay: CurrentDisplay | undefined;
  currentAnswer: string;
  originalAnswer: string;
  userAnswer: string;
  feedbackMessage: string;
  feedbackText: string;
  feedbackRevealStarted: boolean;
  feedbackSuppressed: boolean;
  h5pResult: H5PTrialResult | null;
  isCorrect: boolean;
  isTimeout: boolean;
  feedbackTimeoutMs: number | undefined;
  reviewEntry: string;
  buttonTrial: boolean;
  buttonList: ButtonChoice[];
  testType: string;
  deliverySettings: DeliverySettings;
  setspec: Record<string, unknown> | undefined;
  audio: AudioState;
  srGrammarMatch: boolean | null;
  engine: unknown;
  engineIndices: EngineIndices | null;
  sessionId: string;
  unitId: string;
  tdfId: string;
  speechHintExclusionList: string;
  questionIndex: number;
  alternateDisplayIndex: number | null;
  source: string;
  wasReportedForRemoval: boolean;
  timeoutResetCounter: number;
  consecutiveTimeouts: number;
  errorMessage: string | undefined;
  unitFinished: boolean | undefined;
  preparedAdvanceMode: PreparedAdvanceMode;
  preparedTrial: PreparedAdvanceResult | null;
  incomingPreparationComplete: boolean;
  incomingReady: boolean;
  videoSession: VideoSessionState;
  timestamps: TrialTimestamps;
}

export interface CardMachineEvent extends Record<string, unknown> {
  type: string;
  sessionId?: string;
  unitId?: string;
  tdfId?: string;
  source?: string;
  userAnswer?: string;
  timestamp?: number;
  checkpointIndex?: number;
  questionIndex?: number;
  unitFinished?: boolean;
  feedbackText?: string;
  feedbackHtml?: string;
  feedbackSuppressed?: boolean;
  h5pResult?: H5PTrialResult | null;
}

export interface CardSelectionResult extends Record<string, unknown> {
  currentDisplay?: CurrentDisplay;
  currentAnswer?: string;
  originalAnswer?: string;
  buttonTrial?: boolean;
  buttonList?: ButtonChoice[];
  testType?: string;
  deliverySettings?: Partial<DeliverySettings>;
  setspec?: Record<string, unknown>;
  engineIndices?: EngineIndices | null;
  engine?: unknown;
  unitFinished?: boolean;
  questionIndex?: number;
  preparedAdvanceMode?: PreparedAdvanceMode;
  speechHintExclusionList?: string;
}

export interface UpdateEngineResult {
  unitFinished?: boolean;
}

export type MachineArgs = {
  context: CardMachineContext;
  event: CardMachineEvent;
};

export type CardSelectionDoneArgs = {
  context: CardMachineContext;
  event: { output?: CardSelectionResult };
};

export type UpdateEngineDoneArgs = {
  event: { output?: UpdateEngineResult };
};

export type PreparedAdvanceDoneArgs = {
  context: CardMachineContext;
  event: { output?: PreparedAdvanceResult };
};

export const initialContext: CardMachineContext = {
  currentDisplay: {},
  questionDisplay: undefined,
  currentAnswer: '',
  originalAnswer: '',
  userAnswer: '',
  feedbackMessage: '',
  feedbackText: '',
  feedbackRevealStarted: false,
  feedbackSuppressed: false,
  h5pResult: null,
  isCorrect: false,
  isTimeout: false,
  feedbackTimeoutMs: undefined,
  reviewEntry: '',
  buttonTrial: false,
  buttonList: [],
  testType: 'd',
  deliverySettings: DEFAULT_DELIVERY_SETTINGS,
  setspec: {},
  audio: {
    ttsRequested: false,
    recordingLocked: false,
    waitingForTranscription: false,
    srAttempts: 0,
    maxSrAttempts: SR_CONFIG.MAX_ATTEMPTS,
  },
  srGrammarMatch: null,
  engine: null,
  engineIndices: null,
  sessionId: '',
  unitId: '',
  tdfId: '',
  speechHintExclusionList: '',
  questionIndex: 1,
  alternateDisplayIndex: null,
  source: 'keyboard',
  wasReportedForRemoval: false,
  timeoutResetCounter: 0,
  consecutiveTimeouts: 0,
  errorMessage: undefined,
  unitFinished: undefined,
  preparedAdvanceMode: 'none',
  preparedTrial: null,
  incomingPreparationComplete: false,
  incomingReady: false,
  videoSession: {
    isActive: false,
    checkpoints: [],
    currentCheckpointIndex: 0,
    pendingQuestionIndex: null,
    ended: false,
  },
  timestamps: {
    trialStart: 0,
    trialEnd: undefined,
    firstKeypress: undefined,
    timeoutStart: undefined,
    inputEnabled: undefined,
    feedbackStart: undefined,
    feedbackEnd: undefined,
  },
};
