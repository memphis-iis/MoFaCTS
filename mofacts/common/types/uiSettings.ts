// Owner: Learning Runtime Team
// Shared contracts for setspec/unit UI setting overlays.

export type TimeoutDisplayMode = 'both' | 'bar' | 'text' | 'false';
export type StimuliPosition = 'overunder' | 'split';

export interface UiSettings {
  displayCardTimeoutAsBarOrText?: TimeoutDisplayMode;
  displayReadyPromptTimeoutAsBarOrText?: TimeoutDisplayMode;
  displayReviewTimeoutAsBarOrText?: TimeoutDisplayMode;
  displayTimeOutDuringStudy?: boolean;
  displayPerformanceDuringStudy?: boolean;
  displayPerformanceDuringTrial?: boolean;
  stimuliPosition?: StimuliPosition;
  choiceButtonCols?: number;
  showStimuliBox?: boolean;
  stimuliBoxColor?: string;
  inputPlaceholderText?: string;
  displayConfirmButton?: boolean;
  continueButtonText?: string;
  skipStudyButtonText?: string;
  instructionsTitleDisplay?: string;
  lastVideoModalText?: string;
  displayUserAnswerInFeedback?: boolean;
  displayCorrectAnswerInCenter?: boolean;
  singleLineFeedback?: boolean;
  feedbackDisplayPosition?: string;
  onlyShowSimpleFeedback?: boolean;
  suppressFeedbackDisplay?: boolean;
  incorrectColor?: string;
  correctColor?: string;
  experimentLoginText?: string;
}
