import { deliverySettingsStore } from '../../lib/state/deliverySettingsStore';
import { doubleMetaphone } from 'double-metaphone';
import {
  assessLearnerResponse,
  branchingCorrectText,
  buildClozeStudy,
  displayResponseAnswer,
  type ResponseAssessmentResult,
} from '../../../../learning-components/content/response-assessment/responseAssessment';
import type { LearnerResponseNormalizationOptions } from '../../../../learning-components/content/response-normalization/learnerResponseNormalization';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';

export { Answers };

function answerAssessText(
  key: Parameters<typeof translatePlatformString>[1],
  values?: Parameters<typeof translatePlatformString>[2],
): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function projectFeedback(result: ResponseAssessmentResult): string {
  if (result.matchKind === 'branch') {
    const authoredFeedback = result.authoredFeedback ?? '';
    return result.branchWasClose ? `${authoredFeedback} (you were close enough)` : authoredFeedback;
  }
  if (result.matchKind === 'close') {
    return answerAssessText('feedback.closeEnoughToCorrectAnswer', { answer: result.displayAnswer });
  }
  if (result.matchKind === 'phonetic') {
    return `That sounds like the answer but you're writing it the wrong way, the correct answer is '${result.displayAnswer}'.`;
  }
  return result.isCorrect
    ? `${answerAssessText('feedback.correct')}.`
    : `${answerAssessText('feedback.incorrect')}.`;
}

export interface AppResponseAssessmentRequest {
  readonly userInput: string;
  readonly answer: string;
  readonly originalAnswer: string;
  readonly displayedAnswer: string;
  readonly editDistanceThreshold: unknown;
  readonly branchingEnabled: boolean;
  readonly allowPhoneticMatching: boolean;
  readonly checkOtherAnswers: boolean;
  readonly otherAnswers: readonly string[];
  readonly normalization?: LearnerResponseNormalizationOptions;
}

function appAssessmentPolicy(request: AppResponseAssessmentRequest) {
  const phoneticMatch = (left: string, right: string) => {
    const leftCodes = doubleMetaphone(left);
    const rightCodes = doubleMetaphone(right);
    return leftCodes[0] === rightCodes[0]
      || leftCodes[0] === rightCodes[1]
      || Boolean(leftCodes[1] && (leftCodes[1] === rightCodes[0] || leftCodes[1] === rightCodes[1]));
  };
  return {
    branchingEnabled: request.branchingEnabled,
    allowPhoneticMatching: request.allowPhoneticMatching,
    checkOtherAnswers: request.checkOtherAnswers,
    editDistanceThreshold: Number.parseFloat(String(request.editDistanceThreshold || 0)),
    ...(request.normalization ? { normalization: request.normalization } : {}),
    otherAnswers: request.otherAnswers,
    phoneticMatch,
  };
}

const Answers = {
  branchingCorrectText,

  getDisplayAnswerText(answer: string) {
    return displayResponseAnswer(answer, Boolean(deliverySettingsStore.get().branchingEnabled));
  },

  clozeStudy(question: string, answer: string) {
    return buildClozeStudy(question, answer, Boolean(deliverySettingsStore.get().branchingEnabled));
  },

  async answerIsCorrect(request: AppResponseAssessmentRequest) {
    const result = assessLearnerResponse({
      userInput: request.userInput,
      answer: request.answer,
      originalAnswer: request.originalAnswer,
      displayedAnswer: request.displayedAnswer,
      policy: appAssessmentPolicy(request),
    });
    return { isCorrect: result.isCorrect, matchText: projectFeedback(result) };
  },
};
