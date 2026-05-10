// Owner: Learning Runtime Team
// Shared contracts for setspec/unit UI setting overlays.

export type FeedbackDisplayMode = boolean | 'onCorrect' | 'onIncorrect';
export type StimuliPosition = 'top' | 'left';

export interface UiSettings {
  stimuliPosition?: StimuliPosition;
  isVideoSession?: boolean;
  videoUrl?: string;
  displayCorrectFeedback?: boolean;
  displayIncorrectFeedback?: boolean;
  correctMessage?: string;
  incorrectMessage?: string;
  correctColor?: string;
  incorrectColor?: string;
  displayUserAnswerInFeedback?: FeedbackDisplayMode;
  singleLineFeedback?: boolean;
  onlyShowSimpleFeedback?: FeedbackDisplayMode;
  displayCorrectAnswerInIncorrectFeedback?: boolean;
  displayPerformance?: boolean;
  displayTimeoutBar?: boolean;
  choiceButtonCols?: number;
  displaySubmitButton?: boolean;
  inputPlaceholderText?: string;
  displayConfirmButton?: boolean;
  continueButtonText?: string;
  skipStudyButtonText?: string;
  caseSensitive?: boolean;
  displayQuestionNumber?: boolean;
}
