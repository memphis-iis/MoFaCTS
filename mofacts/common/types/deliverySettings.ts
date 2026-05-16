// Owner: Learning Runtime Team
// Shared contracts for setspec/unit delivery setting overlays.

export type FeedbackDisplayMode = boolean | 'onCorrect' | 'onIncorrect';
export type FeedbackLayout = 'inline' | 'stacked';
export type StimuliPosition = 'top' | 'left';

export interface DeliverySettings {
  [key: string]: unknown;
  stimuliPosition?: StimuliPosition;
  isVideoSession?: boolean;
  videoUrl?: string;
  displayCorrectFeedback?: boolean;
  displayIncorrectFeedback?: boolean;
  correctLabelText?: string;
  incorrectLabelText?: string;
  correctColor?: string;
  incorrectColor?: string;
  displayUserAnswerInFeedback?: FeedbackDisplayMode;
  feedbackLayout?: FeedbackLayout;
  displayCorrectAnswerInIncorrectFeedback?: boolean;
  displayPerformance?: boolean;
  displayTimeoutBar?: boolean;
  displayTimeoutCountdown?: boolean;
  choiceButtonCols?: number;
  inputPlaceholderText?: string;
  continueButtonText?: string;
  skipStudyButtonText?: string;
  caseSensitive?: boolean;
  displayQuestionNumber?: boolean;
  allowRevisitUnit?: boolean;
}
