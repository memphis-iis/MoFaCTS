import { buildIncomingTrialSlotKey } from './incomingTrialSlotController';
import {
  buildTrialContentProps,
  type TrialContentDeliverySettings,
  type TrialContentPropsBuildResult,
  type TrialLikeForContentProps,
} from './trialContentProps';

export interface IncomingTrialSlotDisplaySnapshot {
  readonly expectedFeedbackBlockerSrc: string;
  readonly expectedStimulusBlockerSrc: string;
  readonly preparedSubsetKind: 'none' | 'question' | 'study';
  readonly slot: TrialContentPropsBuildResult | null;
  readonly slotKey: string;
}

export interface IncomingTrialSlotDisplayInput {
  readonly defaultInputMode: string;
  readonly deliverySettings: TrialContentDeliverySettings;
  readonly formatAnswerText: (answer: string) => string;
  readonly layoutMode: unknown;
  readonly performanceCurrentTrial: unknown;
  readonly preparedTrial: (TrialLikeForContentProps & {
    readonly testType?: unknown;
    readonly questionIndex?: unknown;
  }) | null | undefined;
  readonly skipStudyEnabled: boolean;
}

function preparedSubsetKind(
  preparedTrial: IncomingTrialSlotDisplayInput['preparedTrial'],
): IncomingTrialSlotDisplaySnapshot['preparedSubsetKind'] {
  if (!preparedTrial) {
    return 'none';
  }
  return String(preparedTrial.testType || '').trim().toLowerCase() === 's'
    ? 'study'
    : 'question';
}

export function buildIncomingTrialSlotDisplaySnapshot(
  input: IncomingTrialSlotDisplayInput,
): IncomingTrialSlotDisplaySnapshot {
  const kind = preparedSubsetKind(input.preparedTrial);
  const slot = input.preparedTrial
    ? buildTrialContentProps({
        defaultInputMode: input.defaultInputMode,
        deliverySettings: input.deliverySettings,
        formatAnswerText: input.formatAnswerText,
        layoutMode: input.layoutMode,
        slotState: {
          kind,
          displayVisible: kind !== 'none',
          feedbackVisible: kind === 'study',
          responseVisible: kind === 'question',
          isForceCorrecting: false,
          showQuestionNumber: input.deliverySettings.displayQuestionNumber,
          questionNumber: (Number(input.performanceCurrentTrial) || 0) + 1,
          replayEnabled: kind === 'question',
          showSkipStudyButton: kind === 'study' && input.skipStudyEnabled,
          inputEnabled: false,
          userAnswer: '',
          feedbackUserAnswer: '',
          srStatus: 'idle',
          srAttempt: 0,
          srMaxAttempts: 0,
          isCorrect: kind === 'study',
          isTimeout: false,
          feedbackMessage: '',
          correctColor: kind === 'study'
            ? 'var(--app-text-color)'
            : input.deliverySettings.correctColor,
          displayCorrectFeedback: kind === 'study'
            ? true
            : input.deliverySettings.displayCorrectFeedback,
          displayIncorrectFeedback: kind === 'study'
            ? false
            : input.deliverySettings.displayIncorrectFeedback,
        },
        trialLike: input.preparedTrial,
      })
    : null;
  const expectedStimulusBlockerSrc = slot?.expectedStimulusBlockerSrc || '';
  const expectedFeedbackBlockerSrc = slot?.expectedFeedbackBlockerSrc || '';

  return {
    expectedFeedbackBlockerSrc,
    expectedStimulusBlockerSrc,
    preparedSubsetKind: kind,
    slot,
    slotKey: buildIncomingTrialSlotKey({
      preparedTrial: input.preparedTrial || null,
      slot,
    }),
  };
}
