type FeedbackSetting = boolean | 'onCorrect' | 'onIncorrect' | null | undefined;

type FeedbackHtmlContext = {
  message?: string;
  isCorrectAnswer?: boolean;
  isTimeoutAnswer?: boolean;
  showUserAnswer?: boolean;
  showSimpleFeedback?: boolean;
  userAnswerText?: string;
  correctAnswerText?: string;
  displayCorrectAnswer?: boolean;
  correctAnswerImage?: string;
  singleLine?: boolean;
};

type FeedbackBuildContext = {
  uiSettings?: Record<string, unknown>;
  testType?: string;
  feedbackMessage?: string;
  isCorrect?: boolean;
  isTimeout?: boolean;
  buttonTrial?: boolean;
  originalAnswer?: string;
  userAnswer?: string;
  currentAnswer?: string;
};

function stripTags(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function isImagePath(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  const imageExtensions = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i;
  return imageExtensions.test(value.trim());
}

function formatLabel(text: string): string {
  return `<b class="feedback-label">${text}</b>`;
}

function shouldShow(setting: FeedbackSetting, isCorrectAnswer: boolean | undefined): boolean {
  if (setting === true) return true;
  if (setting === false || setting == null) return false;
  if (setting === 'onCorrect') return isCorrectAnswer === true;
  if (setting === 'onIncorrect') return isCorrectAnswer !== true;
  return false;
}

function buildFeedbackHtml({
  message,
  isCorrectAnswer,
  isTimeoutAnswer,
  showUserAnswer,
  showSimpleFeedback,
  userAnswerText,
  correctAnswerText,
  displayCorrectAnswer,
  correctAnswerImage,
  singleLine,
}: FeedbackHtmlContext): string {
  const separator = singleLine ? ' ' : '<br>';
  const imageSeparator = '<br>';
  const correctLabel = formatLabel('Correct.');
  const incorrectLabel = formatLabel('Incorrect.');
  const hasCorrectImage = !isCorrectAnswer && !!correctAnswerImage;
  const allowLabelStyling = !hasCorrectImage;
  const displayUserAnswer = showUserAnswer && !hasCorrectImage;
  const displaySimpleFeedback = showSimpleFeedback && !hasCorrectImage;

  let formatted = message || '';

  if (hasCorrectImage) {
    formatted = 'Incorrect. The correct response is displayed below.';
  }

  if (displaySimpleFeedback) {
    formatted = isCorrectAnswer ? correctLabel : incorrectLabel;
  } else if (allowLabelStyling) {
    formatted = formatted.replace(/Correct\./g, correctLabel);
    formatted = formatted.replace(/Incorrect\./g, incorrectLabel);
    const trimmed = stripTags(formatted).trim();
    if (trimmed === 'Correct') {
      formatted = correctLabel;
    } else if (trimmed === 'Incorrect') {
      formatted = incorrectLabel;
    }

    if (isTimeoutAnswer && !stripTags(formatted).includes('Incorrect.')) {
      formatted = formatted
        ? `${incorrectLabel}${separator}${formatted}`
        : incorrectLabel;
    }
  }

  const segments = [];
  if (displayUserAnswer && userAnswerText) {
    segments.push(`Your answer: ${userAnswerText}.`);
  }

  if (formatted) {
    segments.push(formatted);
  }

  if (
    !isCorrectAnswer &&
    displayCorrectAnswer &&
    !displaySimpleFeedback &&
    !hasCorrectImage &&
    correctAnswerText
  ) {
    segments.push(`Correct answer: ${correctAnswerText}.`);
  }

  let html = segments.join(separator);

  if (hasCorrectImage) {
    const imageTag = `<img src="${correctAnswerImage}" alt="Correct answer image" class="feedback-image">`;
    html = html ? `${html}${imageSeparator}${imageTag}` : imageTag;
  }

  return html;
}

function buildFeedbackText(context: FeedbackBuildContext = {}): string {
  const uiSettings = context.uiSettings || {};

  if (context.testType === 't' || context.testType === 's') {
    return '';
  }

  let baseMessage = context.feedbackMessage;
  if (!baseMessage) {
    baseMessage = context.isCorrect
      ? String((uiSettings as Record<string, unknown>).correctMessage || 'Correct.')
      : String((uiSettings as Record<string, unknown>).incorrectMessage || 'Incorrect.');
  }

  if (context.isTimeout && (uiSettings as Record<string, unknown>).incorrectMessage) {
    baseMessage = String((uiSettings as Record<string, unknown>).incorrectMessage);
  }

  let text = baseMessage || '';

  const hasCorrectImage = !context.isCorrect && context.buttonTrial &&
    isImagePath(context.originalAnswer || '');
  if (hasCorrectImage) {
    text = 'Incorrect. The correct response is displayed below.';
  }

  const showUserAnswer = shouldShow(
    (uiSettings as Record<string, unknown>).displayUserAnswerInFeedback as FeedbackSetting,
    context.isCorrect
  );
  const showSimpleFeedback = shouldShow((uiSettings as Record<string, unknown>).onlyShowSimpleFeedback as FeedbackSetting, context.isCorrect);

  const htmlContext: FeedbackHtmlContext = {
    message: text,
    showUserAnswer,
    showSimpleFeedback,
    userAnswerText: context.userAnswer || '',
    correctAnswerText: context.currentAnswer || context.originalAnswer || '',
    displayCorrectAnswer: Boolean((uiSettings as Record<string, unknown>).displayCorrectAnswerInIncorrectFeedback),
    correctAnswerImage: hasCorrectImage ? 'image' : '',
    singleLine: Boolean((uiSettings as Record<string, unknown>).singleLineFeedback),
  };
  if (context.isCorrect !== undefined) {
    htmlContext.isCorrectAnswer = context.isCorrect;
  }
  if (context.isTimeout !== undefined) {
    htmlContext.isTimeoutAnswer = context.isTimeout;
  }

  const html = buildFeedbackHtml(htmlContext);

  return stripTags(html);
}

export {
  buildFeedbackHtml,
  buildFeedbackText,
  shouldShow,
  stripTags,
};

