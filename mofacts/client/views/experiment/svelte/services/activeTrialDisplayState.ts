import {
  cloneDisplay,
  type TrialDisplayContent,
  type TrialSubsetKind,
} from './trialDisplayState';

export interface ActiveTrialDisplayValues {
  readonly display: TrialDisplayContent;
  readonly displayCorrectFeedback: boolean;
  readonly displayIncorrectFeedback: boolean;
  readonly displayVisible: boolean;
  readonly feedbackCorrectAnswer: string;
  readonly feedbackCorrectColor: unknown;
  readonly feedbackIsCorrect: boolean;
  readonly feedbackText: unknown;
  readonly feedbackVisible: boolean;
  readonly isForceCorrecting: boolean;
  readonly responseVisible: boolean;
  readonly showSkipStudyButton: boolean;
  readonly trialSubsetKind: TrialSubsetKind;
}

export interface ActiveTrialDisplaySnapshot {
  readonly active: ActiveTrialDisplayValues;
  readonly frozen: ActiveTrialDisplayValues;
}

export interface ActiveTrialCurrentDisplayInput {
  readonly correctColor: unknown;
  readonly currentAnswer: unknown;
  readonly currentDisplay: TrialDisplayContent;
  readonly displayCorrectFeedback: unknown;
  readonly displayIncorrectFeedback: unknown;
  readonly feedbackMessage: unknown;
  readonly formatAnswerText: (answer: string) => string;
  readonly h5pOwnsResponse: boolean;
  readonly isCorrect: unknown;
  readonly isForceCorrecting: boolean;
  readonly isStudyState: boolean;
  readonly originalAnswer: unknown;
  readonly skipStudyEnabled: boolean;
  readonly sparcSessionOwnsResponse: boolean;
  readonly studyInteractionText: unknown;
  readonly trialSubsetKind: TrialSubsetKind;
}

function stringOrEmpty(value: unknown): string {
  return value == null ? '' : String(value);
}

export function createInitialActiveTrialDisplayValues(): ActiveTrialDisplayValues {
  return {
    display: cloneDisplay({}),
    displayCorrectFeedback: true,
    displayIncorrectFeedback: true,
    displayVisible: false,
    feedbackCorrectAnswer: '',
    feedbackCorrectColor: 'var(--feedback-correct-color)',
    feedbackIsCorrect: false,
    feedbackText: '',
    feedbackVisible: false,
    isForceCorrecting: false,
    responseVisible: false,
    showSkipStudyButton: false,
    trialSubsetKind: 'none',
  };
}

export function buildActiveTrialCurrentDisplayValues(
  input: ActiveTrialCurrentDisplayInput,
): ActiveTrialDisplayValues {
  const rawAnswer = stringOrEmpty(input.originalAnswer || input.currentAnswer);
  const fallbackAnswer = stringOrEmpty(input.currentAnswer);
  const studyAnswerText = input.isStudyState
    ? input.formatAnswerText(rawAnswer) || fallbackAnswer
    : '';
  const feedbackCorrectAnswer = input.formatAnswerText(rawAnswer) || fallbackAnswer;
  const displayVisible = input.trialSubsetKind !== 'none';
  const feedbackVisible = input.trialSubsetKind === 'feedback' || input.trialSubsetKind === 'study';

  return {
    display: input.currentDisplay,
    displayCorrectFeedback: input.isStudyState ? true : Boolean(input.displayCorrectFeedback),
    displayIncorrectFeedback: input.isStudyState ? false : Boolean(input.displayIncorrectFeedback),
    displayVisible,
    feedbackCorrectAnswer,
    feedbackCorrectColor: input.isStudyState ? 'var(--app-text-color)' : input.correctColor,
    feedbackIsCorrect: input.isStudyState ? true : Boolean(input.isCorrect),
    feedbackText: input.isStudyState
      ? (input.studyInteractionText || studyAnswerText)
      : input.feedbackMessage,
    feedbackVisible,
    isForceCorrecting: input.isForceCorrecting,
    responseVisible: !input.h5pOwnsResponse &&
      !input.sparcSessionOwnsResponse &&
      (input.trialSubsetKind === 'question' || input.trialSubsetKind === 'forceCorrect'),
    showSkipStudyButton: input.isStudyState && input.skipStudyEnabled,
    trialSubsetKind: input.trialSubsetKind,
  };
}

export function buildActiveTrialDisplaySnapshot(params: {
  readonly current: ActiveTrialDisplayValues;
  readonly isOutgoingFreezeState: boolean;
  readonly previousFrozen: ActiveTrialDisplayValues;
}): ActiveTrialDisplaySnapshot {
  if (params.isOutgoingFreezeState) {
    return {
      active: params.previousFrozen,
      frozen: params.previousFrozen,
    };
  }

  const frozen = cloneValues(params.current);
  return {
    active: frozen,
    frozen,
  };
}

function cloneValues(value: ActiveTrialDisplayValues): ActiveTrialDisplayValues {
  return {
    ...value,
    display: cloneDisplay(value.display),
  };
}

export function createActiveTrialDisplayStateController(
  initialFrozen: ActiveTrialDisplayValues = createInitialActiveTrialDisplayValues(),
): {
  readonly buildSnapshot: (params: {
    readonly current: ActiveTrialDisplayValues;
    readonly isOutgoingFreezeState: boolean;
  }) => ActiveTrialDisplaySnapshot;
  readonly getFrozen: () => ActiveTrialDisplayValues;
} {
  let frozen = cloneValues(initialFrozen);

  return {
    buildSnapshot(params) {
      const snapshot = buildActiveTrialDisplaySnapshot({
        current: params.current,
        isOutgoingFreezeState: params.isOutgoingFreezeState,
        previousFrozen: frozen,
      });
      frozen = snapshot.frozen;
      return snapshot;
    },
    getFrozen() {
      return cloneValues(frozen);
    },
  };
}
