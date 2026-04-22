// Owner: Learning Runtime Team
// Shared contracts for card runtime state and transitions.

export type TrialPhase =
  | 'idle'
  | 'display'
  | 'input'
  | 'feedback'
  | 'timeout'
  | 'complete';

export type FeedbackKind = 'correct' | 'incorrect' | 'timeout' | 'info';

export interface CardTimingState {
  trialStartTimestamp: number;
  trialEndTimestamp: number;
  cardStartTimestamp: number;
  mainCardTimeoutStart?: number;
}

export interface CardAudioFlags {
  ttsWarmedUp: boolean;
  srWarmedUp: boolean;
  audioWarmupInProgress: boolean;
  ttsRequested: boolean;
  audioRecorderInitialized: boolean;
}

export interface CardInteractionState {
  buttonTrial: boolean;
  buttonList: string[];
  displayReady: boolean;
  inputReady: boolean;
  inFeedback: boolean;
  displayFeedback: boolean;
  recording: boolean;
  recordingLocked: boolean;
  submissionLocked: boolean;
  enterKeyLock: boolean;
}

export interface CardScoreState {
  scoringEnabled?: boolean;
  currentScore: number;
  isCorrectAccumulator: boolean;
}

export interface CardRuntimeState {
  phase: TrialPhase;
  feedbackKind?: FeedbackKind;
  userAnswer?: string;
  currentAnswer?: string;
  hiddenItems: string[];
  timing: CardTimingState;
  interaction: CardInteractionState;
  audio: CardAudioFlags;
  score: CardScoreState;
}
