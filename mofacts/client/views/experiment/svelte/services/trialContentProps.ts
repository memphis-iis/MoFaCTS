import {
  buildTrialSubset,
  type TrialSubset,
  type TrialDisplayContent,
} from './trialDisplayState';

export interface TrialContentButton {
  readonly buttonName?: string;
  readonly buttonValue?: string;
  readonly isImage?: boolean;
  readonly verbalChoice?: string;
  [key: string]: unknown;
}

export interface TrialContentDeliverySettings {
  readonly choiceButtonCols?: unknown;
  readonly correctColor?: unknown;
  readonly correctLabelText?: unknown;
  readonly displayCorrectAnswerInIncorrectFeedback?: unknown;
  readonly displayCorrectFeedback?: unknown;
  readonly displayIncorrectFeedback?: unknown;
  readonly displayQuestionNumber?: unknown;
  readonly displayUserAnswerInFeedback?: unknown;
  readonly feedbackLayout?: unknown;
  readonly forceCorrectPrompt?: unknown;
  readonly incorrectColor?: unknown;
  readonly incorrectLabelText?: unknown;
  readonly inputPlaceholderText?: unknown;
  readonly skipstudy?: unknown;
}

export interface TrialContentSlotState {
  readonly correctColor?: unknown;
  readonly displayCorrectFeedback?: unknown;
  readonly displayVisible?: unknown;
  readonly displayIncorrectFeedback?: unknown;
  readonly feedbackMessage?: unknown;
  readonly feedbackUserAnswer?: unknown;
  readonly feedbackVisible?: unknown;
  readonly inputEnabled?: unknown;
  readonly inputMode?: unknown;
  readonly isCorrect?: unknown;
  readonly isForceCorrecting?: unknown;
  readonly isTimeout?: unknown;
  readonly kind?: Parameters<typeof buildTrialSubset>[0]['kind'];
  readonly questionNumber?: unknown;
  readonly replayEnabled?: unknown;
  readonly responseVisible?: unknown;
  readonly showQuestionNumber?: unknown;
  readonly showSkipStudyButton?: unknown;
  readonly srAttempt?: unknown;
  readonly srMaxAttempts?: unknown;
  readonly srStatus?: unknown;
  readonly sparcNodeValues?: unknown;
  readonly userAnswer?: unknown;
}

export interface TrialLikeForContentProps {
  readonly buttonList?: unknown;
  readonly currentAnswer?: unknown;
  readonly currentDisplay?: TrialDisplayContent | null;
  readonly originalAnswer?: unknown;
}

export interface TrialContentPropsBuilderInput {
  readonly defaultInputMode: string;
  readonly deliverySettings: TrialContentDeliverySettings;
  readonly formatAnswerText: (answer: string) => string;
  readonly layoutMode: unknown;
  readonly slotState?: TrialContentSlotState;
  readonly trialLike: TrialLikeForContentProps | null | undefined;
}

export interface TrialContentPropsBuildResult {
  readonly correctAnswerImageSrc: string;
  readonly expectedFeedbackBlockerSrc: string;
  readonly expectedStimulusBlockerSrc: string;
  readonly props: Record<string, unknown>;
  readonly subset: TrialSubset;
}

export interface TrialContentPropsFromSubsetInput {
  readonly buttonList: unknown;
  readonly correctAnswer: unknown;
  readonly correctAnswerImageSrc: unknown;
  readonly correctColor: unknown;
  readonly defaultInputMode: string;
  readonly deliverySettings: TrialContentDeliverySettings;
  readonly displayCorrectFeedback: unknown;
  readonly displayIncorrectFeedback: unknown;
  readonly feedbackMessage: unknown;
  readonly feedbackUserAnswer: unknown;
  readonly inputEnabled: unknown;
  readonly isCorrect: unknown;
  readonly isTimeout: unknown;
  readonly layoutMode: unknown;
  readonly srAttempt: unknown;
  readonly srMaxAttempts: unknown;
  readonly srStatus: unknown;
  readonly sparcNodeValues?: unknown;
  readonly subset: TrialSubset;
  readonly userAnswer: unknown;
}

function stringOrEmpty(value: unknown): string {
  return value == null ? '' : String(value);
}

export function getCorrectAnswerImageSrc(
  buttonList: unknown,
  correctAnswer: unknown,
): string {
  if (!Array.isArray(buttonList) || !correctAnswer) {
    return '';
  }

  const expected = String(correctAnswer);
  const match = buttonList.find((button: unknown) => {
    const candidate = button as TrialContentButton | null | undefined;
    return candidate &&
      candidate.isImage &&
      (
        candidate.buttonValue === expected ||
        candidate.buttonName === expected ||
        candidate.verbalChoice === expected
      );
  }) as TrialContentButton | undefined;

  return match?.buttonName || '';
}

