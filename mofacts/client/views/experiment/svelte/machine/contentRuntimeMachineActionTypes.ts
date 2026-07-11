import { assign as xAssign } from 'xstate';
import type { H5PTrialResult } from '../../../../../common/types';
import type { SparcControllerResult } from '../services/sparcController';

export type PreparedAdvanceMode = 'none' | 'seamless' | 'direct';

export type ActionContext = {
  [key: string]: unknown;
  currentDisplay: { text?: string; clozeText?: string; audioSrc?: string };
  questionDisplay?: unknown;
  currentAnswer: string;
  originalAnswer: string;
  buttonTrial: boolean;
  buttonList: unknown[];
  testType: string;
  deliverySettings: {
    caseSensitive?: boolean;
    accentSensitive?: boolean;
    correctLabelText?: string;
    incorrectLabelText?: string;
  };
  setspec?: unknown;
  engine?: unknown;
  engineIndices?: { clusterIndex?: number; whichStim?: number; stimIndex?: number } | null;
  speechHintExclusionList?: string;
  userAnswer: string;
  reviewEntry?: string;
  isCorrect: boolean;
  isTimeout: boolean;
  feedbackTimeoutMs?: number;
  srGrammarMatch?: boolean | null;
  timeoutResetCounter: number;
  consecutiveTimeouts: number;
  preparedAdvanceMode?: PreparedAdvanceMode;
  preparedTrial?: Record<string, unknown> | null;
  source?: string;
  h5pResult?: H5PTrialResult | null;
  sparcResult?: SparcControllerResult | null;
  sparcNodeValues?: Record<string, unknown>;
  questionIndex: number;
  videoSession?: { isActive?: boolean; currentCheckpointIndex?: number };
  timestamps: {
    trialStart: number;
    trialEnd: number | undefined;
    firstKeypress: number | undefined;
    timeoutStart: number | undefined;
    inputEnabled: number | undefined;
    feedbackStart: number | undefined;
    feedbackEnd: number | undefined;
  };
  audio: {
    srAttempts: number;
    waitingForTranscription: boolean;
    recordingLocked: boolean;
  };
};

export type ActionEventOutput = {
  buttonTrial?: boolean;
  buttonList?: unknown[];
  isCorrect?: boolean;
  matchText?: string;
  sparcNodeValues?: Record<string, unknown>;
};

export type ActionEvent = {
  [key: string]: unknown;
  type?: string;
  source?: string;
  error?: unknown;
  cause?: unknown;
  output?: ActionEventOutput;
  sparcNodeValues?: Record<string, unknown>;
  eventType?: string;
  timestamp?: number;
  userAnswer?: string;
  h5pResult?: H5PTrialResult | null;
  sparcResult?: SparcControllerResult | null;
  transcript?: string;
  isCorrect?: boolean;
  userId?: string;
  attemptId?: string;
  unitId?: number;
  tdfId?: string;
  display?: unknown;
  answer?: string;
  buttonTrial?: boolean;
  buttonList?: unknown[];
  testType?: string;
  deliverySettings?: unknown;
  setspec?: unknown;
  engineIndices?: { clusterIndex?: number; whichStim?: number; stimIndex?: number };
  speechHintExclusionList?: string;
};

export type ActionArgs = {
  context: ActionContext;
  event?: ActionEvent;
  self?: {
    getSnapshot?: () => {
      value?: unknown;
      matches?: (stateValue: string) => boolean;
    };
  };
};

type AssignmentShape = Record<string, (args: ActionArgs) => unknown>;

export const assign = xAssign as unknown as (shape: AssignmentShape) => unknown;
