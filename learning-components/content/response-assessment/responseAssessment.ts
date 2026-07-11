import {
  normalizeLearnerResponseText,
  type LearnerResponseNormalizationOptions,
} from '../response-normalization/learnerResponseNormalization';

export type ResponseMatchKind = 'exact' | 'close' | 'phonetic' | 'incorrect' | 'branch';

export interface ResponseAssessmentPolicy {
  readonly branchingEnabled: boolean;
  readonly allowPhoneticMatching: boolean;
  readonly checkOtherAnswers: boolean;
  readonly editDistanceThreshold: number;
  readonly normalization?: LearnerResponseNormalizationOptions;
  readonly otherAnswers?: readonly string[];
  readonly phoneticMatch?: (left: string, right: string) => boolean;
}

export interface ResponseAssessmentInput {
  readonly userInput: string;
  readonly answer: string;
  readonly originalAnswer: string;
  readonly displayedAnswer: string;
  readonly policy: ResponseAssessmentPolicy;
}

export interface ResponseAssessmentResult {
  readonly isCorrect: boolean;
  readonly matchKind: ResponseMatchKind;
  readonly displayAnswer: string;
  readonly authoredFeedback?: string;
  readonly branchWasClose?: boolean;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1]!
        : Math.min(previous[rightIndex - 1]!, previous[rightIndex]!, current[rightIndex - 1]!) + 1;
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function isBranched(answer: string, policy: ResponseAssessmentPolicy): boolean {
  return answer.trim().includes(';') && policy.branchingEnabled;
}

export function branchingCorrectText(answer: string): string {
  const firstBranch = answer.trim().split(';')[0] ?? '';
  const matchExpression = firstBranch.split('~').length === 2 ? firstBranch.split('~')[0] ?? '' : '';
  return matchExpression.split('|')[0] ?? '';
}

export function displayResponseAnswer(answer: string, branchingEnabled: boolean): string {
  if (isBranched(answer, {
    branchingEnabled,
    allowPhoneticMatching: false,
    checkOtherAnswers: false,
    editDistanceThreshold: 0,
  })) return branchingCorrectText(answer);
  return (answer.trim().split('|')[0] ?? '').trim();
}

export function buildClozeStudy(question: string, answer: string, branchingEnabled: boolean): string {
  return question.replace(/___+/g, displayResponseAnswer(answer, branchingEnabled));
}

function matchesOtherAnswer(userAnswer: string, correctAnswer: string, policy: ResponseAssessmentPolicy): boolean {
  const normalizedUser = normalizeLearnerResponseText(userAnswer, policy.normalization);
  return (policy.otherAnswers ?? [])
    .filter((answer) => answer !== correctAnswer)
    .some((answer) => (answer.trim().split(';')[0] ?? '').trim().split('|')
      .filter(Boolean)
      .some((alternative) => normalizeLearnerResponseText(alternative, policy.normalization) === normalizedUser));
}

function matchLiteral(userAnswer: string, candidate: string, fullAnswer: string, policy: ResponseAssessmentPolicy): ResponseMatchKind {
  const normalizedUser = normalizeLearnerResponseText(userAnswer, policy.normalization);
  const normalizedCandidate = normalizeLearnerResponseText(candidate, policy.normalization);
  if (normalizedUser === normalizedCandidate) return 'exact';
  if (!(policy.editDistanceThreshold > 0)) return 'incorrect';
  if (policy.checkOtherAnswers && matchesOtherAnswer(normalizedUser, fullAnswer, policy)) return 'incorrect';
  const denominator = Math.max(normalizedUser.length, normalizedCandidate.length);
  const score = denominator === 0 ? 1 : 1 - editDistance(normalizedUser, normalizedCandidate) / denominator;
  if (score >= policy.editDistanceThreshold) return 'close';
  if (policy.allowPhoneticMatching && policy.phoneticMatch?.(normalizedUser, normalizedCandidate)) return 'phonetic';
  return 'incorrect';
}

function matchExpression(expression: string, userAnswer: string, fullAnswer: string, policy: ResponseAssessmentPolicy): ResponseMatchKind {
  if (policy.editDistanceThreshold > 0 && /^[|A-Za-z0-9 -]+$/i.test(expression)) {
    for (const candidate of expression.trim().split('|').filter(Boolean)) {
      const result = matchLiteral(userAnswer, candidate, fullAnswer, policy);
      if (result !== 'incorrect') return result;
    }
    return 'incorrect';
  }
  return new RegExp(expression).test(userAnswer) ? 'exact' : 'incorrect';
}

function assessSingle(userAnswer: string, answer: string, originalAnswer: string, policy: ResponseAssessmentPolicy): ResponseAssessmentResult {
  const displayAnswer = displayResponseAnswer(originalAnswer, policy.branchingEnabled);
  if (isBranched(answer, policy)) {
    const normalizedUser = normalizeLearnerResponseText(userAnswer, policy.normalization);
    for (const [index, branch] of answer.trim().split(';').entries()) {
      const fields = branch.trim().split('~');
      if (fields.length !== 2) continue;
      const expression = normalizeLearnerResponseText(fields[0] ?? '', policy.normalization);
      const result = matchExpression(expression, normalizedUser, answer, policy);
      if (result !== 'incorrect') {
        return {
          isCorrect: index === 0,
          matchKind: 'branch',
          displayAnswer,
          authoredFeedback: (fields[1] ?? '').trim(),
          branchWasClose: result === 'close',
        };
      }
    }
    return { isCorrect: false, matchKind: 'branch', displayAnswer };
  }

  if (!userAnswer) return { isCorrect: false, matchKind: 'incorrect', displayAnswer };
  for (const candidate of originalAnswer.trim().split('|').filter(Boolean)) {
    const result = matchLiteral(userAnswer, candidate, originalAnswer, policy);
    if (result !== 'incorrect') return { isCorrect: true, matchKind: result, displayAnswer };
  }
  return { isCorrect: false, matchKind: 'incorrect', displayAnswer };
}

export function assessLearnerResponse(input: ResponseAssessmentInput): ResponseAssessmentResult {
  let primary = assessSingle(input.userInput.trim(), input.answer, input.originalAnswer, input.policy);
  if (!primary.isCorrect && !isBranched(input.answer, input.policy)) {
    const answerWordCount = input.answer.split(' ').length;
    const userWords = input.userInput.split(' ');
    for (const candidate of [
      userWords.slice(0, answerWordCount).join(' '),
      userWords.slice(answerWordCount).join(' '),
    ]) {
      const repeatedPart = assessSingle(candidate, input.originalAnswer, input.originalAnswer, input.policy);
      if (repeatedPart.isCorrect) {
        primary = repeatedPart;
        break;
      }
    }
  }
  if (primary.isCorrect || !input.originalAnswer) return primary;

  const concatenated = assessSingle(
    input.displayedAnswer + input.userInput,
    input.originalAnswer,
    input.originalAnswer,
    input.policy,
  );
  if (concatenated.isCorrect && concatenated.matchKind !== 'close') return concatenated;
  return assessSingle(
    `${input.displayedAnswer} ${input.userInput}`,
    input.originalAnswer,
    input.originalAnswer,
    input.policy,
  );
}