export function buildTrialContentProps(
  input: TrialContentPropsBuilderInput,
): TrialContentPropsBuildResult {
  const trial = input.trialLike || {};
  const slotState = input.slotState || {};
  const subset = buildTrialSubset({
    kind: slotState.kind || 'none',
    display: trial.currentDisplay ?? null,
    displayVisible: slotState.displayVisible,
    feedbackVisible: slotState.feedbackVisible,
    responseVisible: slotState.responseVisible,
    isForceCorrecting: slotState.isForceCorrecting,
    showQuestionNumber: slotState.showQuestionNumber,
    questionNumber: slotState.questionNumber,
    replayEnabled: slotState.replayEnabled,
    showSkipStudyButton: slotState.showSkipStudyButton,
  });
  const buttonList = Array.isArray(trial.buttonList) ? trial.buttonList : [];
  const fallbackAnswer = stringOrEmpty(trial.currentAnswer);
  const correctAnswer = input.formatAnswerText(
    stringOrEmpty(trial.originalAnswer || trial.currentAnswer),
  ) || fallbackAnswer;
  const feedbackIsCorrect = Boolean(slotState.isCorrect);
  const correctAnswerImageSrc = getCorrectAnswerImageSrc(buttonList, correctAnswer);

  return buildTrialContentPropsFromSubset({
    buttonList,
    correctAnswer,
    correctAnswerImageSrc,
    correctColor: slotState.correctColor || input.deliverySettings.correctColor,
    defaultInputMode: String(slotState.inputMode || input.defaultInputMode),
    deliverySettings: input.deliverySettings,
    displayCorrectFeedback: slotState.displayCorrectFeedback,
    displayIncorrectFeedback: slotState.displayIncorrectFeedback,
    feedbackMessage: slotState.feedbackMessage || '',
    feedbackUserAnswer: slotState.feedbackUserAnswer || '',
    inputEnabled: slotState.inputEnabled,
    isCorrect: feedbackIsCorrect,
    isTimeout: slotState.isTimeout,
    layoutMode: input.layoutMode,
    srAttempt: slotState.srAttempt,
    srMaxAttempts: slotState.srMaxAttempts,
    srStatus: slotState.srStatus || 'idle',
    sparcNodeValues: slotState.sparcNodeValues,
    subset,
    userAnswer: slotState.userAnswer || '',
  });
}

export function buildTrialContentPropsFromSubset(
  input: TrialContentPropsFromSubsetInput,
): TrialContentPropsBuildResult {
  const buttonList = Array.isArray(input.buttonList) ? input.buttonList : [];
  const feedbackIsCorrect = Boolean(input.isCorrect);
  const correctAnswerImageSrc = stringOrEmpty(input.correctAnswerImageSrc);

  return {
    subset: input.subset,
    correctAnswerImageSrc,
    expectedStimulusBlockerSrc: String(input.subset.display?.imgSrc || ''),
    expectedFeedbackBlockerSrc: input.subset.feedbackVisible && !feedbackIsCorrect
      ? String(correctAnswerImageSrc || '')
      : '',
    props: {
      layoutMode: input.layoutMode,
      subsetKind: input.subset.kind,
      displayVisible: input.subset.displayVisible,
      display: input.subset.display,
      isForceCorrecting: input.subset.isForceCorrecting,
      showQuestionNumber: input.subset.showQuestionNumber,
      questionNumber: input.subset.questionNumber,
      inputMode: input.defaultInputMode,
      inputEnabled: Boolean(input.inputEnabled),
      responseVisible: input.subset.responseVisible,
      userAnswer: input.userAnswer || '',
      feedbackUserAnswer: input.feedbackUserAnswer || '',
      inputPlaceholder: input.deliverySettings.inputPlaceholderText,
      showButtons: true,
      buttonList,
      buttonColumns: input.deliverySettings.choiceButtonCols,
      srStatus: input.srStatus || 'idle',
      srAttempt: Number.isFinite(Number(input.srAttempt)) ? Number(input.srAttempt) : 0,
      srMaxAttempts: Number.isFinite(Number(input.srMaxAttempts)) ? Number(input.srMaxAttempts) : 0,
      srError: '',
      srTranscript: '',
      sparcNodeValues: input.sparcNodeValues && typeof input.sparcNodeValues === 'object'
        ? input.sparcNodeValues
        : {},
      feedbackVisible: input.subset.feedbackVisible,
      isCorrect: feedbackIsCorrect,
      isTimeout: Boolean(input.isTimeout),
      correctAnswer: input.correctAnswer,
      correctAnswerImageSrc,
      correctLabelText: input.deliverySettings.correctLabelText,
      incorrectLabelText: input.deliverySettings.incorrectLabelText,
      feedbackMessage: input.feedbackMessage || '',
      forceCorrectPrompt: input.deliverySettings.forceCorrectPrompt || 'Please type the correct answer to continue',
      correctColor: input.correctColor || input.deliverySettings.correctColor,
      incorrectColor: input.deliverySettings.incorrectColor,
      displayCorrectFeedback: Boolean(input.displayCorrectFeedback),
      displayIncorrectFeedback: Boolean(input.displayIncorrectFeedback),
      displayUserAnswerInFeedback: input.deliverySettings.displayUserAnswerInFeedback,
      feedbackLayout: input.deliverySettings.feedbackLayout,
      displayCorrectAnswerInIncorrectFeedback: input.deliverySettings.displayCorrectAnswerInIncorrectFeedback,
      replayEnabled: input.subset.replayEnabled,
    },
  };
}
